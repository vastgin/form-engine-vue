<template>
  <div class="visibility-editor">
    <el-switch :model-value="enabled" active-text="启用显隐规则" @update:model-value="onToggle" />
    <template v-if="enabled && rule">
      <div class="visibility-editor__row">
        <span class="visibility-editor__label">条件关系</span>
        <el-select
          :model-value="rule.logic"
          size="small"
          style="width: 90px"
          @update:model-value="update({ logic: $event as LogicOperator })"
        >
          <el-option label="且(and)" value="and" />
          <el-option label="或(or)" value="or" />
        </el-select>
        <span class="visibility-editor__label">则</span>
        <el-select
          :model-value="rule.action"
          size="small"
          style="width: 90px"
          @update:model-value="update({ action: $event as 'show' | 'hide' })"
        >
          <el-option label="显示" value="show" />
          <el-option label="隐藏" value="hide" />
        </el-select>
      </div>

      <div v-for="(cond, index) in rule.conditions" :key="index" class="visibility-editor__cond">
        <el-select
          :model-value="cond.field"
          size="small"
          placeholder="依赖字段"
          style="width: 130px"
          @update:model-value="patchCond(index, { field: $event })"
        >
          <el-option v-for="f in dataFields" :key="f.field" :label="f.title" :value="f.field" />
        </el-select>
        <el-select
          :model-value="cond.operator"
          size="small"
          style="width: 110px"
          @update:model-value="patchCond(index, { operator: $event as ComparisonOperator })"
        >
          <el-option v-for="op in OPERATORS" :key="op.value" :label="op.label" :value="op.value" />
        </el-select>
        <el-input
          v-if="needValue(cond.operator)"
          :model-value="String(cond.value ?? '')"
          size="small"
          placeholder="目标值"
          style="width: 100px"
          @update:model-value="patchCond(index, { value: $event })"
        />
        <el-button link type="danger" size="small" @click="removeCond(index)">删除</el-button>
      </div>
      <el-button size="small" :icon="Plus" @click="addCond">添加条件</el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 显隐规则可视化编辑器：选择依赖字段、操作符、目标值与显示/隐藏动作，
 * 支持多条件与/或组合，写入 schema 的 VisibilityRule 结构。
 * 对应 specs/form-designer「显隐规则可视化配置」、task 7.5。
 */
import { computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import type {
  CollectableDataField,
  ComparisonOperator,
  LogicOperator,
  VisibilityRule,
} from '@/schema/types'
import { OPERATORS, operatorNeedsValue } from './operators'

const props = defineProps<{
  modelValue?: VisibilityRule
  /** 可作为依赖的数据字段（不含当前字段自身） */
  dataFields: CollectableDataField[]
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: VisibilityRule | undefined): void }>()

/** 操作符选项与是否需要目标值：与整表提交校验编辑器共享（operators.ts） */
const needValue = operatorNeedsValue

const enabled = computed(() => !!props.modelValue)
const rule = computed(() => props.modelValue)

function onToggle(val: boolean | string | number): void {
  if (val) {
    const firstField = props.dataFields[0]?.field ?? ''
    emit('update:modelValue', {
      logic: 'and',
      action: 'show',
      conditions: [{ field: firstField, operator: 'eq', value: '' }],
    })
  } else {
    emit('update:modelValue', undefined)
  }
}

function update(patch: Partial<VisibilityRule>): void {
  if (!props.modelValue) return
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function patchCond(index: number, patch: Partial<VisibilityRule['conditions'][number]>): void {
  if (!props.modelValue) return
  const conditions = [...props.modelValue.conditions]
  conditions[index] = { ...conditions[index], ...patch }
  emit('update:modelValue', { ...props.modelValue, conditions })
}

function removeCond(index: number): void {
  if (!props.modelValue) return
  const conditions = [...props.modelValue.conditions]
  conditions.splice(index, 1)
  emit('update:modelValue', { ...props.modelValue, conditions })
}

function addCond(): void {
  if (!props.modelValue) return
  const firstField = props.dataFields[0]?.field ?? ''
  emit('update:modelValue', {
    ...props.modelValue,
    conditions: [...props.modelValue.conditions, { field: firstField, operator: 'eq', value: '' }],
  })
}
</script>

<style scoped>
.visibility-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.visibility-editor__row,
.visibility-editor__cond {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.visibility-editor__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
