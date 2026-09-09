<template>
  <div class="options-editor">
    <div v-if="options.length" class="options-editor__head">
      <span class="options-editor__default">默认</span>
      <span class="options-editor__label">名称</span>
      <span class="options-editor__value">值</span>
      <span class="options-editor__ops">顺序 / 操作</span>
    </div>

    <div v-for="(opt, index) in options" :key="index" class="options-editor__row">
      <!-- 默认选中：单选类字段（单选按钮组/下拉框）用 radio，至多一项；
           多选类字段（复选框组/下拉复选框）用 checkbox，可多项 -->
      <span class="options-editor__default" title="填报时默认选中">
        <el-checkbox
          v-if="isMultiple"
          :model-value="isDefault(opt.value)"
          aria-label="默认选中"
          @update:model-value="onToggleDefault(opt.value)"
        />
        <el-radio
          v-else
          :model-value="radioDefault"
          :value="opt.value"
          aria-label="默认选中"
          @update:model-value="onToggleDefault(opt.value)"
        />
      </span>

      <el-input
        class="options-editor__label"
        :model-value="opt.label"
        size="small"
        placeholder="名称"
        @update:model-value="onLabel(index, $event)"
      />
      <el-input
        class="options-editor__value"
        :model-value="String(opt.value)"
        size="small"
        placeholder="值"
        @update:model-value="onValue(index, $event)"
      />

      <span class="options-editor__ops">
        <el-button
          link
          size="small"
          :icon="Top"
          :disabled="index === 0"
          title="上移"
          aria-label="上移选项"
          @click="onMove(index, index - 1)"
        />
        <el-button
          link
          size="small"
          :icon="Bottom"
          :disabled="index === options.length - 1"
          title="下移"
          aria-label="下移选项"
          @click="onMove(index, index + 1)"
        />
        <el-button link type="danger" size="small" @click="onRemove(index)">删除</el-button>
      </span>
    </div>

    <div class="options-editor__footer">
      <el-button size="small" :icon="Plus" @click="onAdd">添加选项</el-button>
      <!-- radio 无法通过再点一次取消选中，故以显式入口清除默认 -->
      <el-button v-if="hasDefault" link size="small" @click="onClearDefault">清除默认</el-button>
    </div>
    <p class="options-editor__hint">
      {{ isMultiple ? '「默认」列可勾选多项' : '「默认」列至多选中一项' }}，填报时即预选中；↑↓
      调整选项顺序
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * 选项列表编辑器：增删改选项、默认选中与顺序调整。
 * 默认选中写回字段节点的 `value`（填报时由 buildInitialData 归一化后作为初值），单选类字段
 * 至多一项、多选类字段可多项；选项值改名与选项删除会同步修正默认值，避免其指向已不存在的选项。
 * 顺序调整即填报态的选项呈现顺序。
 * 对应 specs/form-fields「选项类字段配置」、specs/form-designer「字段属性配置」。
 */
import { computed } from 'vue'
import { Bottom, Plus, Top } from '@element-plus/icons-vue'
import type { FieldOption } from '@/schema/types'
import {
  addOption,
  dropValueFromDefault,
  moveOption,
  normalizeDefaultValue,
  removeOption,
  renameValueInDefault,
  toggleDefaultValue,
  updateOption,
} from '@/registry/options'

const props = defineProps<{
  modelValue: FieldOption[]
  /** 是否多选字段：决定默认选中用单选（radio）还是多选（checkbox）形态 */
  multiple?: boolean
  /** 当前默认值（字段节点的 `value`） */
  defaultValue?: unknown
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: FieldOption[]): void
  (e: 'update:defaultValue', v: unknown): void
}>()

const options = computed<FieldOption[]>(() => props.modelValue ?? [])
const isMultiple = computed(() => props.multiple === true)
/** 「未设默认」哨兵：含空字符，不会与用户填写的选项值相撞 */
const NO_DEFAULT = '\u0000no-default'
/** 单选字段的当前默认值（数组形态归一为单值，兼容历史数据） */
const singleDefault = computed(() =>
  isMultiple.value ? undefined : normalizeDefaultValue(props.defaultValue, false),
)
/**
 * 单选控件的绑定值：el-radio 在 change 时会以当前 model 值触发事件参数校验，
 * model 为 undefined 会打出告警，故以一个不可能出现在选项值中的哨兵代表「未设默认」。
 */
const radioDefault = computed(() => singleDefault.value ?? NO_DEFAULT)
/** 多选字段的当前默认选中值清单 */
const defaultValues = computed<FieldOption['value'][]>(() => {
  const normalized = normalizeDefaultValue(props.defaultValue, true)
  return Array.isArray(normalized) ? (normalized as FieldOption['value'][]) : []
})
const hasDefault = computed(() =>
  isMultiple.value ? defaultValues.value.length > 0 : singleDefault.value !== undefined,
)

function isDefault(value: FieldOption['value']): boolean {
  return defaultValues.value.includes(value)
}

function onAdd(): void {
  emit('update:modelValue', addOption(options.value))
}
function onRemove(index: number): void {
  const removed = options.value[index]
  emit('update:modelValue', removeOption(options.value, index))
  if (removed) {
    emit(
      'update:defaultValue',
      dropValueFromDefault(props.defaultValue, removed.value, isMultiple.value),
    )
  }
}
function onLabel(index: number, label: string): void {
  emit('update:modelValue', updateOption(options.value, index, { label }))
}
function onValue(index: number, value: string): void {
  const oldValue = options.value[index]?.value
  emit('update:modelValue', updateOption(options.value, index, { value }))
  if (oldValue !== undefined && oldValue !== value) {
    emit(
      'update:defaultValue',
      renameValueInDefault(props.defaultValue, oldValue, value, isMultiple.value),
    )
  }
}
/** 上移/下移调整选项顺序 */
function onMove(from: number, to: number): void {
  emit('update:modelValue', moveOption(options.value, from, to))
}
/** 默认选中：单选取该值，多选在清单中增删该值 */
function onToggleDefault(value: FieldOption['value']): void {
  emit('update:defaultValue', toggleDefaultValue(props.defaultValue, value, isMultiple.value))
}
function onClearDefault(): void {
  emit('update:defaultValue', isMultiple.value ? [] : undefined)
}
</script>

<style scoped>
.options-editor__row,
.options-editor__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.options-editor__head {
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.options-editor__default {
  flex: none;
  width: 30px;
  text-align: center;
}
.options-editor__label {
  flex: 1.15;
  min-width: 0;
}
.options-editor__value {
  flex: 1;
  min-width: 0;
}
.options-editor__ops {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
}
/* 裸控件不带文字：去掉组件默认右间距与空标签位，避免窄面板下挤占输入框 */
.options-editor__default :deep(.el-radio) {
  height: auto;
  margin-right: 0;
}
.options-editor__default :deep(.el-radio__label),
.options-editor__default :deep(.el-checkbox__label) {
  display: none;
}
.options-editor__footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* gap 已负责间距，抵消组件库相邻按钮的默认左边距 */
.options-editor__ops :deep(.el-button + .el-button),
.options-editor__footer :deep(.el-button + .el-button) {
  margin-left: 0;
}
.options-editor__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
