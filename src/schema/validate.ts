/**
 * form-schema 结构校验器。
 *
 * 校验一份 schema 文档是否符合契约：必需顶层字段、数据字段 field 唯一性（按作用域）、
 * 字段标识命名合法性（仅字母/数字/下划线且非系统保留字/注入关键词）、布局字段结构、
 * 条件引用完整性（显隐规则与表单级提交校验同一口径）、发布不变量，
 * 以及对未知字段类型的容错处理。对应 specs/form-schema
 * 「表单定义文档结构」「字段标识唯一性」「字段标识命名合法性」「子字段标识的子表单内作用域」
 * 「布局字段结构」「Schema 版本与向前兼容」「显隐规则数据表达」「条件引用完整性」
 * 「表单级配置结构校验」「表单发布状态」「结构校验问题的机器可读分类」。
 */

import { fieldIdErrorMessage } from './fieldId'
import {
  isDataField,
  isKnownFieldType,
  isLayoutType,
  isSubFormType,
  isTabsField,
  SUBFIELD_ALLOWED_TYPES,
  type FieldType,
  type FieldNode,
  type FormSchema,
  type SubFormNode,
} from './types'

export type ValidationSeverity = 'error' | 'warning'

/**
 * 结构校验问题的机器可读分类码（封闭取值集合）。
 *
 * 消费方（设计器阻断提示、问题清单、导入拒绝文案）SHALL 以本码为分支依据，
 * MUST NOT 依赖 `message` 的中文子串匹配——后者一改文案就静默失效。
 * 以常量数组派生联合类型，使运行期可枚举（供映射表做穷举覆盖断言）。
 * 对应 form-schema「结构校验问题的机器可读分类」、design.md D4。
 */
export const SCHEMA_ISSUE_CODES = [
  /* 顶层文档结构 */
  'SCHEMA_NOT_OBJECT',
  'MISSING_ID',
  'MISSING_NAME',
  'MISSING_VERSION',
  'MISSING_FIELDS',
  /* 字段节点结构 */
  'FIELDS_NOT_ARRAY',
  'FIELD_NOT_OBJECT',
  'FIELD_MISSING_TYPE',
  'UNKNOWN_FIELD_TYPE',
  'FIELD_MISSING_ID',
  'FIELD_ID_CONFLICT',
  'INVALID_FIELD_NAME',
  'DATA_FIELD_STRUCTURE_INVALID',
  /* 多标签页容器 */
  'TABS_MISSING',
  'TAB_NOT_OBJECT',
  /* 子表单与子字段 */
  'SUBFORM_MISSING_ID',
  'SUBFORM_STRUCTURE_INVALID',
  'SUBFIELD_NOT_OBJECT',
  'SUBFIELD_MISSING_TYPE',
  'SUBFIELD_TYPE_NOT_ALLOWED',
  'SUBFIELD_MISSING_ID',
  /* 条件引用完整性 */
  'VISIBILITY_REF_SELF',
  'VISIBILITY_REF_DANGLING',
  /* 表单级提交校验 */
  'SUBMIT_VALIDATION_NOT_ARRAY',
  'SUBMIT_VALIDATION_RULE_NOT_OBJECT',
  'SUBMIT_VALIDATION_EMPTY_CONDITIONS',
  'SUBMIT_VALIDATION_REF_DANGLING',
  'SUBMIT_VALIDATION_EMPTY_MESSAGE',
  /* 发布不变量 */
  'PUBLISHED_FIELD_MUTATED',
  'PUBLISHED_CATALOG_MISSING',
] as const

/** 结构校验问题分类码（取值见 `SCHEMA_ISSUE_CODES`） */
export type SchemaIssueCode = (typeof SCHEMA_ISSUE_CODES)[number]

export interface SchemaIssue {
  severity: ValidationSeverity
  /** 机器可读分类码：消费方分支的唯一依据（必填，以编译器保证每个产出点都归类） */
  code: SchemaIssueCode
  /** 出错位置（字段 key / field 或路径描述） */
  path: string
  message: string
  /**
   * 问题所属字段节点的设计器内部 key，供 UI 点击定位到画布卡片。
   * 表单级问题（id / name / formConfig.*）无对应卡片，故为可选。
   */
  fieldKey?: string
}

export interface SchemaValidationResult {
  valid: boolean
  issues: SchemaIssue[]
}

/** 条件引用的来源类别：字段显隐规则 / 表单级提交校验 */
type ConditionRefKind = 'visibility' | 'submit'

/**
 * 待二次遍历判定的条件引用（design.md D1）。
 *
 * 字段标识是边遍历边登记的，若在遍历途中内联判定引用，则「字段 A 的规则引用后文
 * 定义的字段 B」会因 B 尚未入集而被误判为悬空。前向引用是显隐规则的常见写法，
 * 故先收集、待全部标识登记完成后统一判定。
 */
interface PendingConditionRef {
  /** 条件项完整路径，形如 `fields[3].visibleRule.conditions[1]` */
  path: string
  /** 条件声明的依赖字段标识（未知结构，判定内做防御式检查） */
  field: unknown
  /** 规则所属节点自身的数据标识，用于判定自引用（提交校验无所属节点，为 undefined） */
  ownerField: string | undefined
  /** 规则所属节点的设计器内部 key，供 UI 定位 */
  fieldKey: string | undefined
  /** 引用来源，决定上报的分类码 */
  kind: ConditionRefKind
}

/**
 * 带发布标记的字段节点，待遍历结束后与清单快照比对（design.md D5）。
 */
interface PublishedNodeRef {
  /** 节点完整路径 */
  path: string
  /** 节点当前的数据标识 */
  field: string
  /** 节点的设计器内部 key，供 UI 定位 */
  fieldKey: string | undefined
  /** 所属子表单的数据标识；主表作用域节点为 undefined */
  ownerSubFormField: string | undefined
}

/**
 * 字段标识唯一性作用域。
 * - `seenFields`：本作用域内已登记的标识 -> 首次出现路径，冲突检测仅在作用域内进行；
 * - `knownFieldIds`：全表出现过的全部数据字段标识（跨作用域共享），供标识存在性判定，
 *   不参与冲突判定；
 * - `mainScopeFieldIds`：主表作用域的数据字段标识（跨作用域共享），是条件引用的
 *   有效目标集合（design.md D2）；
 * - `isMainScope`：本作用域是否为主表作用域，决定登记的标识是否计入 `mainScopeFieldIds`；
 * - `pendingRefs`：待统一判定的条件引用队列（跨作用域共享）；
 * - `publishedNodes`：带发布标记的节点（跨作用域共享），供发布不变量在遍历结束后判定。
 */
interface FieldIdScope {
  seenFields: Map<string, string>
  knownFieldIds: Set<string>
  mainScopeFieldIds: Set<string>
  isMainScope: boolean
  pendingRefs: PendingConditionRef[]
  publishedNodes: PublishedNodeRef[]
}

/** 派生子作用域：冲突检测彼此独立，标识集合与待判定队列仍与全表共享 */
function childScope(scope: FieldIdScope): FieldIdScope {
  return {
    seenFields: new Map(),
    knownFieldIds: scope.knownFieldIds,
    mainScopeFieldIds: scope.mainScopeFieldIds,
    // 子字段的值存于行记录数组内而非主表数据模型顶层，运行态求值取不到，
    // 故子字段标识 MUST NOT 计入条件引用的有效目标集合
    isMainScope: false,
    pendingRefs: scope.pendingRefs,
    publishedNodes: scope.publishedNodes,
  }
}

/** 建立根（主表）作用域 */
function rootScope(): FieldIdScope {
  return {
    seenFields: new Map(),
    knownFieldIds: new Set(),
    mainScopeFieldIds: new Set(),
    isMainScope: true,
    pendingRefs: [],
    publishedNodes: [],
  }
}

/**
 * 在给定作用域内登记数据字段标识并检测唯一性。子表单的子字段使用独立的子作用域
 * （行数据为独立对象，键只需在本清单内唯一），主表字段与各标签页内字段共享表单作用域。
 * 同时校验其命名合法性（字母/数字/下划线且不得为系统保留字/注入关键词与框架保留列）：标识即数据键与列名，
 * 命名不合法同样作 error 处理。非法标识仍参入唯一性登记，以便一次报出两个问题。
 * @param fieldKey 节点的设计器内部 key，随问题一同上报供 UI 定位（表单级问题无此值）
 * @returns 是否登记成功（本作用域内无冲突）
 */
function registerFieldId(
  fieldId: string,
  path: string,
  scope: FieldIdScope,
  issues: SchemaIssue[],
  fieldKey?: string,
): boolean {
  const naming = fieldIdErrorMessage(fieldId)
  if (naming) {
    issues.push({
      severity: 'error',
      code: 'INVALID_FIELD_NAME',
      path,
      message: naming,
      fieldKey,
    })
  }
  scope.knownFieldIds.add(fieldId)
  // 只有主表作用域的标识才能作为条件引用的目标（子字段在运行态整表求值中取不到值）
  if (scope.isMainScope) scope.mainScopeFieldIds.add(fieldId)
  const prev = scope.seenFields.get(fieldId)
  if (prev !== undefined) {
    issues.push({
      severity: 'error',
      code: 'FIELD_ID_CONFLICT',
      path,
      message: `字段标识冲突："${fieldId}" 在 ${prev} 与 ${path} 重复`,
      fieldKey,
    })
    return false
  }
  scope.seenFields.set(fieldId, path)
  return true
}

/**
 * 收集节点显隐规则的条件引用，待字段标识全部登记完成后统一判定（design.md D1）。
 *
 * 接入点覆盖四类挂载位置：主表字段、多标签页内字段（二者同走 validateFields 递归）、
 * 子表单自身与子表单子字段。入参为未知结构：虽在结构校验通过后调用，仍做防御式判断，
 * 避免脏文档导致抛错。
 */
function collectVisibilityRefs(node: unknown, scope: FieldIdScope, path: string): void {
  if (!node || typeof node !== 'object') return
  const rule = (node as { visibleRule?: unknown }).visibleRule
  if (!rule || typeof rule !== 'object') return
  const conditions = (rule as { conditions?: unknown }).conditions
  if (!Array.isArray(conditions)) return
  const ownerField = (node as { field?: unknown }).field
  const fieldKey = (node as { key?: unknown }).key
  conditions.forEach((cond, ci) => {
    scope.pendingRefs.push({
      path: `${path}.visibleRule.conditions[${ci}]`,
      field: (cond as { field?: unknown })?.field,
      ownerField: typeof ownerField === 'string' ? ownerField : undefined,
      fieldKey: typeof fieldKey === 'string' ? fieldKey : undefined,
      kind: 'visibility',
    })
  })
}

/**
 * 收集带发布标记的节点，待遍历结束后与清单快照比对（design.md D5）。
 * @param ownerSubFormField 子字段传其所属子表单的数据标识；主表作用域节点传 undefined
 */
function collectPublishedMarker(
  node: unknown,
  scope: FieldIdScope,
  path: string,
  ownerSubFormField: string | undefined,
): void {
  if (!node || typeof node !== 'object') return
  // 只约束显式带标记的节点；未标记节点（发布后新增）完全不参与判定
  if ((node as { published?: unknown }).published !== true) return
  const field = (node as { field?: unknown }).field
  // 缺标识或标识非字符串已由结构校验报错，此处不重复上报
  if (typeof field !== 'string' || field.length === 0) return
  const key = (node as { key?: unknown }).key
  scope.publishedNodes.push({
    path,
    field,
    fieldKey: typeof key === 'string' ? key : undefined,
    ownerSubFormField,
  })
}

/**
 * 校验子表单节点：自身 field 在表单作用域内唯一、subFields 结构、子字段类型白名单
 * （禁止布局字段与嵌套子表单）、子字段 field 在「本子表单」作用域内唯一。
 * 错误信息带节点完整路径。对应 form-schema「子表单字段结构」「子字段类型白名单与嵌套限制」
 * 「子字段标识的子表单内作用域」、design D6。
 */
function validateSubForm(
  node: SubFormNode,
  scope: FieldIdScope,
  issues: SchemaIssue[],
  path: string,
): void {
  // 子表单自身是主表作用域的数据字段：必须有唯一 field 标识
  const fieldId = (node as { field?: unknown }).field
  if (typeof fieldId !== 'string' || fieldId.length === 0) {
    issues.push({
      severity: 'error',
      code: 'SUBFORM_MISSING_ID',
      path,
      message: '子表单缺少 field 标识',
      fieldKey: node.key,
    })
  } else {
    registerFieldId(fieldId, path, scope, issues, node.key)
    // 子表单自身可携带作用于整块明细的显隐规则
    collectVisibilityRefs(node, scope, path)
    collectPublishedMarker(node, scope, path, undefined)
  }

  const subFields = (node as { subFields?: unknown }).subFields
  if (!Array.isArray(subFields)) {
    issues.push({
      severity: 'error',
      code: 'SUBFORM_STRUCTURE_INVALID',
      path: `${path}.subFields`,
      message: '子表单缺少子字段列表 subFields（必须是数组）',
      fieldKey: node.key,
    })
    return
  }

  // 子字段的标识唯一性以当前子表单为作用域：与主表字段、其他子表单的子字段同名不构成冲突
  const subScope = childScope(scope)

  subFields.forEach((sub, i) => {
    const subPath = `${path}.subFields[${i}]`
    if (!sub || typeof sub !== 'object') {
      issues.push({
        severity: 'error',
        code: 'SUBFIELD_NOT_OBJECT',
        path: subPath,
        message: '子字段必须是对象',
        // 子字段本身不是对象、拿不到自己的 key，定位到所属子表单卡片
        fieldKey: node.key,
      })
      return
    }
    const subKey = (sub as { key?: string }).key
    const subType = (sub as { type?: unknown }).type
    if (typeof subType !== 'string' || subType.length === 0) {
      issues.push({
        severity: 'error',
        code: 'SUBFIELD_MISSING_TYPE',
        path: subPath,
        message: '子字段缺少 type',
        fieldKey: node.key,
      })
      return
    }
    // 禁止嵌套子表单
    if (isSubFormType(subType)) {
      issues.push({
        severity: 'error',
        code: 'SUBFIELD_TYPE_NOT_ALLOWED',
        path: subPath,
        message: '子表单不可嵌套：subform 不能作为子字段',
        fieldKey: node.key,
      })
      return
    }
    // 白名单：仅常用数据字段（布局字段与未知类型均被拒绝）
    if (!(SUBFIELD_ALLOWED_TYPES as string[]).includes(subType)) {
      const kind = isLayoutType(subType as FieldType) ? '布局字段' : '字段类型'
      issues.push({
        severity: 'error',
        code: 'SUBFIELD_TYPE_NOT_ALLOWED',
        path: subPath,
        message: `${kind} "${subType}" 不可作为子表单的子字段（仅支持常用数据字段）`,
        fieldKey: node.key,
      })
      return
    }
    // 合法子字段：必须有 field 标识且在本子表单内唯一
    const subFieldId = (sub as { field?: unknown }).field
    if (typeof subFieldId !== 'string' || subFieldId.length === 0) {
      issues.push({
        severity: 'error',
        code: 'SUBFIELD_MISSING_ID',
        path: subPath,
        message: '子字段缺少 field 标识',
        fieldKey: node.key,
      })
      return
    }
    registerFieldId(subFieldId, subPath, subScope, issues, subKey ?? node.key)
    // 子字段的显隐规则同样需校验引用完整性（其目标仍只能是主表作用域标识）
    collectVisibilityRefs(sub, subScope, subPath)
    // 子字段按其所属子表单的快照子集合判定
    collectPublishedMarker(
      sub,
      subScope,
      subPath,
      typeof fieldId === 'string' ? fieldId : undefined,
    )
  })
}

/**
 * 校验字段节点列表（递归进入多标签页容器与子表单子字段）。
 * @param fields 字段节点数组
 * @param scope 标识唯一性作用域（主表与各标签页共享；子表单内部自行派生子作用域）
 * @param issues 收集问题
 * @param pathPrefix 路径前缀
 */
function validateFields(
  fields: unknown,
  scope: FieldIdScope,
  issues: SchemaIssue[],
  pathPrefix: string,
): void {
  if (!Array.isArray(fields)) {
    issues.push({
      severity: 'error',
      // 顶层 fields 缺失由 MISSING_FIELDS 报，本码专指递归进入页签时 tab.fields 非数组
      code: 'FIELDS_NOT_ARRAY',
      path: pathPrefix || 'fields',
      message: '字段列表必须是数组',
    })
    return
  }

  fields.forEach((node, index) => {
    const path = pathPrefix ? `${pathPrefix}[${index}]` : `fields[${index}]`

    if (!node || typeof node !== 'object') {
      issues.push({
        severity: 'error',
        code: 'FIELD_NOT_OBJECT',
        path,
        message: '字段节点必须是对象',
      })
      return
    }

    const fieldNode = node as FieldNode
    const type = (fieldNode as { type?: unknown }).type

    if (typeof type !== 'string' || type.length === 0) {
      issues.push({
        severity: 'error',
        code: 'FIELD_MISSING_TYPE',
        path,
        message: '字段节点缺少 type',
        fieldKey: fieldNode.key,
      })
      return
    }

    if (!isKnownFieldType(type)) {
      // 未知字段类型：以警告容错处理，不阻断其余字段（渲染器将占位）
      issues.push({
        severity: 'warning',
        code: 'UNKNOWN_FIELD_TYPE',
        path,
        message: `未知字段类型 "${type}"，将被占位处理`,
        fieldKey: fieldNode.key,
      })
      return
    }

    if (isLayoutType(fieldNode.type)) {
      // 布局字段：不要求 field 标识，不参与数据收集
      if (isTabsField(fieldNode)) {
        if (!Array.isArray((fieldNode as { tabs?: unknown }).tabs)) {
          issues.push({
            severity: 'error',
            code: 'TABS_MISSING',
            path,
            message: '多标签页字段缺少 tabs 数组',
            fieldKey: fieldNode.key,
          })
          return
        }
        fieldNode.tabs.forEach((tab, tabIndex) => {
          if (!tab || typeof tab !== 'object') {
            issues.push({
              severity: 'error',
              code: 'TAB_NOT_OBJECT',
              path: `${path}.tabs[${tabIndex}]`,
              message: '标签页必须是对象',
              fieldKey: fieldNode.key,
            })
            return
          }
          validateFields(tab.fields, scope, issues, `${path}.tabs[${tabIndex}].fields`)
        })
      }
      return
    }

    // 子表单：既是数据字段又是容器，交由专用校验（结构 + 白名单 + 子表单内标识唯一性）
    if (isSubFormType(type)) {
      validateSubForm(fieldNode as SubFormNode, scope, issues, path)
      return
    }

    // 常用数据字段：必须有 field 标识且全表唯一
    if (!isDataField(fieldNode)) {
      issues.push({
        severity: 'error',
        code: 'DATA_FIELD_STRUCTURE_INVALID',
        path,
        message: '数据字段节点结构无效',
        fieldKey: fieldNode.key,
      })
      return
    }

    const fieldId = fieldNode.field
    if (typeof fieldId !== 'string' || fieldId.length === 0) {
      issues.push({
        severity: 'error',
        code: 'FIELD_MISSING_ID',
        path,
        message: '数据字段缺少 field 标识',
        fieldKey: fieldNode.key,
      })
      return
    }

    registerFieldId(fieldId, path, scope, issues, fieldNode.key)
    collectVisibilityRefs(fieldNode, scope, path)
    collectPublishedMarker(fieldNode, scope, path, undefined)
  })
}

/**
 * 校验表单级提交校验规则（formConfig.submitValidation）：每条规则的 conditions MUST 为
 * 非空数组、message MUST 为非空字符串；条件引用的完整性则推入待判定队列，交由
 * `validateConditionRefs` 与字段显隐规则按**同一口径**判定（design.md D2）。
 * 对应 form-schema「表单级配置结构校验」「条件引用完整性」。
 * @param config formConfig（未知结构，内部做防御式判断）
 * @param scope 标识作用域，提供待判定队列与有效目标集合
 */
function validateSubmitValidation(
  config: unknown,
  scope: FieldIdScope,
  issues: SchemaIssue[],
): void {
  if (!config || typeof config !== 'object') return
  const rules = (config as { submitValidation?: unknown }).submitValidation
  if (rules === undefined || rules === null) return
  if (!Array.isArray(rules)) {
    issues.push({
      severity: 'error',
      code: 'SUBMIT_VALIDATION_NOT_ARRAY',
      path: 'formConfig.submitValidation',
      message: '表单提交校验规则必须是数组',
    })
    return
  }
  rules.forEach((rule, i) => {
    const path = `formConfig.submitValidation[${i}]`
    if (!rule || typeof rule !== 'object') {
      issues.push({
        severity: 'error',
        code: 'SUBMIT_VALIDATION_RULE_NOT_OBJECT',
        path,
        message: '提交校验规则必须是对象',
      })
      return
    }
    const conditions = (rule as { conditions?: unknown }).conditions
    if (!Array.isArray(conditions) || conditions.length === 0) {
      issues.push({
        severity: 'error',
        code: 'SUBMIT_VALIDATION_EMPTY_CONDITIONS',
        path: `${path}.conditions`,
        message: '提交校验规则的条件组不能为空（conditions 必须是非空数组）',
      })
    } else {
      conditions.forEach((cond, ci) => {
        scope.pendingRefs.push({
          path: `${path}.conditions[${ci}]`,
          field: (cond as { field?: unknown })?.field,
          // 表单级规则不属于任何字段节点，故既无自引用判定也无定位 key
          ownerField: undefined,
          fieldKey: undefined,
          kind: 'submit',
        })
      })
    }
    const message = (rule as { message?: unknown }).message
    if (typeof message !== 'string' || message.trim().length === 0) {
      issues.push({
        severity: 'error',
        code: 'SUBMIT_VALIDATION_EMPTY_MESSAGE',
        path: `${path}.message`,
        message: '提交校验规则的提示文案不能为空',
      })
    }
  })
}

/**
 * 判定条件引用的完整性（design.md D3）。
 *
 * 判定顺序：先判 `field` 是否为非空字符串，再判是否引用自身，最后判是否落在主表作用域
 * 标识集合内；**每条引用至多产出一条 issue**，否则「自引用且不在主表集合内」会重复上报。
 *
 * 有效目标集合是主表作用域标识而非全表标识：运行态求值上下文只有主表数据模型顶层，
 * 子字段的值存于行记录数组内，引用子字段会使条件恒为假——属「标识合法存在但运行态必然
 * 失效」，仅靠存在性判定识别不出来（design.md D2）。
 *
 * MUST 在字段树与提交校验规则均已收集完成后调用，以支持前向引用。
 */
function validateConditionRefs(scope: FieldIdScope, issues: SchemaIssue[]): void {
  for (const ref of scope.pendingRefs) {
    const isVisibility = ref.kind === 'visibility'
    const subject = isVisibility ? '显隐规则条件' : '提交校验条件'
    const danglingCode: SchemaIssueCode = isVisibility
      ? 'VISIBILITY_REF_DANGLING'
      : 'SUBMIT_VALIDATION_REF_DANGLING'
    const field = ref.field

    const report = (code: SchemaIssueCode, message: string): void => {
      issues.push({
        severity: 'error',
        code,
        path: ref.path,
        message,
        fieldKey: ref.fieldKey,
      })
    }

    if (typeof field !== 'string' || field.length === 0) {
      report(danglingCode, `${subject}引用了不存在的数据字段标识 "${String(field)}"`)
      continue
    }
    if (field === ref.ownerField) {
      // 只有显隐规则有所属节点；提交校验的 ownerField 恒为 undefined，不会误入本分支
      report(
        'VISIBILITY_REF_SELF',
        `${subject}不得引用字段自身 "${field}"（可见性依赖自身的值，求值无法收敛）`,
      )
      continue
    }
    if (scope.mainScopeFieldIds.has(field)) continue
    // 标识存在于 schema 但不在主表作用域，即子表单子字段：给出可操作的修复方向
    report(
      danglingCode,
      scope.knownFieldIds.has(field)
        ? `${subject}引用了子表单子字段标识 "${field}"，整表求值上下文只有主表数据模型，取不到该子字段的值（条件会恒为假）`
        : `${subject}引用了不存在的数据字段标识 "${field}"`,
    )
  }
}

/**
 * 发布不变量（design.md D5）：已发布表单中，带 `published` 标记的节点其数据标识 MUST 仍
 * 属于发布时的清单快照——标识即后端数据键与建表列名，改穿会让已提交数据对不上列。
 *
 * 按 `field` 集合成员判定而非按快照 `key` 对齐：`key` 是设计器内部标识、从字段池拖回时
 * 会重新分配，不是稳定身份；集合判定还顺带覆盖了「删除后拖回」路径（沿用原标识，故不误报）。
 *
 * `message` 不承诺给出快照中的「原值」：按集合成员判定只知道「当前标识不在快照内」，
 * 推不出它曾叫什么；用 `key` 反查同名条目作为原值线索会产生假阳性。
 */
function validatePublishedInvariant(
  config: unknown,
  scope: FieldIdScope,
  issues: SchemaIssue[],
): void {
  if (!config || typeof config !== 'object') return
  const cfg = config as { published?: unknown; publishedFields?: unknown }
  // 未发布表单不受本不变量约束
  if (cfg.published !== true) return

  const snapshot = Array.isArray(cfg.publishedFields) ? cfg.publishedFields : []
  // 主表作用域标识集合 S，以及各子表单快照条目的子字段标识子集合
  const mainIds = new Set<string>()
  const subFormSubIds = new Map<string, Set<string>>()
  for (const entry of snapshot) {
    if (!entry || typeof entry !== 'object') continue
    const entryField = (entry as { field?: unknown }).field
    if (typeof entryField !== 'string' || entryField.length === 0) continue
    mainIds.add(entryField)
    const entrySubFields = (entry as { subFields?: unknown }).subFields
    if (!Array.isArray(entrySubFields)) continue
    const ids = new Set<string>()
    for (const sub of entrySubFields) {
      const subId = (sub as { field?: unknown })?.field
      if (typeof subId === 'string' && subId.length > 0) ids.add(subId)
    }
    subFormSubIds.set(entryField, ids)
  }

  // 标记与清单不一致：报一条汇总而非逐字段报，避免误报风暴。
  // 快照为空且无带标记节点（发布时无数据字段的表单）则是合法状态，不进入本分支
  if (mainIds.size === 0 && scope.publishedNodes.length > 0) {
    issues.push({
      severity: 'error',
      code: 'PUBLISHED_CATALOG_MISSING',
      path: 'formConfig.publishedFields',
      message: `表单已发布且存在 ${scope.publishedNodes.length} 个带发布标记的字段，但已发布字段清单为空或缺失，无法校验标识是否被改穿`,
    })
    return
  }

  for (const node of scope.publishedNodes) {
    const allowed = node.ownerSubFormField ? subFormSubIds.get(node.ownerSubFormField) : mainIds
    if (allowed?.has(node.field)) continue
    issues.push({
      severity: 'error',
      code: 'PUBLISHED_FIELD_MUTATED',
      path: node.path,
      message: node.ownerSubFormField
        ? `已发布子字段的数据标识被改穿：${node.path} 当前为 "${node.field}"，不属于子表单 "${node.ownerSubFormField}" 发布时的清单快照`
        : `已发布字段的数据标识被改穿：${node.path} 当前为 "${node.field}"，不属于已发布字段清单快照`,
      fieldKey: node.fieldKey,
    })
  }
}

/**
 * 校验一份 form schema 文档。
 * @returns 校验结果，valid 为 true 当且仅当不存在 error 级问题（warning 不影响有效性）
 */
export function validateSchema(schema: unknown): SchemaValidationResult {
  const issues: SchemaIssue[] = []

  if (!schema || typeof schema !== 'object') {
    return {
      valid: false,
      issues: [
        { severity: 'error', code: 'SCHEMA_NOT_OBJECT', path: '', message: 'schema 必须是对象' },
      ],
    }
  }

  const doc = schema as Partial<FormSchema>

  if (typeof doc.id !== 'string' || doc.id.length === 0) {
    issues.push({
      severity: 'error',
      code: 'MISSING_ID',
      path: 'id',
      message: '缺少必需的表单标识 id',
    })
  }
  if (typeof doc.name !== 'string') {
    issues.push({
      severity: 'error',
      code: 'MISSING_NAME',
      path: 'name',
      message: '缺少必需的表单名称 name',
    })
  }
  if (typeof doc.version !== 'string' || doc.version.length === 0) {
    issues.push({
      severity: 'error',
      code: 'MISSING_VERSION',
      path: 'version',
      message: '缺少必需的 schema 版本号 version',
    })
  }
  if (!Array.isArray(doc.fields)) {
    issues.push({
      severity: 'error',
      code: 'MISSING_FIELDS',
      path: 'fields',
      message: '缺少必需的字段列表 fields',
    })
  }

  const scope: FieldIdScope = rootScope()
  if (Array.isArray(doc.fields)) {
    validateFields(doc.fields, scope, issues, '')
  }

  validateSubmitValidation(doc.formConfig, scope, issues)
  // 条件引用的完整性判定 MUST 在全部字段标识登记完成后执行，否则前向引用会被误判为悬空
  validateConditionRefs(scope, issues)
  // 发布不变量同样待遍历结束后判定（清单不参与字段树作用域，故不影响唯一性结论）
  validatePublishedInvariant(doc.formConfig, scope, issues)

  const hasError = issues.some((i) => i.severity === 'error')
  return { valid: !hasError, issues }
}
