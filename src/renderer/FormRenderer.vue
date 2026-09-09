<template>
  <div class="form-renderer">
    <form-create v-model="formData" v-model:api="fapi" :rule="rules" :option="option" />
    <div v-if="showActions" class="form-renderer__actions">
      <el-button v-if="!submitBtnHidden" type="primary" :loading="submitting" @click="onSubmit">{{
        submitBtnText
      }}</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 运行时表单渲染器。对应 specs/form-renderer 全部需求：
 * - 依据 schema 渲染表单（含布局/容器字段、formConfig 布局、空表单、未知字段占位）
 * - 填报数据收集与双向绑定、编程式设值
 * - 执行校验规则（提交时校验，失败阻止提交）
 * - 执行字段显隐规则（随数据实时计算 hidden）
 * - 提交输出数据、只读模式、重置
 *
 * 隐藏字段的两条轨道（design.md Risks 约定并文档化）：
 * - 条件显隐（`visibleRule`）：随数据实时计算，被隐藏的字段既不参与校验，也不包含在输出数据中；
 * - 静态隐藏（节点 `hidden`）：由 rule.hidden 在映射时收起控件，不参与条件显隐求值（不被解封），
 *   也不进入剔除名单，故其默认值与已有值仍随表单输出；其必填/校验已在适配层与子表单校验处跳过。
 */
import { computed, nextTick, provide, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createContext, schemaToOption, schemaToRules } from '@/adapter/toRule'
import { registerEngineComponents } from './components'
import { evaluateVisibility } from './visibility'
import { evaluateSubmitValidation } from './submitValidation'
import { stripEmptyRows, validateSubForm, type SubFormErrorItem } from './subformValidation'
import { buildInitialData, collectDataFields } from '@/schema/traverse'
import type { FormCreateRule } from '@/registry/types'
import { isSubFormField, type FieldOption, type FormSchema } from '@/schema/types'

registerEngineComponents()

interface DataSources {
  members?: FieldOption[]
  departments?: FieldOption[]
}

const props = withDefaults(
  defineProps<{
    schema: FormSchema
    modelValue?: Record<string, unknown>
    readonly?: boolean
    dataSources?: DataSources
    showActions?: boolean
  }>(),
  {
    modelValue: () => ({}),
    readonly: false,
    dataSources: () => ({}),
    showActions: true,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', data: Record<string, unknown>): void
  (e: 'submit', data: Record<string, unknown>): void
}>()

const fapi = ref<any>({})
const formData = ref<Record<string, unknown>>({})
const rules = ref<FormCreateRule[]>([])
const option = ref<Record<string, any>>({})
const submitting = ref(false)
/** 当前被条件显隐隐藏的字段标识集合（进入本集合的字段，其值会从输出数据中剔除） */
const hiddenFields = ref<Set<string>>(new Set())
/**
 * 子表单校验错误（按子表单 field 分组），经 provide 下发到对应 EngineSubForm 实例，
 * 在单元格与整体提示处呈现（design D2）。与 form-create 主表校验在提交时合并。
 */
const subFormErrors = ref<Record<string, SubFormErrorItem[]>>({})
provide('subFormErrors', subFormErrors)

const ctx = computed(() =>
  createContext({
    readonly: props.readonly,
    dataSources: {
      members: props.dataSources?.members ?? [],
      departments: props.dataSources?.departments ?? [],
    },
  }),
)

/** 提交按钮文字（缺省「提交」）与是否隐藏（表单属性 → 提交按钮） */
const submitBtnText = computed(() => props.schema.formConfig?.submitButton?.text || '提交')
const submitBtnHidden = computed(() => !!props.schema.formConfig?.submitButton?.hidden)

/** 依据 schema 重建 rule / option / 初始数据 */
function rebuild(): void {
  const schema = props.schema
  rules.value = schemaToRules(schema, ctx.value)
  const opt = schemaToOption(schema)
  if (props.readonly) opt.form = { ...opt.form, disabled: true }
  option.value = opt
  formData.value = {
    ...buildInitialData(schema.fields ?? []),
    ...(props.modelValue ?? {}),
  }
  hiddenFields.value = new Set()
  nextTick(applyVisibility)
}

/**
 * 计算并应用显隐规则。静态隐藏（`hidden`）的字段不参与求值：
 * 它已由 rule.hidden 收起，且 MUST NOT 因规则动作被解封，也不得进入剔除值的 hiddenFields 集合。
 */
function applyVisibility(): void {
  const api = fapi.value
  if (!api || typeof api.hidden !== 'function') return
  const dataFields = collectDataFields(props.schema.fields ?? [])
  const nextHidden = new Set<string>()
  for (const node of dataFields) {
    if (node.hidden === true) continue
    if (!node.visibleRule) continue
    const visible = evaluateVisibility(node.visibleRule, formData.value)
    if (!visible) nextHidden.add(node.field)
    api.hidden(!visible, node.field)
  }
  hiddenFields.value = nextHidden
}

watch(
  () => [props.schema, props.readonly, props.dataSources],
  () => rebuild(),
  { immediate: true, deep: true },
)

// form-create 实例就绪后应用一次显隐（处理初始即应隐藏的字段）
watch(fapi, () => nextTick(applyVisibility))

watch(
  formData,
  (val) => {
    emit('update:modelValue', { ...val })
    // 数据变化即清除既有子表单错误提示（下次提交/校验时重新计算）
    subFormErrors.value = {}
    applyVisibility()
  },
  { deep: true },
)

/** 获取当前表单数据（排除被条件显隐隐藏的字段与布局字段；静态隐藏字段的值保留；子表单值剔除空白行） */
function getData(): Record<string, unknown> {
  const api = fapi.value
  const raw: Record<string, unknown> =
    api && typeof api.formData === 'function' ? { ...api.formData() } : { ...formData.value }
  for (const key of hiddenFields.value) delete raw[key]
  // 子表单值：剔除完全空白行并按子字段 field 收敛键（含剥离 __rowKey，task 5.3）
  const subForms = collectDataFields(props.schema.fields ?? []).filter(isSubFormField)
  for (const node of subForms) {
    if (node.field in raw) raw[node.field] = stripEmptyRows(raw[node.field], node.subFields ?? [])
  }
  return raw
}

/** 编程式设值 */
function setData(patch: Record<string, unknown>): void {
  const api = fapi.value
  if (api && typeof api.setValue === 'function') {
    Object.entries(patch).forEach(([field, value]) => api.setValue(field, value))
  } else {
    formData.value = { ...formData.value, ...patch }
  }
}

/** 主表字段校验（form-create 管线；jsdom 下恒 true，运行时行为见 tests 说明） */
function validateMain(): Promise<boolean> {
  const api = fapi.value
  if (!api || typeof api.validate !== 'function') return Promise.resolve(true)
  return new Promise((resolve) => {
    api.validate((valid: boolean) => resolve(!!valid))
  })
}

/**
 * 子表单校验：收集可见子表单的行数据、逐个执行引擎自持校验，写入 subFormErrors。
 * 被条件显隐隐藏与静态隐藏（`hidden`）的子表单均不参与校验（task 5.3，隐藏优先）。
 * 返回是否全部通过。
 */
async function validateSubForms(): Promise<boolean> {
  const api = fapi.value
  const raw: Record<string, unknown> =
    api && typeof api.formData === 'function' ? { ...api.formData() } : { ...formData.value }
  const next: Record<string, SubFormErrorItem[]> = {}
  let allValid = true
  const subForms = collectDataFields(props.schema.fields ?? []).filter(isSubFormField)
  for (const node of subForms) {
    if (node.hidden === true || hiddenFields.value.has(node.field)) continue
    const errors = await validateSubForm(node, raw[node.field])
    if (errors.length) {
      next[node.field] = errors
      allValid = false
    }
  }
  subFormErrors.value = next
  return allValid
}

/** 校验表单：主表、子表单与整表提交校验依次执行，任一失败即不通过（互不吞没，design D2/D4） */
async function validate(): Promise<boolean> {
  const mainValid = await validateMain()
  const subValid = await validateSubForms()
  if (!mainValid || !subValid) return false
  // 整表提交校验：在字段/子表单校验之后，基于提交数据求值（design D4）
  const failMessage = evaluateSubmitValidation(props.schema.formConfig?.submitValidation, getData())
  if (failMessage) {
    ElMessage.error(failMessage)
    return false
  }
  return true
}

/** 清除校验状态 */
function clearValidate(): void {
  const api = fapi.value
  if (api && typeof api.clearValidateState === 'function') api.clearValidateState()
}

/** 重置为初始默认值 */
function reset(): void {
  formData.value = buildInitialData(props.schema.fields ?? [])
  clearValidate()
  nextTick(applyVisibility)
}

/** 提交：校验通过后输出数据 */
async function onSubmit(): Promise<void> {
  submitting.value = true
  try {
    const valid = await validate()
    if (valid) emit('submit', getData())
  } finally {
    submitting.value = false
  }
}

function onReset(): void {
  reset()
}

/**
 * 获取底层 form-create api 实例，供消费方执行高级操作
 * （如 scrollTo/focus/自定义校验触发等）。未就绪时返回 null。
 */
function getApi(): any {
  return fapi.value ?? null
}

defineExpose({ getData, setData, validate, clearValidate, reset, submit: onSubmit, getApi })
</script>

<style scoped>
.form-renderer {
  width: 100%;
}
.form-renderer__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 0;
}
</style>
