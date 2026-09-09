/**
 * form-schema：表单引擎的核心数据契约类型定义。
 *
 * 该模块定义描述一张表单的纯 JSON 结构（schema），涵盖字段节点、布局、
 * 字段通用属性、校验规则与显隐规则的数据表达，作为设计器输出、渲染器输入
 * 及后续持久化的唯一稳定契约。对应 specs/form-schema。
 */

/** 当前 schema 契约版本号 */
export const SCHEMA_VERSION = '1.1'

/** 子表单最多行数硬上限（渲染层与属性面板据此钳制 maxRows） */
export const SUBFORM_MAX_ROWS = 500

/**
 * 子表单最多行数的缺省值：设计器拖入新子表单时写入的默认上限，
 * 同时也是 maxRows 未配置时渲染层的生效行数（与硬上限区分：缺省 200、最高可调至 500）。
 */
export const SUBFORM_DEFAULT_MAX_ROWS = 200

/** 字段分组：常用字段 / 高级字段 / 布局字段 */
export type FieldGroup = 'common' | 'advanced' | 'layout'

/**
 * 常用（数据）字段类型清单 —— （12 类）。
 * 单一事实来源：联合类型 `CommonFieldType`、子字段白名单与 schema 校验的已知类型集
 * 均由本清单派生，新增字段类型只需在此登记一次。
 */
export const COMMON_FIELD_TYPES = [
  'input', // 单行文本
  'textarea', // 多行文本
  'number', // 数字
  'date', // 日期时间
  'radio', // 单选按钮组
  'checkbox', // 复选框组
  'select', // 下拉框
  'selectMultiple', // 下拉复选框
  'member', // 成员单选
  'memberMultiple', // 成员多选
  'department', // 部门单选
  'departmentMultiple', // 部门多选
] as const

/** 常用（数据）字段类型 */
export type CommonFieldType = (typeof COMMON_FIELD_TYPES)[number]

/**
 * 高级字段类型清单
 */
export const ADVANCED_FIELD_TYPES = ['subform'] as const

/** 高级字段类型 */
export type AdvancedFieldType = (typeof ADVANCED_FIELD_TYPES)[number]

/** 布局字段类型清单 */
export const LAYOUT_FIELD_TYPES = ['divider', 'text', 'tabs'] as const

/** 布局字段类型 */
export type LayoutFieldType = (typeof LAYOUT_FIELD_TYPES)[number]

/** 全部字段类型 */
export type FieldType = CommonFieldType | AdvancedFieldType | LayoutFieldType

/** 选项（用于选项类字段：单选/复选/下拉/下拉复选） */
export interface FieldOption {
  label: string
  value: string | number | boolean
}

/* -------------------------------------------------------------------------- */
/* 校验规则数据表达                                                             */
/* -------------------------------------------------------------------------- */

/** 校验规则类型 */
export type ValidationRuleType =
  'required' | 'maxLength' | 'minLength' | 'max' | 'min' | 'pattern' | 'custom'

/** 正则格式预设 */
export type PatternPreset = 'phone' | 'email' | 'url' | 'idcard' | 'custom'

/** 字段校验规则（纯数据表达，由渲染器执行） */
export interface ValidationRule {
  type: ValidationRuleType
  /** 规则参数：长度/数值边界为 number；pattern 自定义正则为 string */
  value?: number | string
  /** pattern 规则的预设格式 */
  preset?: PatternPreset
  /** 校验失败提示文案 */
  message?: string
  /** 触发时机 */
  trigger?: 'blur' | 'change'
}

/* -------------------------------------------------------------------------- */
/* 显隐规则数据表达                                                             */
/* -------------------------------------------------------------------------- */

/** 比较操作符 */
export type ComparisonOperator =
  'eq' | 'neq' | 'contains' | 'notContains' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'notEmpty'

/** 多条件逻辑关系 */
export type LogicOperator = 'and' | 'or'

/** 单个显隐条件：依赖字段 + 操作符 + 目标值 */
export interface VisibilityCondition {
  /** 依赖的数据字段标识（field） */
  field: string
  operator: ComparisonOperator
  /** 目标值；empty/notEmpty 操作符可省略 */
  value?: unknown
}

/** 显隐规则：条件组满足时执行 show/hide 动作 */
export interface VisibilityRule {
  logic: LogicOperator
  conditions: VisibilityCondition[]
  /** 条件命中时的动作：显示或隐藏本字段 */
  action: 'show' | 'hide'
}

/* -------------------------------------------------------------------------- */
/* 字段节点                                                                     */
/* -------------------------------------------------------------------------- */

/** 字段节点公共属性 */
export interface FieldNodeBase {
  type: FieldType
  /** 节点唯一标识（设计器内部使用，区别于数据标识 field） */
  key: string
  /** 显示标题 */
  title?: string
  /** 字段宽度百分比（1-100），用于布局 */
  width?: number
  /**
   * 发布标记：表单发布时给当时已存在的全部字段打上，发布后的字段其数据标识 `field`
   * MUST NOT 再被修改（避免线上已收集数据的键失效）；发布后新增的字段不带此标记。
   * 缺省（未发布）时标识可自由修改。
   */
  published?: boolean
  /** 字段类型专属属性配置 */
  props?: Record<string, unknown>
}

/** 数据（常用）字段节点 */
export interface DataFieldNode extends FieldNodeBase {
  type: CommonFieldType
  /** 数据标识，表单内唯一；命名受 FIELD_ID_PATTERN 与 SQL 保留字黑名单约束（见 fieldId.ts） */
  field: string
  title: string
  /** 是否必填 */
  required?: boolean
  /** 占位提示 */
  placeholder?: string
  /** 默认值 */
  value?: unknown
  /** 只读/禁用 */
  readonly?: boolean
  /**
   * 静态隐藏：填报态不展示该字段，但其值仍随表单数据输出（常用于默认值、系统参数类字段）。
   * 作为子表单的子字段时表现为不呈现该列，已注入的值仍随行数据输出。
   * 与 `visibleRule` 条件显隐的区别：被条件显隐隐藏的字段值会从输出数据中剔除，而静态隐藏保留值。
   * 隐藏的字段不参与必填与校验规则求值（否则用户无法填写会导致永远无法提交），
   * 缺省按不隐藏处理。布局字段无此属性。
   */
  hidden?: boolean
  /** 选项列表（选项类字段） */
  options?: FieldOption[]
  /** 校验规则 */
  validate?: ValidationRule[]
  /** 显隐规则 */
  visibleRule?: VisibilityRule
}

/**
 * 子表单字段节点：既是数据字段（值为对象数组 array<object>），又是子字段容器。
 * 子字段仅允许常用数据字段（见 SUBFIELD_ALLOWED_TYPES），禁止布局字段与嵌套子表单。
 * 对应 form-schema「子表单字段结构」、design D4。
 */
export interface SubFormNode extends FieldNodeBase {
  type: 'subform'
  /** 数据标识，表单内唯一；命名规则同普通数据字段 */
  field: string
  title: string
  /** 整体是否必填：至少存在一行有效数据 */
  required?: boolean
  /** 只读：无增删行入口且单元格不可修改 */
  readonly?: boolean
  /** 静态隐藏：填报态不展示整块明细，但已填行数据仍随表单输出，且子表单校验不生效（含义同普通字段 hidden）；
   * 其子字段各自的 hidden 则按列生效（不呈现该列但保留列值） */
  hidden?: boolean
  /** 有序子字段列表（顺序即明细列顺序） */
  subFields: DataFieldNode[]
  /**
   * 已有字段池：曾配置为子字段、后被移除但仍保留完整定义的字段（设计器「已有字段」入口的数据源）。
   * 池内字段 MUST NOT 参与渲染、数据收集与 field 唯一性校验（getChildArrays 不下降进入本属性），
   * 加回时沿用其原有 `field` 标识与配置；缺省为空。
   */
  fieldPool?: DataFieldNode[]
  /** 行数与其余类型专属配置 */
  props?: {
    /** 初始行数：新建填报时预置的空行数，缺省按 0（不预置行）；填报时可全部删除，不作为删除下限 */
    minRows?: number
    /** 最多行数：缺省按 SUBFORM_DEFAULT_MAX_ROWS（200），不超过 SUBFORM_MAX_ROWS（500），超出按上限钳制 */
    maxRows?: number
    /** 固定左列数：明细表格横向滚动时冻结左侧前 N 个数据列，缺省按 0（design D9） */
    fixedLeftColumns?: number
    /** 固定右列数：冻结右侧后 N 个数据列，与左合计不超过子字段数，缺省按 0（design D9） */
    fixedRightColumns?: number
    /** 允许批量删除：开启后填报态序号列变为勾选列，并在底部提供批量删除入口，缺省关闭 */
    allowBatchRemove?: boolean
    [k: string]: unknown
  }
  /** 显隐规则（作用于子表单整体） */
  visibleRule?: VisibilityRule
}

/** 分割线字段节点 */
export interface DividerFieldNode extends FieldNodeBase {
  type: 'divider'
}

/** 说明文字字段节点 */
export interface TextFieldNode extends FieldNodeBase {
  type: 'text'
  props?: {
    /** 说明文本内容 */
    content?: string
    [k: string]: unknown
  }
}

/** 多标签页中的单个标签页 */
export interface TabsTab {
  key: string
  title: string
  /** 标签页容器内的子字段节点 */
  fields: FieldNode[]
}

/** 多标签页字段节点（容器） */
export interface TabsFieldNode extends FieldNodeBase {
  type: 'tabs'
  tabs: TabsTab[]
}

/** 布局字段节点联合类型 */
export type LayoutFieldNode = DividerFieldNode | TextFieldNode | TabsFieldNode

/** 参与顶层数据收集的字段节点：常用数据字段或子表单（子表单值为对象数组） */
export type CollectableDataField = DataFieldNode | SubFormNode

/** 任意字段节点 */
export type FieldNode = DataFieldNode | SubFormNode | LayoutFieldNode

/**
 * 已发布字段清单条目：结构即一个主表数据字段节点（常用字段或子表单整体）的完整定义快照。
 * 与画布的关联以数据标识 `field` 为准（设计器内部 key 在拖回时会重新分配）。
 * 对应 form-designer「已发布字段清单」。
 */
export type PublishedFieldEntry = CollectableDataField

/* -------------------------------------------------------------------------- */
/* 表单级配置与文档                                                             */
/* -------------------------------------------------------------------------- */

/** 标签对齐方式 */
export type LabelPosition = 'top' | 'left' | 'right'

/**
 * 提交按钮配置（表单属性 → 提交按钮）。
 * 缺省时文字为「提交」且不隐藏。对应 form-schema「表单级提交按钮配置」。
 */
export interface SubmitButtonConfig {
  /** 自定义提交按钮文字，缺省按「提交」 */
  text?: string
  /** 是否隐藏提交按钮（不影响编程式提交） */
  hidden?: boolean
}

/**
 * 整表提交校验规则（表单属性 → 提交校验）：条件组命中即阻止提交并展示提示文案。
 * 条件项复用显隐规则的 `VisibilityCondition` 与逻辑关系 `LogicOperator`。
 * 对应 form-schema「表单级提交校验数据表达」。
 */
export interface SubmitValidationRule {
  /** 多条件的与/或组合关系 */
  logic: LogicOperator
  /** 条件列表（复用显隐规则条件结构） */
  conditions: VisibilityCondition[]
  /** 校验不通过（条件组命中）时的提示文案 */
  message: string
}

/** 表单级配置 */
export interface FormConfig {
  labelPosition?: LabelPosition
  labelWidth?: number
  size?: 'large' | 'default' | 'small'
  /** 整表只读 */
  disabled?: boolean
  /** 提交按钮文字/隐藏（表单属性 → 提交按钮） */
  submitButton?: SubmitButtonConfig
  /** 整表提交校验规则列表（表单属性 → 提交校验） */
  submitValidation?: SubmitValidationRule[]
  /**
   * 发布状态：为真表示表单已发布，此时字段节点上的 `published` 标记生效（已标记字段的
   * 数据标识不可修改）。设计器不提供取消发布，故该标记只会缺省（未发布）或为真。
   */
  published?: boolean
  /**
   * 发布版本号：首次发布为 1，之后每次「再次发布」递增。
   * 发布可反复执行（表单新增字段后需再次发布使其标识锁定），版本号即区分发布批次。
   */
  publishedVersion?: number
  /** 最近一次发布时间（ISO 字符串），每次发布刷新 */
  publishedAt?: string
  /**
   * 已发布字段清单：最近一次发布时主表作用域全部数据字段（含多标签页内字段与子表单整体，
   * MUST NOT 含子表单子字段与布局字段）的定义快照，按 `field` 去重；每次发布按当时画布重建。
   * 清单独立于画布存在：字段从画布删除后条目仍保留，可在设计器左侧「字段」面板原样拖回
   * （沿用字段标识）；画布中已在用的条目置灰不可拖。
   */
  publishedFields?: PublishedFieldEntry[]
}

/**
 * 表单级布局配置的解析结果：布局相关项全部必填，缺省值已由 `resolveFormConfig` 填充。
 * 设计器画布、设计器属性面板与运行态渲染三方 SHALL 共同读取本结果，任一方 MUST NOT
 * 自行持有第二份兜底值。对应 form-schema「表单级配置缺省值的单一来源」。
 */
export type ResolvedFormConfig = Required<Pick<FormConfig, 'labelPosition' | 'labelWidth' | 'size'>>

/** 表单定义文档（form schema） */
export interface FormSchema {
  /** 表单标识 */
  id: string
  /** 表单名称 */
  name: string
  /** schema 版本号 */
  version: string
  /** 字段节点有序列表 */
  fields: FieldNode[]
  /** 表单级配置 */
  formConfig?: FormConfig
}

/* -------------------------------------------------------------------------- */
/* 类型守卫                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 可作为子表单子字段的类型白名单：仅常用（数据）字段，
 * 排除布局字段与子表单本身（禁止嵌套）。对应 form-schema「子字段类型白名单与嵌套限制」。
 */
export const SUBFIELD_ALLOWED_TYPES: CommonFieldType[] = [...COMMON_FIELD_TYPES]

/**
 * 契约已知的全部字段类型（由三份清单派生，不再各自硬编码）。
 * schema 校验据此识别未知类型并降级为警告。
 */
export const KNOWN_FIELD_TYPES: readonly string[] = [
  ...COMMON_FIELD_TYPES,
  ...ADVANCED_FIELD_TYPES,
  ...LAYOUT_FIELD_TYPES,
]

/** 判断类型标识是否为契约已知的字段类型 */
export function isKnownFieldType(type: string): boolean {
  return KNOWN_FIELD_TYPES.includes(type)
}

/** 判断是否为布局字段类型 */
export function isLayoutType(type: FieldType): type is LayoutFieldType {
  return (LAYOUT_FIELD_TYPES as readonly string[]).includes(type)
}

/** 判断是否为常用（数据）字段类型 */
export function isCommonFieldType(type: FieldType | string): type is CommonFieldType {
  return (COMMON_FIELD_TYPES as readonly string[]).includes(type)
}

/** 判断是否为子表单类型 */
export function isSubFormType(type: FieldType | string): type is AdvancedFieldType {
  return type === 'subform'
}

/** 判断节点是否为常用数据字段（不含子表单与布局字段） */
export function isDataField(node: FieldNode): node is DataFieldNode {
  return isCommonFieldType(node.type) && typeof (node as DataFieldNode).field === 'string'
}

/** 判断节点是否为子表单字段（既是数据字段又是子字段容器） */
export function isSubFormField(node: FieldNode): node is SubFormNode {
  return isSubFormType(node.type)
}

/** 判断节点是否为布局字段 */
export function isLayoutField(node: FieldNode): node is LayoutFieldNode {
  return isLayoutType(node.type)
}

/** 判断节点是否为多标签页容器 */
export function isTabsField(node: FieldNode): node is TabsFieldNode {
  return node.type === 'tabs'
}

/** 判断是否为选项类字段 */
export function isOptionField(
  type: FieldType,
): type is 'radio' | 'checkbox' | 'select' | 'selectMultiple' {
  return type === 'radio' || type === 'checkbox' || type === 'select' || type === 'selectMultiple'
}

/** 判断是否为多选（返回集合）字段 */
export function isMultipleField(
  type: FieldType,
): type is 'checkbox' | 'selectMultiple' | 'memberMultiple' | 'departmentMultiple' {
  return (
    type === 'checkbox' ||
    type === 'selectMultiple' ||
    type === 'memberMultiple' ||
    type === 'departmentMultiple'
  )
}
