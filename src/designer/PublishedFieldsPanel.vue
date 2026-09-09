<template>
  <div class="published-fields">
    <div v-for="group in groups" :key="group.name" class="published-fields__group">
      <div class="published-fields__title">{{ group.label }}</div>
      <draggable
        :list="group.items"
        :group="{ name: 'fields', pull: 'clone', put: false }"
        :clone="handleClone"
        :sort="false"
        item-key="field"
        filter=".is-used"
        :prevent-on-filter="false"
        class="published-fields__list"
      >
        <template #item="{ element }">
          <div
            class="published-fields__item"
            :class="{ 'is-used': element.used }"
            :title="itemHint(element)"
            @click="onItemClick(element)"
          >
            <el-icon class="published-fields__icon">
              <component :is="element.icon" />
            </el-icon>
            <span class="published-fields__label">{{ element.label }}</span>
            <span class="published-fields__code">{{ element.field }}</span>
            <el-icon v-if="element.used" class="published-fields__used-icon">
              <Check />
            </el-icon>
          </div>
        </template>
      </draggable>
    </div>

    <!-- 空态：表单尚未发布（或发布时无任何数据字段） -->
    <p v-if="!groups.length" class="published-fields__empty">
      暂无已发布字段。点击工具栏「发布」后，此处按常用 /
      高级列出已发布字段：字段被删除出画布后仍可从此处拖回，沿用原字段标识。
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * 已发布字段面板（左侧「字段」tab）：展示 formConfig.publishedFields（发布当时的字段定义快照），
 * 按条目所属控件的注册表分组归入「常用 / 高级」（清单不含布局字段，故无布局分组）。
 * - 未在画布中出现的条目可拖入画布，落位时沿用其字段标识与全部配置（仅重新分配设计器内部 key）；
 * - 已在画布中出现的条目按字段标识比对后置灰，不可拖拽（避免同一标识重复落位），
 *   点击则上抛 locate 交由设计器选中并滚动到画布中对应卡片；
 * - 整行都是拖拽热区，置灰行以 `.is-used` 声明为 Sortable filter 并关闭 preventOnFilter 以保留点击。
 * 对应 specs/form-designer「已发布字段清单」。
 */
import { computed } from 'vue'
import type { Component } from 'vue'
import draggable from 'vuedraggable'
import { Check } from '@element-plus/icons-vue'
import { fieldRegistry } from '@/registry'
import {
  isSubFormField,
  type FieldGroup,
  type FieldNode,
  type PublishedFieldEntry,
} from '@/schema/types'
import { clonePublishedEntry, getCanvasFieldIds } from './schemaOps'
import { fieldIcon } from './fieldIcons'

const props = defineProps<{
  /** 已发布字段清单（来源 formConfig.publishedFields） */
  entries: PublishedFieldEntry[]
  /** 当前画布字段树：用于按字段标识判断条目是否已在用 */
  fields: FieldNode[]
}>()

const emit = defineEmits<{ (e: 'locate', fieldId: string): void }>()

/** 面板可见分组：清单不含布局字段，故仅常用与高级两组 */
const PALETTE_GROUPS: { name: FieldGroup; label: string }[] = [
  { name: 'common', label: '常用' },
  { name: 'advanced', label: '高级' },
]

interface PublishedItem {
  /** 字段标识：与画布比对的稳定身份 */
  field: string
  label: string
  icon: Component
  /** 是否已在画布中使用（置灰且不可拖拽） */
  used: boolean
  entry: PublishedFieldEntry
}

const usedFieldIds = computed(() => getCanvasFieldIds(props.fields))

const groups = computed(() => {
  const bucket = new Map<FieldGroup, PublishedItem[]>()
  for (const entry of props.entries) {
    const def = fieldRegistry.get(entry.type)
    // 未注册类型无从归组、布局类型不入清单，均跳过
    if (!def || def.group === 'layout') continue
    const items = bucket.get(def.group) ?? []
    items.push({
      field: entry.field,
      label: entry.title || def.label,
      icon: fieldIcon(entry.type),
      used: usedFieldIds.value.has(entry.field),
      entry,
    })
    bucket.set(def.group, items)
  }
  return PALETTE_GROUPS.filter(({ name }) => (bucket.get(name)?.length ?? 0) > 0).map(
    ({ name, label }) => ({ name, label, items: bucket.get(name)! }),
  )
})

/** 子表单条目整块拖回（含其子字段与已有字段池），故提示语区分容器与普通字段 */
function itemHint(item: PublishedItem): string {
  if (item.used) return `「${item.label}」已在画布中使用，点击可在画布中定位`
  const kind = isSubFormField(item.entry) ? '明细' : '字段'
  return `拖拽以把已发布的${kind}「${item.label}」放回画布（沿用字段标识 ${item.field}）`
}

/** 拖回画布：沿用清单条目的字段标识与配置，仅换用新的内部 key */
function handleClone(item: PublishedItem): PublishedFieldEntry {
  return clonePublishedEntry(item.entry)
}

/** 置灰条目点击定位；可拖条目点击无动作（其入口是拖拽） */
function onItemClick(item: PublishedItem): void {
  if (item.used) emit('locate', item.field)
}
</script>

<style scoped>
.published-fields {
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}
.published-fields__title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 8px 4px;
}
.published-fields__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.published-fields__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  cursor: grab;
  font-size: 13px;
  background: var(--el-bg-color);
  transition: all 0.2s;
}
.published-fields__item:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.published-fields__icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.published-fields__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.published-fields__code {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: var(--el-font-family-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}
/* 已在画布中使用的条目：不可拖拽的可用性视觉（虚线边框 + 灰字 + 禁用光标） */
.published-fields__item.is-used {
  cursor: not-allowed;
  border-style: dashed;
  border-color: var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
}
.published-fields__item.is-used:hover {
  border-color: var(--el-border-color-lighter);
  color: var(--el-text-color-placeholder);
}
.published-fields__item.is-used .published-fields__icon {
  color: var(--el-text-color-placeholder);
}
.published-fields__used-icon {
  color: var(--el-color-success);
  flex-shrink: 0;
}
.published-fields__empty {
  margin: 8px 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
