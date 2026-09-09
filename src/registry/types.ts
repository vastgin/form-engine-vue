/**
 * 字段注册表接口定义（design.md 决策 3：单一字段目录驱动设计器与渲染器）。
 *
 * 每个字段类型声明：类型标识、分组、默认节点工厂、属性面板编辑器配置、
 * 控件渲染定义（control），以及 schema 节点 -> form-create rule 的映射器。
 * 设计器字段面板、属性面板、画布预览、子表单单元格与渲染器映射均从此注册表读取，
 * 保证设计态与运行态为同一轨道（统一渲染单轨）。
 */

import type { Component } from 'vue'
import type {
  DataFieldNode,
  FieldGroup,
  FieldNode,
  FieldOption,
  FieldType,
  LayoutFieldNode,
  SubFormNode,
} from '@/schema/types'

/** form-create rule（宽松类型，隔离第三方库细节） */
export type FormCreateRule = Record<string, any>

/** 渲染映射上下文：提供运行期注入的外部依赖 */
export interface RuleContext {
  /** 成员/部门等字段的候选数据源（无后端时由使用方注入） */
  dataSources: {
    members: FieldOption[]
    departments: FieldOption[]
  }
  /** 整表只读 */
  readonly?: boolean
  /**
   * 递归映射子字段节点为 rule（供容器字段如多标签页展开子字段使用）。
   * 由适配层注入，避免注册表与适配层循环依赖。
   */
  mapNodes?: (nodes: FieldNode[]) => FormCreateRule[]
}

/** 属性面板编辑器类型 */
export type PropEditorType = 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'options'

/* -------------------------------------------------------------------------- */
/* 控件渲染定义（统一渲染单轨）                                              */
/* -------------------------------------------------------------------------- */

/**
 * 控件值形态：驱动 FieldControl 对 `modelValue` 的归一化，
 * 避免 Element Plus 控件收到非法值（如日期控件收到空串、多选控件收到非数组）。
 * - `text`：字符串（null/undefined 归一为空串）
 * - `scalar`：保留 string|number 原型（选项值可能为数字，不能强转字符串否则勾选不中）
 * - `number`：仅 number，其余归一为 undefined
 * - `dateString`：非空字符串，其余归一为 undefined
 * - `array`：数组，其余归一为空数组
 */
export type ControlValueKind = 'text' | 'scalar' | 'number' | 'dateString' | 'array'

/**
 * 控件渲染上下文：由宿主（FieldControl）提供运行期注入依赖。
 * 结构上是 `RuleContext` 的子集，故适配层可直接将 `RuleContext` 传入，两轨共用同一份属性映射。
 */
export interface ControlContext {
  /** 成员/部门等字段的候选数据源（无后端时由使用方注入） */
  dataSources?: {
    members?: FieldOption[]
    departments?: FieldOption[]
  }
  /** 预览态：设计器画布中为 true，选项为空时呈现配置提示 */
  preview?: boolean
}

/**
 * 组合控件的子项描述：单选组/复选组/下拉框需逐个渲染候选项子组件。
 * 候选项来源与 form-create rule 的 `options` 共用同一个函数，消除两轨各自取数的重复。
 */
export interface ControlItem {
  /** 子项组件（ElRadio / ElCheckbox / ElOption） */
  component: Component
  /**
   * 文本承载方式：`slot` = 默认插槽（el-radio/el-checkbox），
   * `prop` = label 属性（el-option）。
   */
  labelAs: 'slot' | 'prop'
  /** 候选项：选项类取节点 options，成员/部门类取注入数据源 */
  options(node: DataFieldNode, ctx: ControlContext): FieldOption[]
}

/**
 * 控件定义：字段类型 -> 实际渲染的组件与属性映射。
 * 本定义同时服务两条消费路径，但属性映射只写一份：
 * - 设计器画布预览 / 子表单填报单元格：FieldControl 以 `<component :is>` 直接渲染 `component`；
 * - 运行态主表：适配层以 `formCreateType` 作为 rule.type，`props()` 作为 rule.props。
 */
export interface ControlDefinition {
  /** 承载 modelValue 的组件（Element Plus 控件） */
  component: Component
  /** form-create rule 的 type 名（与 component 同处声明，两轨不会走形） */
  formCreateType: string
  /** 值形态，决定 FieldControl 如何归一化 modelValue */
  valueKind: ControlValueKind
  /**
   * 组件属性映射（不含 model-value 与事件）。
   * 只描述控件形态相关的纯视觉/行为属性，不包含 `disabled`（由适配层根据只读上下文叠加）
   * 与宿主布局类名（由 `class` 单独声明），以免将设计器专用样式泄露到运行态。
   */
  props(node: DataFieldNode, ctx: ControlContext): Record<string, any>
  /** 组合控件的子项（单选组/复选组/下拉框），单组件控件缺省 */
  item?: ControlItem
  /**
   * 子项是否内联展开（单选组/复选组为 true，下拉框的候选项渲染在弹出层内为 false）。
   * 决定预览态候选为空时的配置提示是否写在控件内 —— 写入弹出层的提示在画布上不可见，故不启用。
   */
  itemsInline?: boolean
  /** 宿主侧根节点样式类（仅供 FieldControl 使用，不进入 rule） */
  class?: string
}

/**
 * 属性编辑器描述：驱动设计器属性面板中「字段类型专属配置」的渲染。
 * 通用属性（标题/字段标识/占位/必填/宽度/只读）由设计器统一处理，不在此列。
 */
export interface PropEditor {
  /** 对应 props 中的键 */
  key: string
  label: string
  editor: PropEditorType
  /** select 编辑器的可选项 */
  options?: { label: string; value: unknown }[]
  /** 默认值 */
  default?: unknown
}

/** 字段定义：注册表的基本单元 */
export interface FieldDefinition {
  /** 字段类型标识 */
  type: FieldType
  /** 中文显示名 */
  label: string
  /** 分组：常用 / 布局 */
  group: FieldGroup
  /** 是否为数据字段（参与数据收集） */
  isData: boolean
  /** 字段图标（设计器字段面板、画布卡片、属性面板头部共用） */
  icon?: Component
  /**
   * 创建新字段节点的默认值工厂。
   * @param key 节点唯一标识
   * @param field 数据标识（仅数据字段使用）
   */
  createDefault(key: string, field?: string): FieldNode
  /** 字段类型专属属性编辑器（供设计器属性面板使用） */
  propEditors?: PropEditor[]
  /**
   * 控件渲染定义：常用数据字段必填（驱动 FieldControl 与 rule 两轨）；
   * 布局与容器字段缺省，因其形态由专属组件（engine-divider / engine-tabs / engine-subform）承载。
   */
  control?: ControlDefinition
  /**
   * 将 schema 节点映射为 form-create rule（可能返回 null 表示不渲染，
   * 或返回 rule 数组用于容器展开）。
   */
  toRule(node: FieldNode, ctx: RuleContext): FormCreateRule | FormCreateRule[] | null
}

/** 数据字段定义（收窄类型，便于映射器实现） */
export interface DataFieldDefinition extends Omit<FieldDefinition, 'createDefault' | 'toRule'> {
  isData: true
  /** 数据字段必须声明控件定义，否则画布与子表单单元格无法渲染真实控件 */
  control: ControlDefinition
  createDefault(key: string, field: string): DataFieldNode
  toRule(node: DataFieldNode, ctx: RuleContext): FormCreateRule | null
}

/** 布局字段定义 */
export interface LayoutFieldDefinition extends Omit<FieldDefinition, 'createDefault' | 'toRule'> {
  isData: false
  createDefault(key: string): LayoutFieldNode
  toRule(node: LayoutFieldNode, ctx: RuleContext): FormCreateRule | FormCreateRule[] | null
}

/**
 * 子表单字段定义（数据字段变体）：`isData: true` 但 `toRule` 需读取 `subFields`
 * 以注入明细列配置与数据源（design D4）。
 */
export interface SubFormFieldDefinition extends Omit<FieldDefinition, 'createDefault' | 'toRule'> {
  isData: true
  createDefault(key: string, field: string): SubFormNode
  toRule(node: SubFormNode, ctx: RuleContext): FormCreateRule
}
