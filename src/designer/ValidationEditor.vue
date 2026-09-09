<template>
  <div class="validation-editor">
    <div v-for="(rule, index) in modelValue" :key="index" class="validation-editor__item">
      <div class="validation-editor__row">
        <el-select
          :model-value="rule.type"
          size="small"
          style="width: 130px"
          @update:model-value="patch(index, { type: $event as ValidationRuleType })"
        >
          <el-option v-for="t in RULE_TYPES" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-select
          v-if="rule.type === 'pattern'"
          :model-value="rule.preset ?? 'custom'"
          size="small"
          style="width: 110px"
          @update:model-value="patch(index, { preset: $event as PatternPreset })"
        >
          <el-option v-for="p in PRESETS" :key="p.value" :label="p.label" :value="p.value" />
        </el-select>
        <el-input
          v-if="showValueInput(rule)"
          :model-value="rule.value as string"
          size="small"
          placeholder="参数"
          style="width: 90px"
          @update:model-value="patchValue(index, $event)"
        />
        <el-button link type="danger" size="small" @click="remove(index)">删除</el-button>
      </div>
      <el-input
        :model-value="rule.message"
        size="small"
        placeholder="提示文案"
        @update:model-value="patch(index, { message: $event })"
      />
    </div>
    <el-button size="small" :icon="Plus" @click="add">添加校验规则</el-button>
  </div>
</template>

<script setup lang="ts">
/**
 * 校验规则可视化编辑器：写入 schema 的 ValidationRule 结构。
 * 对应 specs/form-designer「校验规则可视化配置」、task 7.5。
 */
import { Plus } from '@element-plus/icons-vue'
import type { PatternPreset, ValidationRule, ValidationRuleType } from '@/schema/types'

const props = defineProps<{ modelValue: ValidationRule[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: ValidationRule[]): void }>()

const RULE_TYPES: { label: string; value: ValidationRuleType }[] = [
  { label: '最大长度', value: 'maxLength' },
  { label: '最小长度', value: 'minLength' },
  { label: '最大值', value: 'max' },
  { label: '最小值', value: 'min' },
  { label: '格式匹配', value: 'pattern' },
  { label: '自定义正则', value: 'custom' },
]

const PRESETS: { label: string; value: PatternPreset }[] = [
  { label: '手机号', value: 'phone' },
  { label: '邮箱', value: 'email' },
  { label: '网址', value: 'url' },
  { label: '身份证', value: 'idcard' },
  { label: '自定义', value: 'custom' },
]

function showValueInput(rule: ValidationRule): boolean {
  if (rule.type === 'pattern') return (rule.preset ?? 'custom') === 'custom'
  if (rule.type === 'custom') return true
  return ['maxLength', 'minLength', 'max', 'min'].includes(rule.type)
}

function emitNext(next: ValidationRule[]): void {
  emit('update:modelValue', next)
}

function patch(index: number, p: Partial<ValidationRule>): void {
  const next = [...(props.modelValue ?? [])]
  next[index] = { ...next[index], ...p }
  emitNext(next)
}

function patchValue(index: number, raw: string): void {
  const rule = props.modelValue[index]
  const isNumeric = ['maxLength', 'minLength', 'max', 'min'].includes(rule.type)
  const value = isNumeric ? Number(raw) : raw
  patch(index, { value: Number.isNaN(value as number) ? raw : value })
}

function remove(index: number): void {
  const next = [...(props.modelValue ?? [])]
  next.splice(index, 1)
  emitNext(next)
}

function add(): void {
  emitNext([...(props.modelValue ?? []), { type: 'maxLength', value: 10, message: '' }])
}
</script>

<style scoped>
.validation-editor__item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 6px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.validation-editor__row {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
