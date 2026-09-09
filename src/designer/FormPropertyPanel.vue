<template>
  <div class="form-property-panel">
    <el-form label-position="top" size="small" class="form-property-panel__form">
      <div class="form-property-panel__header">
        <el-icon class="form-property-panel__header-icon"><Document /></el-icon>
        <div class="form-property-panel__header-text">
          <span class="form-property-panel__header-type">表单属性</span>
          <span class="form-property-panel__header-code">formConfig</span>
        </div>
        <el-tag size="small" type="info" effect="plain">整表级</el-tag>
      </div>

      <div class="form-property-panel__section">表单布局</div>
      <el-form-item label="标签对齐">
        <el-radio-group
          :model-value="resolved.labelPosition"
          @update:model-value="patch({ labelPosition: $event as LabelPosition })"
        >
          <el-radio-button value="right">右对齐</el-radio-button>
          <el-radio-button value="left">左对齐</el-radio-button>
          <el-radio-button value="top">顶部对齐</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="标签宽度(px)">
        <el-input-number
          :model-value="resolved.labelWidth"
          :min="0"
          :max="400"
          :step="5"
          controls-position="right"
          @update:model-value="patch({ labelWidth: $event as number })"
        />
      </el-form-item>
      <el-form-item label="控件尺寸">
        <el-radio-group
          :model-value="resolved.size"
          @update:model-value="patch({ size: $event as FormConfig['size'] })"
        >
          <el-radio-button value="large">大</el-radio-button>
          <el-radio-button value="default">中</el-radio-button>
          <el-radio-button value="small">小</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <div class="form-property-panel__section">提交按钮</div>
      <el-form-item label="提交按钮文字">
        <el-input
          :model-value="config.submitButton?.text ?? ''"
          placeholder="缺省为「提交」"
          @update:model-value="patchButton({ text: $event })"
        />
      </el-form-item>
      <el-form-item>
        <el-checkbox
          :model-value="!!config.submitButton?.hidden"
          label="隐藏提交按钮"
          @update:model-value="patchButton({ hidden: $event as boolean })"
        />
      </el-form-item>

      <!-- 提交校验：暂时不在表单属性中提供配置入口（当前由字段级校验覆盖），
           schema 的 formConfig.submitValidation 与渲染器运行逻辑保留，后续需要时再接回编辑器 -->
    </el-form>
  </div>
</template>

<script setup lang="ts">
/**
 * 表单属性面板：编辑整表级配置——表单布局（标签对齐/宽度/控件尺寸）、
 * 提交按钮（文字/隐藏）。通过 patch 事件上抛
 * Partial<FormConfig> 由设计器合并进 schema.formConfig。
 * 布局各项的显示值读契约层 `resolveFormConfig` 的解析结果（与画布、填报态同源），
 * 本面板 MUST NOT 自持兜底值；解析值仅用于展示，MUST NOT 回填进文档（故未交互时不发出 patch）。
 * 提交校验暂时不提供配置入口（formConfig.submitValidation 保留在 schema/渲染器层）。
 * 对应 specs/form-designer「表单级配置」「属性面板双上下文 tab」。
 */
import { computed } from 'vue'
import { Document } from '@element-plus/icons-vue'
import { resolveFormConfig } from '@/schema/defaults'
import type { CollectableDataField, FormConfig, LabelPosition } from '@/schema/types'

const props = defineProps<{
  config: FormConfig
  /** 数据字段（提交校验暂缓，保留入参以便后续接回 SubmitValidationEditor） */
  dataFields: CollectableDataField[]
}>()

const emit = defineEmits<{ (e: 'patch', patch: Partial<FormConfig>): void }>()

/** 布局项的展示值：缺省值由契约层解析（`src/schema/defaults.ts` 为全项目唯一出处） */
const resolved = computed(() => resolveFormConfig(props.config))

function patch(p: Partial<FormConfig>): void {
  emit('patch', p)
}
/** 合并写回 submitButton，避免覆盖未编辑的字段 */
function patchButton(p: Partial<NonNullable<FormConfig['submitButton']>>): void {
  emit('patch', { submitButton: { ...(props.config.submitButton ?? {}), ...p } })
}
</script>

<style scoped>
.form-property-panel {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
}
.form-property-panel__section {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin: 12px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.form-property-panel__header {
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
.form-property-panel__header-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}
.form-property-panel__header-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.form-property-panel__header-type {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.form-property-panel__header-code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono, monospace);
}
</style>
