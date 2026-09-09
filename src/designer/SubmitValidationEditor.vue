<template>
  <div class="submit-validation">
    <div v-for="(rule, ri) in rules" :key="ri" class="submit-validation__rule">
      <div class="submit-validation__head">
        <span class="submit-validation__idx">规则 {{ ri + 1 }}</span>
        <span class="submit-validation__label">当</span>
        <el-select
          :model-value="rule.logic"
          size="small"
          style="width: 90px"
          @update:model-value="patchRule(ri, { logic: $event as LogicOperator })"
        >
          <el-option label="且(and)" value="and" />
          <el-option label="或(or)" value="or" />
        </el-select>
        <span class="submit-validation__label">条件命中时阻止提交</span>
        <span class="submit-validation__spacer" />
        <el-button link type="danger" size="small" @click="removeRule(ri)">删除</el-button>
      </div>

      <div v-for="(cond, ci) in rule.conditions" :key="ci" class="submit-validation__cond">
        <el-select
          :model-value="cond.field"
          size="small"
          placeholder="依赖字段"
          style="width: 130px"
          @update:model-value="patchCond(ri, ci, { field: $event })"
        >
          <el-option v-for="f in dataFields" :key="f.field" :label="f.title" :value="f.field" />
        </el-select>
        <el-select
          :model-value="cond.operator"
          size="small"
          style="width: 110px"
          @update:model-value="patchCond(ri, ci, { operator: $event as ComparisonOperator })"
        >
          <el-option v-for="op in OPERATORS" :key="op.value" :label="op.label" :value="op.value" />
        </el-select>
        <el-input
          v-if="needValue(cond.operator)"
          :model-value="String(cond.value ?? '')"
          size="small"
          placeholder="目标值"
          style="width: 100px"
          @update:model-value="patchCond(ri, ci, { value: $event })"
        />
        <el-button link size="small" @click="removeCond(ri, ci)">移除条件</el-button>
      </div>
      <el-button size="small" :icon="Plus" @click="addCond(ri)">添加条件</el-button>

      <div class="submit-validation__msg">
        <span class="submit-validation__label">提示文案</span>
        <el-input
          :model-value="rule.message"
          size="small"
          placeholder="校验不通过时的提示"
          :class="{ 'is-error': !rule.message || !rule.message.trim() }"
          @update:model-value="patchRule(ri, { message: $event })"
        />
      </div>
      <div v-if="!rule.message || !rule.message.trim()" class="submit-validation__error">
        提示文案不可为空
      </div>
    </div>

    <el-button size="small" :icon="Plus" @click="addRule">添加提交校验规则</el-button>
    <p v-if="rules.length === 0" class="submit-validation__hint">
      未配置整表提交校验；可添加「当某些字段满足条件时阻止提交」的规则
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * 整表提交校验可视化编辑器：配置多条规则，每条由条件组（复用显隐规则操作符与结构）
 * 与提示文案构成，写入 formConfig.submitValidation。对应 specs/form-designer
 * 「表单提交校验可视化配置」、form-schema「表单级提交校验数据表达」。
 */
import { computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import type {
  CollectableDataField,
  ComparisonOperator,
  LogicOperator,
  SubmitValidationRule,
} from '@/schema/types'
import { OPERATORS, operatorNeedsValue } from './operators'

const props = defineProps<{
  modelValue?: SubmitValidationRule[]
  /** 可作为依赖的数据字段 */
  dataFields: CollectableDataField[]
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: SubmitValidationRule[]): void }>()

const rules = computed<SubmitValidationRule[]>(() => props.modelValue ?? [])
const needValue = operatorNeedsValue

/** 生成一个默认条件（取首个数据字段） */
function defaultCondition() {
  return {
    field: props.dataFields[0]?.field ?? '',
    operator: 'eq' as ComparisonOperator,
    value: '',
  }
}

function commit(next: SubmitValidationRule[]): void {
  emit('update:modelValue', next)
}

function addRule(): void {
  commit([
    ...rules.value,
    { logic: 'and', conditions: [defaultCondition()], message: '' } as SubmitValidationRule,
  ])
}

function removeRule(ri: number): void {
  const next = [...rules.value]
  next.splice(ri, 1)
  commit(next)
}

function patchRule(ri: number, patch: Partial<SubmitValidationRule>): void {
  const next = rules.value.map((r, i) => (i === ri ? { ...r, ...patch } : r))
  commit(next)
}

function addCond(ri: number): void {
  const next = rules.value.map((r, i) =>
    i === ri ? { ...r, conditions: [...r.conditions, defaultCondition()] } : r,
  )
  commit(next)
}

function removeCond(ri: number, ci: number): void {
  const next = rules.value.map((r, i) => {
    if (i !== ri) return r
    const conditions = [...r.conditions]
    conditions.splice(ci, 1)
    return { ...r, conditions }
  })
  commit(next)
}

function patchCond(
  ri: number,
  ci: number,
  patch: Partial<SubmitValidationRule['conditions'][number]>,
): void {
  const next = rules.value.map((r, i) => {
    if (i !== ri) return r
    const conditions = r.conditions.map((c, j) => (j === ci ? { ...c, ...patch } : c))
    return { ...r, conditions }
  })
  commit(next)
}
</script>

<style scoped>
.submit-validation {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.submit-validation__rule {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.submit-validation__head,
.submit-validation__cond,
.submit-validation__msg {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.submit-validation__head {
  justify-content: flex-start;
}
.submit-validation__idx {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.submit-validation__spacer {
  flex: 1;
}
.submit-validation__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.submit-validation__hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.submit-validation__error {
  font-size: 12px;
  color: var(--el-color-danger);
}
</style>
