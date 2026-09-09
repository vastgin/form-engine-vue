<template>
  <div class="property-panel">
    <el-empty v-if="!node" description="请选择一个字段" :image-size="60" />
    <el-form v-else label-position="top" size="small" class="property-panel__form">
      <!-- 最顶部：标明当前选中的控件类型 -->
      <div class="property-panel__header">
        <el-icon class="property-panel__header-icon">
          <component :is="fieldIcon(node.type)" />
        </el-icon>
        <div class="property-panel__header-text">
          <span class="property-panel__header-type">{{ fieldTypeLabel(node.type) }}</span>
          <span class="property-panel__header-code">{{ node.type }}</span>
        </div>
        <el-tag v-if="isPublishedNode" size="small" type="success" effect="plain">已发布</el-tag>
        <el-tag size="small" :type="isDataLike ? 'primary' : 'info'" effect="plain">
          {{ isDataLike ? '数据字段' : '布局字段' }}
        </el-tag>
      </div>

      <div class="property-panel__section">字段属性</div>

      <!-- 标题：多标签页容器不展示（其 title 不参与渲染也不参校验，展示出来反而给出一个改不动的预期） -->
      <el-form-item v-if="!isTabs" label="标题">
        <el-input :model-value="node.title" @update:model-value="patch({ title: $event })" />
      </el-form-item>

      <!-- 字段标识：常用数据字段与子表单均有；已发布字段锁定不可改；命名不合法即时提示 -->
      <el-form-item v-if="isDataLike" label="字段标识">
        <el-input
          :model-value="dataNode.field"
          :disabled="fieldIdLocked"
          :title="FIELD_ID_RULE_TIP"
          @update:model-value="patch({ field: $event })"
        />
      </el-form-item>
      <p v-if="fieldIdProblem" class="property-panel__error">{{ fieldIdProblem }}</p>
      <p v-else-if="fieldIdLocked" class="property-panel__hint property-panel__hint--tight">
        已发布，字段标识不可修改（已有填报数据依赖该标识）
      </p>

      <!-- 占位提示 / 默认值：仅常用数据字段 -->
      <template v-if="isData">
        <el-form-item label="占位提示">
          <el-input
            :model-value="dataNode.placeholder"
            @update:model-value="patch({ placeholder: $event })"
          />
        </el-form-item>
        <el-form-item label="默认值">
          <el-input
            v-if="!isOptionType"
            :model-value="dataNode.value as string"
            @update:model-value="patch({ value: $event })"
          />
          <span v-else class="property-panel__hint">在下方「选项」的「默认」列中勾选</span>
        </el-form-item>
      </template>

      <!-- 必填 / 只读 / 隐藏：常用数据字段与子表单均有 -->
      <el-form-item v-if="isDataLike">
        <el-checkbox
          :model-value="!!dataNode.required"
          label="必填"
          @update:model-value="patch({ required: $event })"
        />
        <el-checkbox
          :model-value="!!dataNode.readonly"
          label="只读"
          @update:model-value="patch({ readonly: $event })"
        />
        <el-checkbox
          :model-value="!!dataNode.hidden"
          label="隐藏"
          title="填报时不展示该字段（子字段则不展示整列），但其值仍随表单提交；隐藏字段的必填与校验规则不生效"
          @update:model-value="patch({ hidden: $event })"
        />
      </el-form-item>
      <p v-if="hiddenHint" :class="hiddenHintClass">{{ hiddenHint }}</p>

      <!-- 字段宽度：仅常用数据字段可选（布局/容器/子表单恒整行） -->
      <el-form-item v-if="isData" label="字段宽度" class="property-panel__width">
        <el-radio-group
          :model-value="snapWidthPercent(node.width)"
          @update:model-value="patch({ width: $event as number })"
        >
          <el-radio-button v-for="opt in FIELD_WIDTH_OPTIONS" :key="opt.label" :value="opt.value">
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- 多标签页：直接列出各页签名称供填写（不单设分组标题）；
           页签的新增与删除在画布页签栏上完成 -->
      <template v-if="isTabs">
        <el-form-item v-for="(tab, index) in tabList" :key="tab.key" :label="`标签页 ${index + 1}`">
          <el-input
            :model-value="tab.title"
            @update:model-value="renameTabAt(index, String($event))"
          />
        </el-form-item>
      </template>

      <!-- 子表单专用：行数范围（含 200 上限钳制与冲突提示）+ 子字段列表入口（task 6.6） -->
      <template v-if="isSubForm">
        <div class="property-panel__section">行数范围</div>
        <el-form-item label="初始行数">
          <el-input-number
            :model-value="minRows"
            :min="0"
            :max="SUBFORM_MAX_ROWS"
            controls-position="right"
            @update:model-value="onMinRows"
          />
        </el-form-item>
        <p class="property-panel__hint">
          新建填报时预置的空行数；填报时可全部删除，不作为最少保留行数
        </p>
        <el-form-item label="最多行数">
          <el-input-number
            :model-value="maxRows"
            :min="1"
            controls-position="right"
            @update:model-value="onMaxRows"
          />
        </el-form-item>
        <div v-if="maxRowsClampHint" class="property-panel__warn">{{ maxRowsClampHint }}</div>
        <div v-if="rowConflictHint" class="property-panel__error">{{ rowConflictHint }}</div>

        <div class="property-panel__section">固定列</div>
        <el-form-item label="固定左列数">
          <el-input-number
            :model-value="fixedLeft"
            :min="0"
            :max="subFieldCount"
            controls-position="right"
            @update:model-value="onFixedLeft"
          />
        </el-form-item>
        <el-form-item label="固定右列数">
          <el-input-number
            :model-value="fixedRight"
            :min="0"
            :max="subFieldCount"
            controls-position="right"
            @update:model-value="onFixedRight"
          />
        </el-form-item>
        <div v-if="fixedColumnHint" class="property-panel__warn">{{ fixedColumnHint }}</div>
        <p v-else class="property-panel__hint">
          横向滚动时冻结左侧前 N / 右侧后 N 个数据列，左+右合计不超过 {{ subFieldCount }} 列；
          首列（序号/勾选）与末列（操作）恒定冻结，无需配置
        </p>

        <div class="property-panel__section">行操作</div>
        <el-form-item label="允许批量删除">
          <el-switch :model-value="allowBatchRemove" @update:model-value="onBatchRemove" />
        </el-form-item>
        <p class="property-panel__hint">
          开启后填报时序号列变为勾选框，底部多出「删除」按钮可一次删除所选行
        </p>

        <div class="property-panel__section">子字段（{{ subFields.length }}）</div>
        <ul class="property-panel__subfields">
          <li v-for="sf in subFields" :key="sf.key" class="property-panel__subfield">
            <el-icon><component :is="fieldIcon(sf.type)" /></el-icon>
            <span>{{ sf.title || fieldTypeLabel(sf.type) }}</span>
          </li>
        </ul>
        <p class="property-panel__hint">在画布明细表格中新增 / 复制 / 删除 / 拖拽排序子字段</p>

        <!-- 已有字段：已移除但保留定义的子字段，加回入口在画布明细下方 -->
        <template v-if="pooledSubFields.length">
          <div class="property-panel__section">已有字段（{{ pooledSubFields.length }}）</div>
          <ul class="property-panel__subfields">
            <li v-for="p in pooledSubFields" :key="p.key" class="property-panel__subfield">
              <el-icon><component :is="fieldIcon(p.type)" /></el-icon>
              <span>{{ p.title || fieldTypeLabel(p.type) }}</span>
              <span class="property-panel__code">{{ p.field }}</span>
            </li>
          </ul>
          <p class="property-panel__hint">已从明细移除但保留定义，可在画布「已有字段」中原样加回</p>
        </template>
      </template>

      <!-- 字段类型专属配置 -->
      <template v-if="propEditors.length">
        <div class="property-panel__section">类型配置</div>
        <el-form-item v-for="ed in propEditors" :key="ed.key" :label="ed.label">
          <OptionsEditor
            v-if="ed.editor === 'options'"
            :model-value="dataNode.options ?? []"
            :multiple="isMultipleOptionField"
            :default-value="dataNode.value"
            @update:model-value="patch({ options: $event })"
            @update:default-value="patch({ value: $event })"
          />
          <el-input
            v-else-if="ed.editor === 'text'"
            :model-value="propValue(ed.key) as string"
            @update:model-value="patchProp(ed.key, $event)"
          />
          <el-input
            v-else-if="ed.editor === 'textarea'"
            type="textarea"
            :rows="3"
            :model-value="propValue(ed.key) as string"
            @update:model-value="patchProp(ed.key, $event)"
          />
          <el-input-number
            v-else-if="ed.editor === 'number'"
            :model-value="propValue(ed.key) as number"
            controls-position="right"
            @update:model-value="patchProp(ed.key, $event)"
          />
          <el-switch
            v-else-if="ed.editor === 'switch'"
            :model-value="propValue(ed.key) as boolean"
            @update:model-value="patchProp(ed.key, $event)"
          />
          <el-select
            v-else-if="ed.editor === 'select'"
            :model-value="propValue(ed.key)"
            @update:model-value="patchProp(ed.key, $event)"
          >
            <el-option
              v-for="o in ed.options ?? []"
              :key="String(o.value)"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
        </el-form-item>
      </template>

      <!-- 校验规则（仅数据字段） -->
      <template v-if="isData">
        <div class="property-panel__section">数据校验</div>
        <ValidationEditor
          :model-value="dataNode.validate ?? []"
          @update:model-value="patch({ validate: $event })"
        />

        <div class="property-panel__section">显隐规则</div>
        <VisibilityEditor
          :model-value="dataNode.visibleRule"
          :data-fields="dependencyFields"
          @update:model-value="patch({ visibleRule: $event })"
        />
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
/**
 * 属性面板：编辑选中字段的通用属性（含必填/只读/隐藏）、类型专属配置（含多标签页页签名称、子表单行数/固定列/行操作/
 * 已有字段）、校验规则与显隐规则，通过 patch 事件写回 schema。已发布字段的「字段标识」锁定不可改。
 * 隐藏对主表字段（含标签页内字段）、子表单整体与子表单的子字段（不展示整列）均生效，其值仍随表单输出。
 * 对应 specs/form-designer「字段属性配置」「多标签页容器页签管理」「校验规则可视化配置」
 * 「显隐规则可视化配置」「表单发布与字段标识锁定」、task 7.4 / 7.5 / 11.5。
 */
import { computed, ref } from 'vue'
import { fieldRegistry } from '@/registry'
import type { PropEditor } from '@/registry/types'
import {
  SUBFORM_DEFAULT_MAX_ROWS,
  SUBFORM_MAX_ROWS,
  isDataField,
  isMultipleField,
  isSubFormField,
  isTabsField,
  type CollectableDataField,
  type DataFieldNode,
  type FieldNode,
  type SubFormNode,
  type TabsFieldNode,
  type TabsTab,
} from '@/schema/types'
import { FIELD_WIDTH_OPTIONS, snapWidthPercent } from '@/schema/width'
import { fieldIdErrorMessage } from '@/schema/fieldId'
import OptionsEditor from './OptionsEditor.vue'
import ValidationEditor from './ValidationEditor.vue'
import VisibilityEditor from './VisibilityEditor.vue'
import { fieldIcon, fieldTypeLabel } from './fieldIcons'

const props = defineProps<{
  node: FieldNode | null
  /** 全部数据字段（含子表单，用于显隐依赖选择） */
  dataFields: CollectableDataField[]
}>()

const emit = defineEmits<{ (e: 'patch', patch: Partial<FieldNode>): void }>()

const isData = computed(() => !!props.node && isDataField(props.node))
const isSubForm = computed(() => !!props.node && isSubFormField(props.node))
const isTabs = computed(() => !!props.node && isTabsField(props.node))
const tabsNode = computed(() => (isTabs.value ? (props.node as unknown as TabsFieldNode) : null))
const tabList = computed<TabsTab[]>(() => tabsNode.value?.tabs ?? [])
/** 拥有 field 标识与必填/只读的字段：常用数据字段或子表单 */
const isDataLike = computed(() => isData.value || isSubForm.value)
const dataNode = computed(() => props.node as DataFieldNode)
const subFormNode = computed(() => props.node as SubFormNode)
const subFields = computed<DataFieldNode[]>(() =>
  isSubForm.value ? (subFormNode.value.subFields ?? []) : [],
)
/** 已有字段池：已移除但保留定义的子字段（不参与渲染与数据收集） */
const pooledSubFields = computed<DataFieldNode[]>(() =>
  isSubForm.value ? (subFormNode.value.fieldPool ?? []) : [],
)
/** 当前节点是否已发布 */
const isPublishedNode = computed(() => props.node?.published === true)
/** 字段标识锁定：仅对拥有 field 的字段（常用数据字段与子表单）且已发布时生效 */
const fieldIdLocked = computed(() => isDataLike.value && isPublishedNode.value)
/** 字段标识命名规则的悬停说明（输入框 title，不占用面板空间） */
const FIELD_ID_RULE_TIP =
  '仅允许字母、数字与下划线，且不可使用系统保留字 / 注入关键词（如 insert、update、user）'
/**
 * 字段标识命名不合法时的可见提示（与结构校验同一口径）：不阻断输入，
 * 但保存/发布前的结构校验会因此拦截，故需即时展示。
 */
const fieldIdProblem = computed(() =>
  isDataLike.value ? (fieldIdErrorMessage(dataNode.value.field) ?? '') : '',
)
/** 字段是否被静态隐藏（普通字段不展示控件、子字段不展示整列，值仍随表单提交） */
const isHiddenField = computed(() => isDataLike.value && dataNode.value.hidden === true)
/** 隐藏与必填同时开启：隐藏优先，必填与校验规则均不生效（只警示不拦截，以便回填默认值后提交） */
const hiddenRequired = computed(() => isHiddenField.value && dataNode.value.required === true)
/** 隐藏开关的伴随说明 */
const hiddenHint = computed(() =>
  isHiddenField.value
    ? hiddenRequired.value
      ? '字段已隐藏：填报时不展示，其值仍随表单提交；必填与校验规则对隐藏字段不生效'
      : '字段已隐藏：填报时不展示，其值仍随表单提交'
    : '',
)
const hiddenHintClass = computed(() =>
  hiddenRequired.value
    ? 'property-panel__warn'
    : 'property-panel__hint property-panel__hint--tight',
)
const isOptionType = computed(
  () => !!props.node && ['radio', 'checkbox', 'select', 'selectMultiple'].includes(props.node.type),
)
/** 选项类字段中的多选形态（复选框组 / 下拉复选框）：默认选中可勾多项 */
const isMultipleOptionField = computed(
  () => !!props.node && isMultipleField(props.node.type) && isOptionType.value,
)
/** 类型专属编辑器；子表单行数配置由专用区处理（含钳制/冲突提示），不走通用编辑器 */
const propEditors = computed<PropEditor[]>(() => {
  if (!props.node || isSubForm.value) return []
  return fieldRegistry.get(props.node.type)?.propEditors ?? []
})
/** 显隐依赖字段：排除当前字段自身 */
const dependencyFields = computed(() =>
  props.dataFields.filter((f) => !isData.value || f.field !== dataNode.value.field),
)

/** 子表单行数：读取当前配置（初始行数缺省按 0 / 最多行数缺省按 200，硬上限 500） */
const minRows = computed(() => Number(subFormNode.value.props?.minRows ?? 0))
const maxRows = computed(() => Number(subFormNode.value.props?.maxRows ?? SUBFORM_DEFAULT_MAX_ROWS))
const maxRowsClampHint = ref('')
/** 初始行数 > 最多行数时的可见冲突提示（spec「初始行数大于最多行数」） */
const rowConflictHint = computed(() =>
  isSubForm.value && minRows.value > maxRows.value
    ? `初始行数（${minRows.value}）不能大于最多行数（${maxRows.value}），请调整`
    : '',
)

function patch(p: Partial<FieldNode>): void {
  emit('patch', p)
}
/**
 * 重命名第 index 个页签：生成新 tabs 数组写回（各页签对象除 title 外原样保留，
 * fields 引用不变以免丢失已拖入的字段）。
 */
function renameTabAt(index: number, title: string): void {
  const next = tabList.value.map((tab, i) => (i === index ? { ...tab, title } : tab))
  patch({ tabs: next } as Partial<FieldNode>)
}
function propValue(key: string): unknown {
  return (props.node?.props ?? {})[key]
}
function patchProp(key: string, value: unknown): void {
  emit('patch', { props: { ...(props.node?.props ?? {}), [key]: value } } as Partial<FieldNode>)
}
/** 初始行数：钳制在 [0, 硬上限] */
function onMinRows(v: number | undefined): void {
  const n = Number(v)
  if (!Number.isFinite(n)) return
  patchProp('minRows', Math.max(0, Math.min(Math.floor(n), SUBFORM_MAX_ROWS)))
}
/** 最多行数：超硬上限（500）按上限落库并给出可见提示（spec「最多行数超上限」） */
function onMaxRows(v: number | undefined): void {
  const n = Number(v)
  if (!Number.isFinite(n)) return
  if (n > SUBFORM_MAX_ROWS) {
    maxRowsClampHint.value = `最多行数不能超过 ${SUBFORM_MAX_ROWS}，已按 ${SUBFORM_MAX_ROWS} 保存`
    patchProp('maxRows', SUBFORM_MAX_ROWS)
  } else {
    maxRowsClampHint.value = ''
    patchProp('maxRows', Math.max(1, Math.floor(n)))
  }
}

/** 子字段列数：固定左/右列数的合计上限（design D9） */
const subFieldCount = computed(() => subFields.value.length)
/** 当前固定列配置（缺省按 0） */
const fixedLeft = computed(() => Number(subFormNode.value.props?.fixedLeftColumns ?? 0))
const fixedRight = computed(() => Number(subFormNode.value.props?.fixedRightColumns ?? 0))
const fixedColumnHint = ref('')
/** 按「左+右合计不超过子字段列数」钳制当前编辑侧，超限时返回上限值并提示 */
function clampFixedSide(entered: number, otherSide: number): number {
  const n = Math.max(0, Math.floor(entered))
  const max = Math.max(0, subFieldCount.value - otherSide)
  if (n > max) {
    fixedColumnHint.value = `左+右固定列合计不超过 ${subFieldCount.value} 列，已按 ${max} 保存`
    return max
  }
  fixedColumnHint.value = ''
  return n
}
/** 固定左列数：min 0，与右合计钳制（spec「固定列数超子字段数」） */
function onFixedLeft(v: number | undefined): void {
  const n = Number(v)
  if (!Number.isFinite(n)) return
  patchProp('fixedLeftColumns', clampFixedSide(n, fixedRight.value))
}
/** 固定右列数：min 0，与左合计钳制 */
function onFixedRight(v: number | undefined): void {
  const n = Number(v)
  if (!Number.isFinite(n)) return
  patchProp('fixedRightColumns', clampFixedSide(n, fixedLeft.value))
}

/** 批量删除开关（缺省关闭）：开启后填报态首列为勾选列并提供批量删除入口 */
const allowBatchRemove = computed(() => subFormNode.value.props?.allowBatchRemove === true)
function onBatchRemove(v: unknown): void {
  patchProp('allowBatchRemove', v === true)
}
</script>

<style scoped>
.property-panel {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
}
.property-panel__section {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin: 12px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.property-panel__hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
/* 紧接在表单项之后的提示（如已发布锁定说明）：上提负边距避免与输入框拉开 */
.property-panel__hint--tight {
  margin: -4px 0 8px;
}
/* 字段宽度按钮组：窄面板下允许换行，保持与「控件尺寸」一致的观感 */
.property-panel__width :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
}
/* 控件类型头部：吸附在面板顶部，滚动时仍可见 */
.property-panel__header {
  position: sticky;
  top: -12px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -12px -12px 4px;
  padding: 10px 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.property-panel__header-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}
.property-panel__header-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.property-panel__header-type {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.property-panel__header-code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono, monospace);
}
.property-panel__warn {
  margin: -4px 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-warning);
}
.property-panel__error {
  margin: -4px 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-danger);
}
.property-panel__subfields {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.property-panel__subfield {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
/* 已有字段清单中的字段标识：靠右弱化展示 */
.property-panel__code {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: var(--el-font-family-mono, monospace);
}
</style>
