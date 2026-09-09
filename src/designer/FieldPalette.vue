<template>
  <div class="field-palette">
    <div v-for="group in groups" :key="group.name" class="field-palette__group">
      <div class="field-palette__title">{{ group.label }}</div>
      <draggable
        :list="group.items"
        :group="{ name: 'fields', pull: 'clone', put: false }"
        :clone="handleClone"
        :sort="false"
        item-key="type"
        class="field-palette__list"
      >
        <template #item="{ element }">
          <div class="field-palette__item" :title="element.label">
            <el-icon><component :is="element.icon" /></el-icon>
            <span>{{ element.label }}</span>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 组件面板（左侧「组件」tab）：从注册表按分组渲染可用控件目录，仅展示目录内字段
 * （不暴露 form-create 全部组件）。拖拽以 clone 方式将字段加入画布。
 * 对应 specs/form-designer「字段面板与拖拽添加」、specs/form-fields「受支持字段目录」、
 * task 7.2。
 */
import { computed, inject } from 'vue'
import type { Component } from 'vue'
import draggable from 'vuedraggable'
import { fieldRegistry } from '@/registry'
import type { FieldDefinition } from '@/registry/types'
import type { FieldGroup, FieldType } from '@/schema/types'
import { fieldIcon } from './fieldIcons'

// 由 FormDesigner 注入：依据类型创建新字段节点（分配唯一 key/field）
const cloneField = inject<(type: FieldType) => FieldDefinition & Record<string, unknown>>(
  'fieldFactory',
  // 兜底：不应发生
  (type: FieldType) => ({ type }) as any,
)

/**
 * vuedraggable 的 clone 回调收到的是面板列表项（PaletteItem 对象），
 * 而字段工厂需要的是字段类型字符串，故这里取出 type 再创建节点。
 */
function handleClone(item: PaletteItem): FieldDefinition & Record<string, unknown> {
  return cloneField(item.type)
}

interface PaletteItem {
  type: FieldType
  label: string
  icon: Component
}

const groups = computed(() => {
  const build = (group: FieldGroup, label: string) => ({
    name: group,
    label,
    items: fieldRegistry.listByGroup(group).map<PaletteItem>((d) => ({
      type: d.type,
      label: d.label,
      icon: fieldIcon(d.type),
    })),
  })
  // 三分组对齐 form-fields 目录：常用 / 高级（子表单）/ 布局（task 6.1）
  // 面板以「组件」维度展示可用控件，分组标题不再重复「字段」二字
  return [build('common', '常用'), build('advanced', '高级'), build('layout', '布局')]
})
</script>

<style scoped>
.field-palette {
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}
.field-palette__title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 8px 4px;
}
.field-palette__list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.field-palette__item {
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
.field-palette__item:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
</style>
