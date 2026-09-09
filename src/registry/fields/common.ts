/**
 * 常用（数据）字段定义
 *
 * 每个定义包含：默认节点工厂、属性面板编辑器、图标、控件渲染定义（control）。
 * `control` 是控件形态的**单一来源**：设计器画布预览与子表单单元格经 FieldControl
 * 以 `<component :is>` 渲染 `control.component`，运行态主表经适配层以
 * `control.formCreateType` / `control.props()` 生成 form-create rule —— 属性映射只写一份，
 * 两轨不会走形（统一渲染单轨）。因此本文件的 `toRule` 由 `dataField()` 自动派生，无需手写。
 *
 * 对应 specs/form-fields、task 3.2。
 */

import type { Component } from 'vue'
import {
  ElCheckbox,
  ElCheckboxGroup,
  ElDatePicker,
  ElInput,
  ElInputNumber,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
} from 'element-plus'
import {
  ArrowDown,
  Calendar,
  CircleCheck,
  Document,
  EditPen,
  Finished,
  Menu,
  Odometer,
  OfficeBuilding,
  School,
  User,
  UserFilled,
} from '@element-plus/icons-vue'
import { isMultipleField, type DataFieldNode, type FieldOption } from '@/schema/types'
import { widthToSpan } from '@/schema/width'
import { buildValidate } from '@/adapter/validation'
import type {
  ControlDefinition,
  ControlItem,
  DataFieldDefinition,
  FormCreateRule,
  PropEditor,
  RuleContext,
} from '../types'

const DEFAULT_OPTIONS: FieldOption[] = [
  { label: '选项1', value: '选项1' },
  { label: '选项2', value: '选项2' },
]

/* -------------------------------------------------------------------------- */
/* 控件属性映射工具                                                             */
/* -------------------------------------------------------------------------- */

/** 读取节点属性中的数字项（属性面板可能写入字符串，统一强转并过滤非法值） */
function numOf(node: DataFieldNode, key: string): number | undefined {
  const v = node.props?.[key]
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** 日期字段的类型推导：仅 datetime 走日期时间，其余（含未配置）按日期 */
function dateTypeOf(node: DataFieldNode): 'date' | 'datetime' {
  return node.props?.dateType === 'datetime' ? 'datetime' : 'date'
}

/**
 * 日期字段的格式推导：`format` 与 `valueFormat` 必须同值。
 * 缺 value-format 时 el-date-picker 默认 emit Date 对象，`dateString` 归一化只认字符串
 * 会回填成空导致「选不了值」—— 该修复只需在此声明一次，两轨同时生效。
 */
function dateFormatOf(node: DataFieldNode): string {
  return dateTypeOf(node) === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'
}

/** 候选项来源：选项类字段取节点自身 options */
const nodeOptions: ControlItem['options'] = (node) => node.options ?? []
/** 候选项来源：成员类字段取运行期注入的数据源（未注入时为空列表，不报错） */
const memberOptions: ControlItem['options'] = (_node, ctx) => ctx.dataSources?.members ?? []
/** 候选项来源：部门类字段取运行期注入的数据源（未注入时为空列表，不报错） */
const departmentOptions: ControlItem['options'] = (_node, ctx) => ctx.dataSources?.departments ?? []

/** 组合控件子项：单选/复选以默认插槽承载文本 */
function slotItem(component: Component, options: ControlItem['options']): ControlItem {
  return { component, labelAs: 'slot', options }
}

/** 组合控件子项：下拉项以 label 属性承载文本 */
function propItem(component: Component, options: ControlItem['options']): ControlItem {
  return { component, labelAs: 'prop', options }
}

/* -------------------------------------------------------------------------- */
/* control -> form-create rule 派生                                            */
/* -------------------------------------------------------------------------- */

/**
 * 由控件定义派生 form-create rule。
 * rule.props 依次叠加：只读禁用 → 节点自定义属性透传 → 控件属性映射 → 显式占位。
 * `control.props()` 与 FieldControl 共用，故运行态与画布/子表单单元格的控件形态必然一致；
 * `disabled` 只在适配层叠加（预览态不加 disabled 以免灰化失真，design D3）。
 * 节点的 `hidden` 映射为 rule.hidden（隐藏但保留数据，不加 `ignore`），并因此跳过校验规则生成。
 */
function controlRule(
  node: DataFieldNode,
  control: ControlDefinition,
  ctx: RuleContext,
  extra: Partial<FormCreateRule> = {},
): FormCreateRule {
  const { props: extraProps, ...rest } = extra
  const props: Record<string, any> = {
    disabled: node.readonly === true || ctx.readonly === true,
    ...(node.props ?? {}),
    ...control.props(node, ctx),
    ...(extraProps ?? {}),
  }
  // 节点显式配置的占位优先于控件默认占位
  if (node.placeholder) props.placeholder = node.placeholder

  const rule: FormCreateRule = {
    type: control.formCreateType,
    field: node.field,
    title: node.title,
    props,
    col: { span: widthToSpan(node.width) },
    ...rest,
  }
  if (node.value !== undefined) rule.value = node.value
  // 静态隐藏：form-create 的 rule.hidden 仅收起控件而不丢弃数据，故隐藏字段的值仍会输出
  if (node.hidden === true) rule.hidden = true
  // 隐藏优先：隐藏的字段不生成校验规则（否则必填/格式校验会卡死无法填写的字段）
  const validate = node.hidden === true ? [] : buildValidate(node, isMultipleField(node.type))
  if (validate.length > 0) rule.validate = validate
  return rule
}

/**
 * 构建常用数据字段定义：`toRule` 由 `control` 自动派生，无需手写字段级映射。
 * 组合控件（单选组/复选组/下拉框）的 rule.options 与 FieldControl 的候选项取同一个
 * `control.item.options()`，消除「两轨各自取数」的重复。
 *
 * 本工厂对外导出：新增数据字段类型时只需声明一份 `control`，
 * 运行态 rule 与设计态控件形态即同时就位（参见 tests/fieldExtensibility.test.ts）。
 * 若某字段需要特殊 rule 结构（如子表单），可绕开本工厂直接声明 `toRule`。
 */
export function defineDataField(def: Omit<DataFieldDefinition, 'toRule'>): DataFieldDefinition {
  const { control } = def
  return {
    ...def,
    toRule: (node: DataFieldNode, ctx: RuleContext): FormCreateRule =>
      controlRule(
        node,
        control,
        ctx,
        control.item ? { options: control.item.options(node, ctx) } : {},
      ),
  }
}

/** 生成默认数据字段节点 */
function makeDefault(
  type: DataFieldNode['type'],
  label: string,
  extra: Partial<DataFieldNode> = {},
) {
  return (key: string, field: string): DataFieldNode => ({
    type,
    key,
    field,
    title: label,
    required: false,
    placeholder: `请输入${label}`,
    props: {},
    ...extra,
  })
}

const optionsEditors: PropEditor[] = [{ key: 'options', label: '选项', editor: 'options' }]

/* -------------------------------------------------------------------------- */
/* 字段定义                                                                    */
/* -------------------------------------------------------------------------- */

export const commonFieldDefinitions: DataFieldDefinition[] = [
  defineDataField({
    type: 'input',
    label: '单行文本',
    group: 'common',
    isData: true,
    icon: EditPen,
    createDefault: makeDefault('input', '单行文本'),
    propEditors: [{ key: 'maxlength', label: '最大长度', editor: 'number' }],
    control: {
      component: ElInput,
      formCreateType: 'input',
      valueKind: 'text',
      props: (node) => ({
        clearable: true,
        maxlength: numOf(node, 'maxlength'),
        placeholder: node.placeholder || '请输入',
      }),
    },
  }),
  defineDataField({
    type: 'textarea',
    label: '多行文本',
    group: 'common',
    isData: true,
    icon: Document,
    createDefault: makeDefault('textarea', '多行文本'),
    propEditors: [{ key: 'rows', label: '行数', editor: 'number', default: 3 }],
    control: {
      component: ElInput,
      formCreateType: 'input',
      valueKind: 'text',
      props: (node) => ({
        type: 'textarea',
        rows: numOf(node, 'rows') ?? 3,
        placeholder: node.placeholder || '请输入',
      }),
    },
  }),
  defineDataField({
    type: 'number',
    label: '数字',
    group: 'common',
    isData: true,
    icon: Odometer,
    createDefault: makeDefault('number', '数字', {
      placeholder: '请输入数字',
      props: { precision: 0 },
    }),
    propEditors: [
      { key: 'precision', label: '小数位数', editor: 'number', default: 0 },
      { key: 'min', label: '最小值', editor: 'number' },
      { key: 'max', label: '最大值', editor: 'number' },
      { key: 'step', label: '步长', editor: 'number', default: 1 },
    ],
    control: {
      component: ElInputNumber,
      formCreateType: 'inputNumber',
      valueKind: 'number',
      class: 'field-control__full',
      props: (node) => ({
        precision: numOf(node, 'precision') ?? 0,
        min: numOf(node, 'min'),
        max: numOf(node, 'max'),
        step: numOf(node, 'step') ?? 1,
        controlsPosition: 'right',
        placeholder: node.placeholder || '请输入数字',
      }),
    },
  }),
  defineDataField({
    type: 'date',
    label: '日期时间',
    group: 'common',
    isData: true,
    icon: Calendar,
    createDefault: makeDefault('date', '日期时间', {
      placeholder: '请选择日期',
      props: { dateType: 'date', format: 'YYYY-MM-DD' },
    }),
    propEditors: [
      {
        key: 'dateType',
        label: '日期类型',
        editor: 'select',
        default: 'date',
        options: [
          { label: '日期', value: 'date' },
          { label: '日期时间', value: 'datetime' },
        ],
      },
    ],
    control: {
      component: ElDatePicker,
      formCreateType: 'datePicker',
      valueKind: 'dateString',
      class: 'field-control__full',
      props: (node) => ({
        type: dateTypeOf(node),
        format: dateFormatOf(node),
        valueFormat: dateFormatOf(node),
        clearable: true,
        placeholder: node.placeholder || '请选择日期',
      }),
    },
  }),
  defineDataField({
    type: 'radio',
    label: '单选按钮组',
    group: 'common',
    isData: true,
    icon: CircleCheck,
    createDefault: makeDefault('radio', '单选按钮组', {
      placeholder: undefined,
      options: [...DEFAULT_OPTIONS],
    }),
    propEditors: optionsEditors,
    control: {
      component: ElRadioGroup,
      formCreateType: 'radio',
      valueKind: 'scalar',
      class: 'field-control__group',
      itemsInline: true,
      props: () => ({}),
      item: slotItem(ElRadio, nodeOptions),
    },
  }),
  defineDataField({
    type: 'checkbox',
    label: '复选框组',
    group: 'common',
    isData: true,
    icon: Finished,
    createDefault: makeDefault('checkbox', '复选框组', {
      placeholder: undefined,
      options: [...DEFAULT_OPTIONS],
      value: [],
    }),
    propEditors: optionsEditors,
    control: {
      component: ElCheckboxGroup,
      formCreateType: 'checkbox',
      valueKind: 'array',
      class: 'field-control__group',
      itemsInline: true,
      props: () => ({}),
      item: slotItem(ElCheckbox, nodeOptions),
    },
  }),
  defineDataField({
    type: 'select',
    label: '下拉框',
    group: 'common',
    isData: true,
    icon: ArrowDown,
    createDefault: makeDefault('select', '下拉框', {
      placeholder: '请选择',
      options: [...DEFAULT_OPTIONS],
    }),
    propEditors: optionsEditors,
    control: {
      component: ElSelect,
      formCreateType: 'select',
      valueKind: 'text',
      class: 'field-control__full',
      props: (node) => ({
        multiple: false,
        placeholder: node.placeholder || '请选择',
      }),
      item: propItem(ElOption, nodeOptions),
    },
  }),
  defineDataField({
    type: 'selectMultiple',
    label: '下拉复选框',
    group: 'common',
    isData: true,
    icon: Menu,
    createDefault: makeDefault('selectMultiple', '下拉复选框', {
      placeholder: '请选择（可多选）',
      options: [...DEFAULT_OPTIONS],
      value: [],
    }),
    propEditors: optionsEditors,
    control: {
      component: ElSelect,
      formCreateType: 'select',
      valueKind: 'array',
      class: 'field-control__full',
      props: (node) => ({
        multiple: true,
        placeholder: node.placeholder || '请选择（可多选）',
      }),
      item: propItem(ElOption, nodeOptions),
    },
  }),
  defineDataField({
    type: 'member',
    label: '成员单选',
    group: 'common',
    isData: true,
    icon: User,
    createDefault: makeDefault('member', '成员单选', { placeholder: '请选择成员' }),
    control: {
      component: ElSelect,
      formCreateType: 'select',
      valueKind: 'text',
      class: 'field-control__full',
      props: (node) => ({
        multiple: false,
        filterable: true,
        clearable: true,
        placeholder: node.placeholder || '请选择成员',
      }),
      item: propItem(ElOption, memberOptions),
    },
  }),
  defineDataField({
    type: 'memberMultiple',
    label: '成员多选',
    group: 'common',
    isData: true,
    icon: UserFilled,
    createDefault: makeDefault('memberMultiple', '成员多选', {
      placeholder: '请选择成员',
      value: [],
    }),
    control: {
      component: ElSelect,
      formCreateType: 'select',
      valueKind: 'array',
      class: 'field-control__full',
      props: (node) => ({
        multiple: true,
        filterable: true,
        clearable: true,
        placeholder: node.placeholder || '请选择成员',
      }),
      item: propItem(ElOption, memberOptions),
    },
  }),
  defineDataField({
    type: 'department',
    label: '部门单选',
    group: 'common',
    isData: true,
    icon: OfficeBuilding,
    createDefault: makeDefault('department', '部门单选', { placeholder: '请选择部门' }),
    control: {
      component: ElSelect,
      formCreateType: 'select',
      valueKind: 'text',
      class: 'field-control__full',
      props: (node) => ({
        multiple: false,
        filterable: true,
        clearable: true,
        placeholder: node.placeholder || '请选择部门',
      }),
      item: propItem(ElOption, departmentOptions),
    },
  }),
  defineDataField({
    type: 'departmentMultiple',
    label: '部门多选',
    group: 'common',
    isData: true,
    icon: School,
    createDefault: makeDefault('departmentMultiple', '部门多选', {
      placeholder: '请选择部门',
      value: [],
    }),
    control: {
      component: ElSelect,
      formCreateType: 'select',
      valueKind: 'array',
      class: 'field-control__full',
      props: (node) => ({
        multiple: true,
        filterable: true,
        clearable: true,
        placeholder: node.placeholder || '请选择部门',
      }),
      item: propItem(ElOption, departmentOptions),
    },
  }),
]
