<template>
  <div class="subform-body" @click.stop>
    <!-- 明细表格：列头 = 子字段标题（必填带标识），结构行 = 控件预览；整列可拖拽排序 -->
    <draggable
      :list="node.subFields"
      :group="{ name: 'fields', pull: false, put: true }"
      :move="onMove"
      item-key="key"
      filter=".subform-col__no-drag"
      :prevent-on-filter="false"
      class="subform-body__grid"
      :animation="150"
      @change="onChange"
    >
      <template #item="{ element: sf }">
        <div
          class="subform-col"
          :class="{ 'is-selected': sf.key === selectedKey, 'is-hidden': sf.hidden === true }"
          @click.stop="emit('select', sf.key)"
        >
          <div class="subform-col__head">
            <el-icon class="subform-col__handle" title="拖动调整列顺序"><Rank /></el-icon>
            <el-icon class="subform-col__type-icon">
              <component :is="fieldIcon(sf.type)" />
            </el-icon>
            <span v-if="sf.required" class="subform-col__star">*</span>
            <span class="subform-col__title">{{ sf.title || fieldTypeLabel(sf.type) }}</span>
            <!-- 设计态列头在标签名后带出字段名（填报态不展示） -->
            <span v-if="sf.field" class="subform-col__code">{{ sf.field }}</span>
            <!-- 已发布子字段：标识已锁定，以锁图标作可见标记 -->
            <el-icon v-if="sf.published" class="subform-col__lock" title="已发布，字段标识不可修改">
              <Lock />
            </el-icon>
            <!-- 固定列可见标识：仅标数据列（画布不滚动，实际冻结在填报渲染时发生）；
                 填报态的首列（序号/勾选）与末列（操作）恒定冻结，这两列画布不呈现 -->
            <el-tag
              v-if="colPin(sf.key) === 'left'"
              class="subform-col__pin"
              size="small"
              type="success"
              effect="plain"
              >左固定</el-tag
            >
            <el-tag
              v-else-if="colPin(sf.key) === 'right'"
              class="subform-col__pin"
              size="small"
              type="warning"
              effect="plain"
              >右固定</el-tag
            >
            <!-- 已隐藏的列：填报态不呈现（值仍随行数据输出），画布仍保留该列供编辑 -->
            <el-tag v-if="sf.hidden" size="small" type="info" effect="plain">隐藏</el-tag>
            <span class="subform-col__spacer" />
            <el-button
              link
              size="small"
              class="subform-col__no-drag"
              @click.stop="emit('copy', sf.key)"
            >
              复制
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              class="subform-col__no-drag"
              @click.stop="emit('remove', sf.key)"
            >
              删除
            </el-button>
          </div>
          <!-- 预览态控件：pointer-events 屏蔽，点击与拖拽均落到列上（选中子字段 / 整列为热区），不产生填报数据 -->
          <div class="subform-col__cell">
            <FieldPreview :node="sf" />
          </div>
        </div>
      </template>
    </draggable>

    <!-- 空态：无子字段 -->
    <div v-if="!node.subFields.length" class="subform-body__empty">
      尚无子字段，请从左侧拖入常用字段，或点击「添加子字段」
    </div>

    <!-- 拒绝提示：拖入布局字段 / 子表单时（task 6.2） -->
    <div v-if="rejectHint" class="subform-body__reject">{{ rejectHint }}</div>

    <!-- 底部：添加子字段入口（仅常用字段）+ 已有字段（从池中加回）+ 列计数 -->
    <div class="subform-body__footer">
      <el-dropdown trigger="click" @command="onAddCommand">
        <el-button size="small" :icon="Plus">添加子字段</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="d in commonDefs" :key="d.type" :command="d.type">
              <el-icon><component :is="fieldIcon(d.type)" /></el-icon>
              <span class="subform-body__dropdown-label">{{ d.label }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <!-- 已有字段：曾配置为子字段、已从明细移除但保留定义的字段，可原样加回（沿用字段标识） -->
      <el-dropdown trigger="click" :disabled="!pooledFields.length" @command="onRestoreCommand">
        <el-button
          size="small"
          :icon="FolderOpened"
          :disabled="!pooledFields.length"
          :title="
            pooledFields.length ? '把移除过的字段加回明细' : '删除子字段后会留存在此，可随时加回'
          "
        >
          已有字段{{ pooledFields.length ? `（${pooledFields.length}）` : '' }}
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="p in pooledFields" :key="p.key" :command="p.key">
              <el-icon><component :is="fieldIcon(p.type)" /></el-icon>
              <span class="subform-body__dropdown-label">
                {{ p.title || fieldTypeLabel(p.type) }}
              </span>
              <span class="subform-body__dropdown-code">{{ p.field }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <span class="subform-body__count">{{ node.subFields.length }} 列</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 子表单画布卡片主体：以明细表格形态所见即所得预览子表单（列头来自子字段标题并在其后
 * 带出字段名、必填列带标识、已发布列带锁标记、隐藏列带「隐藏」标记并弱化单元格，结构行呈现控件预览），并承载子字段管理入口
 * （新增 / 复制 / 删除 / 拖拽排序 / 从「已有字段」池加回）。整列都是拖拽热区（不设 handle），列内的
 * 复制 / 删除按钮以 `.subform-col__no-drag` 声明为 Sortable filter 并关闭 preventOnFilter，以保留其点击与聚焦。
 * 子字段区拖放经受 `canDropInto` 守卫，仅接受常用数据字段，拒绝布局字段
 * 与嵌套子表单并给出提示。预览态不产生任何填报数据。
 * 对应 specs/form-designer「子表单画布预览」「子字段管理」「不接受的字段类型被拒绝」、
 * design D6、task 6.2 / 6.4 / 6.5。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import draggable from 'vuedraggable'
import { FolderOpened, Lock, Plus, Rank } from '@element-plus/icons-vue'
import FieldPreview from './FieldPreview.vue'
import { fieldIcon, fieldTypeLabel } from './fieldIcons'
import { canDropInto, dropRejectMessage } from './dropRules'
import { fieldRegistry } from '@/registry'
import type { SubFormNode } from '@/schema/types'

const props = defineProps<{ node: SubFormNode; selectedKey?: string }>()

const emit = defineEmits<{
  (e: 'select', key: string): void
  (e: 'add', type: string): void
  (e: 'copy', subKey: string): void
  (e: 'remove', subKey: string): void
  /** 从「已有字段」池加回一个字段（沿用原字段标识与配置） */
  (e: 'restore', pooledKey: string): void
}>()

/** 可新增为子字段的常用字段目录 */
const commonDefs = computed(() => fieldRegistry.listByGroup('common'))
/** 已有字段池：已移除但保留定义的子字段（缺省为空） */
const pooledFields = computed(() => props.node.fieldPool ?? [])

/** 非负整数解析：非法/负数/小数按 0（与渲染层一致，design D9） */
function toNonNegInt(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}
/**
 * 可见列（未隐藏子字段）的 key -> 可见序索引。填报态隐藏列不呈现，固定列仅按可见列
 * 计算（与 EngineSubForm 同一口径），画布的固定标识因此也只看可见列。
 */
const visibleIndexOf = computed(() => {
  const map = new Map<string, number>()
  for (const sf of props.node.subFields ?? []) {
    if (sf.hidden !== true) map.set(sf.key, map.size)
  }
  return map
})
const visibleColCount = computed(() => visibleIndexOf.value.size)
/** 生效左/右固定数据列数（与渲染层同算法，以保证预览标记与实际冻结一致） */
const effLeft = computed(() =>
  Math.min(toNonNegInt(props.node.props?.fixedLeftColumns), visibleColCount.value),
)
const effRight = computed(() =>
  Math.min(
    toNonNegInt(props.node.props?.fixedRightColumns),
    Math.max(0, visibleColCount.value - effLeft.value),
  ),
)
/** 列固定方向：供列头「左固定/右固定」标识使用；隐藏列不呈现，因此无固定标识 */
function colPin(key: string): 'left' | 'right' | '' {
  const index = visibleIndexOf.value.get(key)
  if (index === undefined) return ''
  if (index < effLeft.value) return 'left'
  if (effRight.value > 0 && index >= visibleColCount.value - effRight.value) return 'right'
  return ''
}

const rejectHint = ref('')
let rejectTimer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => {
  if (rejectTimer) clearTimeout(rejectTimer)
})

function onAddCommand(type: string): void {
  emit('add', type)
}

/** 从已有字段池加回：具体落库与标识冲突拦截由上层（FormDesigner → schemaOps）负责 */
function onRestoreCommand(pooledKey: string): void {
  emit('restore', pooledKey)
}

/**
 * 拖放守卫：从面板 / 其他容器拖入时判定类型是否可作为子字段。
 * 返回 false 阻止落位（不生成节点），并给出可读提示（task 6.2）。
 */
function onMove(evt: { draggedContext?: { element?: { type?: string } } }): boolean {
  const type = evt?.draggedContext?.element?.type
  if (!type) return true
  if (canDropInto('subform', type)) {
    rejectHint.value = ''
    return true
  }
  rejectHint.value = dropRejectMessage(type, fieldTypeLabel(type))
  if (rejectTimer) clearTimeout(rejectTimer)
  rejectTimer = setTimeout(() => (rejectHint.value = ''), 2000)
  return false
}

/** 拖入新增子字段后自动选中，便于立即在属性面板配置 */
function onChange(evt: { added?: { element?: { key?: string } } }): void {
  const key = evt?.added?.element?.key
  if (key) emit('select', key)
}
</script>

<style scoped>
.subform-body {
  margin-top: 8px;
  cursor: default;
}
/* 明细表格：横向列布局，带边框呈现表格观感 */
.subform-body__grid {
  display: flex;
  align-items: stretch;
  gap: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
  min-height: 56px;
}
.subform-col {
  flex: 1 1 0;
  min-width: 140px;
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  /* 整列可拖拽（点击仍选中子字段），列内按钮自行恢复光标 */
  cursor: move;
}
.subform-col:last-child {
  border-right: none;
}
.subform-col.is-selected {
  background: var(--el-color-primary-light-9);
  box-shadow: inset 0 0 0 1px var(--el-color-primary);
}
/* 隐藏的子字段列：填报态不呈现，画布仅弱化预览区以提示差异 */
.subform-col.is-hidden .subform-col__cell {
  opacity: 0.5;
}
.subform-col__head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
}
.subform-col__handle {
  cursor: move;
  color: var(--el-text-color-secondary);
}
.subform-col__type-icon {
  color: var(--el-color-primary);
  font-size: 13px;
}
.subform-col__star {
  color: var(--el-color-danger);
  font-weight: 600;
}
.subform-col__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}
/* 字段名（字段标识）：紧随标签名，以弱化样式与标签名区分 */
.subform-col__code {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: var(--el-font-family-mono, monospace);
}
.subform-col__pin {
  flex: none;
  margin-left: 4px;
}
/* 已发布锁标记：与字段名同属弱化信息，不抢标题视觉 */
.subform-col__lock {
  flex: none;
  font-size: 12px;
  color: var(--el-color-success);
}
.subform-col__spacer {
  flex: 1;
}
.subform-col__cell {
  padding: 6px;
  flex: 1;
  /* 预览态屏蔽控件交互，点击落到列上（选中子字段），不产生填报数据 */
  pointer-events: none;
  user-select: none;
}
.subform-body__empty {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}
.subform-body__reject {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-color-danger);
}
.subform-body__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.subform-body__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.subform-body__dropdown-label {
  margin-left: 6px;
}
/* 已有字段下拉项：带出字段标识，便于确认加回的是哪个数据键 */
.subform-body__dropdown-code {
  margin-left: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: var(--el-font-family-mono, monospace);
}
</style>
