<template>
  <div class="engine-subform">
    <!-- 子表单标题（含整体必填标识） -->
    <div v-if="title" class="engine-subform__header">
      <span v-if="required" class="engine-subform__star">*</span>
      <span class="engine-subform__title">{{ title }}</span>
    </div>

    <!-- 空态：无子字段，或全部子字段被隐藏（不报错，不影响其余字段渲染） -->
    <el-empty
      v-if="!visibleColumns.length"
      class="engine-subform__empty"
      :description="emptyDescription"
      :image-size="60"
    />

    <template v-else>
      <el-table
        ref="tableRef"
        :data="rows"
        row-key="__rowKey"
        border
        size="small"
        class="engine-subform__table"
        empty-text="暂无明细"
        @selection-change="onSelectionChange"
      >
        <!-- 首列：开启批量删除时为勾选列（含表头全选），否则为行序号；
             恒左冻结，不随用户配置的固定列数变化（design D9） -->
        <el-table-column
          v-if="batchRemoveEnabled"
          type="selection"
          width="44"
          align="center"
          fixed="left"
        />
        <el-table-column v-else type="index" label="#" width="48" align="center" fixed="left" />

        <!-- 动态列：一个子字段一列，列头带必填标识；隐藏的子字段不呈现；按固定左/右列数施加 fixed -->
        <el-table-column
          v-for="(col, ci) in visibleColumns"
          :key="col.field"
          :prop="col.field"
          min-width="160"
          :fixed="colFixed(ci)"
        >
          <template #header>
            <span v-if="col.required" class="engine-subform__star">*</span>
            <span>{{ col.title }}</span>
          </template>
          <template #default="{ row, $index }">
            <div
              class="engine-subform__cell"
              :class="{
                'is-readonly': cellReadonly(col),
                'has-error': !!cellError($index, col.field),
              }"
            >
              <FieldControl
                :node="col.node"
                :model-value="row[col.field]"
                :readonly="isReadonly"
                :data-sources="dataSources"
                @update:model-value="onCellUpdate(row, col, $event)"
              />
              <div v-if="cellError($index, col.field)" class="engine-subform__cell-error">
                {{ cellError($index, col.field) }}
              </div>
            </div>
          </template>
        </el-table-column>

        <!-- 行操作列：只读态不提供；恒右冻结以始终贴到右边缘（design D9）。
             行内删除以图标承载，列宽随之收窄 -->
        <el-table-column
          v-if="!isReadonly"
          label="操作"
          width="48"
          align="center"
          class-name="engine-subform__op-col"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="danger"
              size="small"
              class="engine-subform__row-remove"
              title="删除本行"
              aria-label="删除本行"
              :icon="Delete"
              :disabled="!canRemove"
              @click="removeRow(row)"
            />
          </template>
        </el-table-column>
      </el-table>

      <!-- 新增行入口 + 批量删除（仅开启时）+ 行数计数：只读态不提供。
           两个按钮保持同一风格（均为默认按钮），仅以图标与文案区分语义 -->
      <div v-if="!isReadonly" class="engine-subform__footer">
        <el-button size="small" :icon="Plus" :disabled="!canAdd" @click="addRow">新增</el-button>
        <el-button
          v-if="batchRemoveEnabled"
          size="small"
          :icon="Delete"
          :disabled="!canBatchRemove"
          @click="removeSelectedRows"
          >{{ batchRemoveText }}</el-button
        >
        <span class="engine-subform__count">{{ rows.length }} / {{ effectiveMax }}</span>
      </div>

      <!-- 整体级校验错误（如整体必填） -->
      <div v-if="overallError" class="engine-subform__overall-error">{{ overallError }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 子表单明细表格（自研，design D1）：el-table + 动态列（一列一子字段）、行=记录、
 * 行序号列、行操作列，单元格复用共享 FieldControl 保持与主表控件一致（design D3）。
 * 固定列（design D9）：首列（勾选/序号）与末列（行操作）恒定冻结在左右边缘，不受用户配置影响；
 * 数据列按 fixedLeftColumns/fixedRightColumns 施加 fixed，左右合计超列数时钳制。
 *
 * 行删除：行内以图标按钮逐行删除；开启 allowBatchRemove 后首列由序号变为勾选列，
 * 底部多出「删除」按钮按勾选批量删除（未勾选时禁用），只读态两者均不提供。
 * 底部「新增」与「删除」保持同一按钮风格且间距收窄（抵消 Element Plus 相邻按钮的 12px 左边距）。
 *
 * 行与数据：隐藏的子字段不在明细中呈现（不占列位），但其值仍随行数据对外输出（见 `columns`/`stripRow`），
 * 与主表隐藏字段同一口径；固定列仅针对可见列钳制。
 *
 * 只读：子表单整体只读（含整表只读下发）与子字段自身只读共用一套口径（`cellReadonly`）——
 * 前者收起增删行入口且禁用全部单元格，后者仅禁用本列单元格（行增删与其他列不受影响）；
 * 不可修改由控件的 disabled 承载，与主表只读字段同一表现（design D3 统一渲染单轨）。
 *
 * 值协议：以对象数组承载 modelValue（键为子字段 field），行对象内部携带自增 `__rowKey`
 * 作为表格 :key 以避免行组件复用导致的串值，`__rowKey` 在对外 emit 前剥离（design 风险项），
 * 同时作为批量删除的勾选行定位依据。
 * 行数：初始按 minRows（未配置按 0，不预置行）展开空行、达 effectiveMax 禁增；删除不受最少行数
 * 限制，可一直删至 0 行；effectiveMax = min(maxRows ?? 200, 500)（design D7）。只读态无增删入口且单元格不可修改。
 * 对应 specs/form-renderer「子表单明细渲染 / 行增删与行数限制 / 只读与重置」、task 4.1-4.5。
 */
import { computed, inject, ref, watch, type Ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import FieldControl from '@/components/FieldControl.vue'
import type { SubFormErrorItem } from '@/renderer/subformValidation'
import {
  SUBFORM_DEFAULT_MAX_ROWS,
  SUBFORM_MAX_ROWS,
  isDataField,
  isMultipleField,
  type DataFieldNode,
  type FieldOption,
} from '@/schema/types'

/** 行对象：子字段值 + 内部行标识（不对外输出） */
type Row = Record<string, unknown> & { __rowKey: number }

/** 明细列描述：由子字段节点派生（readonly 为该列自身的只读配置） */
interface Column {
  field: string
  title: string
  required: boolean
  readonly: boolean
  node: DataFieldNode
}

const props = withDefaults(
  defineProps<{
    /** 明细值（对象数组）；非数组按空明细容错处理（task 5.4） */
    modelValue?: unknown
    /** 子表单数据标识，用于在注入的 subFormErrors 中定位自身错误 */
    field?: string
    title?: string
    required?: boolean
    readonly?: boolean
    minRows?: number
    maxRows?: number
    /** 固定左列数：冻结左侧前 N 个数据列（design D9） */
    fixedLeftColumns?: number
    /** 固定右列数：冻结右侧后 N 个数据列（design D9） */
    fixedRightColumns?: number
    /** 允许批量删除：开启后首列为勾选列并在底部提供批量删除入口 */
    allowBatchRemove?: boolean
    subFields?: DataFieldNode[]
    dataSources?: { members?: FieldOption[]; departments?: FieldOption[] }
  }>(),
  {
    modelValue: () => [],
    field: '',
    title: '',
    required: false,
    readonly: false,
    minRows: undefined,
    maxRows: undefined,
    fixedLeftColumns: undefined,
    fixedRightColumns: undefined,
    allowBatchRemove: false,
    subFields: () => [],
    dataSources: () => ({}),
  },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>[]): void }>()

/** 注入由 FormRenderer 下发的子表单校验错误（按 field 分组）；独立使用时为空 */
const subFormErrors = inject<Ref<Record<string, SubFormErrorItem[]>>>(
  'subFormErrors',
  ref({}) as Ref<Record<string, SubFormErrorItem[]>>,
)

/** 本子表单的错误列表 */
const myErrors = computed<SubFormErrorItem[]>(() =>
  props.field ? (subFormErrors.value?.[props.field] ?? []) : [],
)
/** 整体级错误（rowIndex = -1，如整体必填） */
const overallError = computed(() => myErrors.value.find((e) => e.rowIndex === -1)?.message ?? '')

/** 单元格错误：按行序号与子字段 field 定位 */
function cellError(rowIndex: number, fieldKey: string): string {
  return (
    myErrors.value.find((e) => e.rowIndex === rowIndex && e.fieldKey === fieldKey)?.message ?? ''
  )
}

/** 正整数解析：非法/非正数返回 undefined（交由默认值兜底） */
function toPositiveInt(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

/** 列配置（数据列）：仅取合法常用数据子字段，顺序即列顺序。含隐藏列 —— 行数据的键集合以此为准，
 *  故隐藏子字段的已注入值不因不呈现而丢失 */
const columns = computed(() =>
  (props.subFields ?? [])
    .filter((n): n is DataFieldNode => !!n && isDataField(n))
    .map((n) => ({
      field: n.field,
      title: n.title ?? '',
      required: n.required === true && n.hidden !== true,
      /** 子字段自身配置的只读：仅禁用本列单元格，不影响其他列与行增删 */
      readonly: n.readonly === true,
      node: n,
    })),
)

/** 单元格是否只读：子表单整体只读（含整表只读）或该子字段自身只读 */
function cellReadonly(col: Column): boolean {
  return isReadonly.value || col.readonly
}

/** 呈现列：剔除静态隐藏（`hidden`）的子字段，即填报态看到的明细列集合，固定列也按此钳制 */
const visibleColumns = computed(() => columns.value.filter((col) => col.node.hidden !== true))

/** 空态文案：区分「尚未配子字段」与「子字段全部被隐藏」 */
const emptyDescription = computed(() =>
  columns.value.length
    ? '尚无可录入列：子字段已全部隐藏'
    : '尚无可录入列，请先在设计器为子表单添加子字段',
)

/** 非负整数解析：非法/负数/小数按 0（向下取整），供固定列钳制（design D9） */
function toNonNegInt(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** 生效左固定列数：不超过可见列数 */
const effectiveLeft = computed(() =>
  Math.min(toNonNegInt(props.fixedLeftColumns), visibleColumns.value.length),
)
/** 生效右固定列数：与左合计不超过可见列数（先满足左侧，右侧取剩余） */
const effectiveRight = computed(() =>
  Math.min(
    toNonNegInt(props.fixedRightColumns),
    Math.max(0, visibleColumns.value.length - effectiveLeft.value),
  ),
)
/** 数据列固定方向：前 effectiveLeft 列左固、后 effectiveRight 列右固，其余不固。
 *  首列（勾选/序号）与末列（行操作）不在此列 —— 二者在模板中恒定 fixed，不参与钳制 */
function colFixed(index: number): 'left' | 'right' | false {
  if (index < effectiveLeft.value) return 'left'
  if (index >= visibleColumns.value.length - effectiveRight.value) return 'right'
  return false
}

/** 最多行数：未配置按缺省 200，配置值不超过硬上限 SUBFORM_MAX_ROWS（500）（design D7） */
const effectiveMax = computed(() =>
  Math.min(toPositiveInt(props.maxRows) ?? SUBFORM_DEFAULT_MAX_ROWS, SUBFORM_MAX_ROWS),
)

/** 初始行数：未配置按 0（不预置行），且不超过 effectiveMax；仅用于初始空行预填，不作删除下限 */
const minRowsEff = computed(() => Math.min(toPositiveInt(props.minRows) ?? 0, effectiveMax.value))

const isReadonly = computed(() => props.readonly === true)
const canAdd = computed(() => !isReadonly.value && rows.value.length < effectiveMax.value)
// 删除不受最少行数限制，只要存在行即可删（可删至 0 行）；只读态禁删
const canRemove = computed(() => !isReadonly.value && rows.value.length > 0)
/** 批量删除是否生效：需显式开启且非只读（只读态无任何增删入口） */
const batchRemoveEnabled = computed(() => props.allowBatchRemove === true && !isReadonly.value)

const rows = ref<Row[]>([])
let keySeed = 0
/** 最近一次「对外 emit 或外部注入」的值 JSON，用于打断 modelValue 回声导致的重建 */
let lastSynced = '\u0000'
/** el-table 实例引用：仅用于清除勾选态（不为此引入 element-plus 类型依赖） */
const tableRef = ref<{ clearSelection?: () => void } | null>(null)
/** 已勾选行的内部行标识集合（行对象重建后仍可靠定位） */
const selectedKeys = ref<Set<number>>(new Set())
/** 批量删除可用：已勾选至少一行 */
const canBatchRemove = computed(() => batchRemoveEnabled.value && selectedKeys.value.size > 0)
/** 批量删除按钮文字：带出当前勾选行数 */
const batchRemoveText = computed(() =>
  selectedKeys.value.size > 0 ? `删除（${selectedKeys.value.size}）` : '删除',
)

function nextKey(): number {
  return ++keySeed
}

/** 子字段的空值：多选为 []，其余为 undefined（与 buildInitialData 归一化一致） */
function emptyValueFor(node: DataFieldNode): unknown {
  return isMultipleField(node.type) ? [] : undefined
}

/** 由外部数据（可能缺列）构造一行，缺失子字段补空值 */
function makeRow(source?: Record<string, unknown>): Row {
  const row: Row = { __rowKey: nextKey() }
  for (const col of columns.value) {
    row[col.field] = source && col.field in source ? source[col.field] : emptyValueFor(col.node)
  }
  return row
}

/** 对外输出：按列剥离 __rowKey 与非子字段键 */
function stripRow(row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of columns.value) out[col.field] = row[col.field]
  return out
}

/** 由外部值构造内部行：非数组容错为 []，不足 minRows 补空行 */
function buildRows(val: unknown): Row[] {
  const list = Array.isArray(val) ? val : []
  const built = list.map((item) =>
    makeRow(item && typeof item === 'object' ? (item as Record<string, unknown>) : undefined),
  )
  while (built.length < minRowsEff.value) built.push(makeRow())
  return built
}

/** 归一化外部值为数组用于比较（非数组视为 []） */
function normalizeJson(val: unknown): string {
  return JSON.stringify(Array.isArray(val) ? val : [])
}

watch(
  () => props.modelValue,
  (val) => {
    const incoming = normalizeJson(val)
    // 与上次同步值一致（含自身 emit 的回声）则保留行标识，避免重键串值/失焦
    if (incoming === lastSynced) return
    lastSynced = incoming
    rows.value = buildRows(val)
    // 行集合整体重建：旧行对象已失效，勾选态随之清空
    clearSelection()
  },
  { immediate: true, deep: true },
)

/** 子字段列表变化时补齐新列的空值（保持既有行标识） */
watch(columns, () => {
  for (const row of rows.value) {
    for (const col of columns.value) {
      if (!(col.field in row)) row[col.field] = emptyValueFor(col.node)
    }
  }
})

function emitValue(): void {
  const stripped = rows.value.map(stripRow)
  lastSynced = JSON.stringify(stripped)
  emit('update:modelValue', stripped)
}

function addRow(): void {
  if (!canAdd.value) return
  rows.value.push(makeRow())
  emitValue()
}

function removeRow(row: Row): void {
  if (!canRemove.value) return
  const idx = rows.value.findIndex((r) => r.__rowKey === row.__rowKey)
  if (idx === -1) return
  rows.value.splice(idx, 1)
  emitValue()
}

/** 勾选变更：仅记录内部行标识，不持有行对象引用 */
function onSelectionChange(selection: Row[]): void {
  selectedKeys.value = new Set((selection ?? []).map((r) => r.__rowKey))
}

/** 清空勾选：同步表格内部选中态，避免已删除/已重建的行残留为选中 */
function clearSelection(): void {
  selectedKeys.value = new Set()
  tableRef.value?.clearSelection?.()
}

/** 批量删除勾选行：一次移除并对外 emit，保留剩余行顺序与行标识 */
function removeSelectedRows(): void {
  if (!canBatchRemove.value) return
  const kept = rows.value.filter((r) => !selectedKeys.value.has(r.__rowKey))
  if (kept.length === rows.value.length) return
  rows.value = kept
  clearSelection()
  emitValue()
}

function onCellUpdate(row: Row, col: Column, value: unknown): void {
  // 只读单元格不落值：整体只读与子字段自身只读同一口径（控件已禁用，此处为兜底）
  if (cellReadonly(col)) return
  const target = rows.value.find((r) => r.__rowKey === row.__rowKey)
  if (!target) return
  target[col.field] = value
  emitValue()
}
</script>

<style scoped>
.engine-subform {
  width: 100%;
  /* 子表单 rule 为 native，不经 el-form-item 包裹（无默认 18px 下边距），
     此处自行补足底部留白，使与下一行字段的间距同其他组件一致 */
  margin-bottom: 18px;
}
.engine-subform__header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.engine-subform__star {
  color: var(--el-color-danger);
  margin-right: 2px;
}
.engine-subform__table {
  width: 100%;
}
/* 操作列：行内删除改为图标按钮，收窄单元格内边距以配合更窄的列宽 */
.engine-subform__table :deep(.engine-subform__op-col .cell) {
  padding: 0 4px;
}
.engine-subform__row-remove {
  padding: 4px;
}
.engine-subform__cell {
  width: 100%;
}
/* 只读单元格（整体只读或子字段自身只读）：不可修改由控件自身的 disabled 承载，
   与主表只读字段同一灰化表现；本类仅为只读单元格的结构标识 */
.engine-subform__cell.is-readonly {
  cursor: not-allowed;
}
.engine-subform__cell-error {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-color-danger);
}
.engine-subform__overall-error {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-color-danger);
}
.engine-subform__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
/* 按钮间距收窄：抵消 Element Plus `.el-button + .el-button` 默认的 12px 左边距，仅由 gap 控制 */
.engine-subform__footer :deep(.el-button + .el-button) {
  margin-left: 0;
}
.engine-subform__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.engine-subform__empty {
  padding: 8px 0;
}
</style>
