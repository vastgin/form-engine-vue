/**
 * 表单级配置缺省值的单一来源（design.md D6）。
 *
 * 设计器画布、设计器属性面板与运行态渲染三方共同读取 `resolveFormConfig` 的结果，
 * 任一方 MUST NOT 自行持有第二份兜底值——否则会出现「画布一种标签宽度、填报另一种」的
 * 所见非所得（历史上 labelWidth 的兜底值曾同时存在 100/120/125 三种）。
 * 对应 form-schema「表单级配置缺省值的单一来源」。
 */

import type { FormConfig, ResolvedFormConfig } from './types'

/** 表单级布局配置的缺省值（全项目唯一出处） */
export const FORM_CONFIG_DEFAULTS: ResolvedFormConfig = {
  labelPosition: 'right',
  labelWidth: 125,
  size: 'default',
}

/**
 * 解析表单级配置的布局缺省值。
 *
 * 纯函数：只读入参，既不修改入参也不回填文档——未显式声明 `labelWidth` 的文档
 * 在导入导出往返后仍不含该字段（缺省只作用于读取）。
 */
export function resolveFormConfig(config?: FormConfig): ResolvedFormConfig {
  return {
    labelPosition: config?.labelPosition ?? FORM_CONFIG_DEFAULTS.labelPosition,
    labelWidth: config?.labelWidth ?? FORM_CONFIG_DEFAULTS.labelWidth,
    size: config?.size ?? FORM_CONFIG_DEFAULTS.size,
  }
}
