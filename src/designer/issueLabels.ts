/**
 * 结构校验分类码 → 中文分类标签（design.md D7 / task 6.2）。
 *
 * 独立成模块而非写在 FormDesigner.vue 内，是为让「映射表覆盖全部分类码」可被单测穷举断言：
 * 类型上取 `Record<SchemaIssueCode, string>`，故契约层新增一个 code 而此处漏配时编译即失败；
 * 测试再对 `SCHEMA_ISSUE_CODES` 逐项断言标签非空，双保险。
 *
 * 措辞约束：`FIELD_ID_CONFLICT` MUST 为「字段标识重复」、`INVALID_FIELD_NAME` MUST 为
 * 「字段标识命名不合法」——保存/发布的汇总提示以标签开篇，而 form-designer 主 spec 的
 * 「保存被字段标识重复阻断」「保存与发布被非法命名阻断」两条 Scenario 对这两句文案有断言。
 */

import type { SchemaIssueCode } from '@/schema/validate'

/** 分类码到中文标签的完备映射（键集合等于 `SchemaIssueCode` 的全部取值） */
export const ISSUE_CODE_LABELS: Record<SchemaIssueCode, string> = {
  /* 顶层文档结构 */
  SCHEMA_NOT_OBJECT: '文档不是对象',
  MISSING_ID: '缺少表单 ID',
  MISSING_NAME: '缺少表单名称',
  MISSING_VERSION: '缺少 schema 版本',
  MISSING_FIELDS: '缺少字段列表',
  /* 字段节点结构 */
  FIELDS_NOT_ARRAY: '字段列表不是数组',
  FIELD_NOT_OBJECT: '字段节点不是对象',
  FIELD_MISSING_TYPE: '字段缺少类型',
  UNKNOWN_FIELD_TYPE: '未注册的字段类型',
  FIELD_MISSING_ID: '字段缺少标识',
  FIELD_ID_CONFLICT: '字段标识重复',
  INVALID_FIELD_NAME: '字段标识命名不合法',
  DATA_FIELD_STRUCTURE_INVALID: '数据字段结构不完整',
  /* 多标签页容器 */
  TABS_MISSING: '多标签页缺少页签',
  TAB_NOT_OBJECT: '页签节点不是对象',
  /* 子表单与子字段 */
  SUBFORM_MISSING_ID: '子表单缺少标识',
  SUBFORM_STRUCTURE_INVALID: '子表单结构不完整',
  SUBFIELD_NOT_OBJECT: '子字段不是对象',
  SUBFIELD_MISSING_TYPE: '子字段缺少类型',
  SUBFIELD_TYPE_NOT_ALLOWED: '子字段类型不受支持',
  SUBFIELD_MISSING_ID: '子字段缺少标识',
  /* 条件引用完整性 */
  VISIBILITY_REF_SELF: '显隐规则自引用',
  VISIBILITY_REF_DANGLING: '显隐规则引用悬空',
  /* 表单级提交校验 */
  SUBMIT_VALIDATION_NOT_ARRAY: '提交校验不是数组',
  SUBMIT_VALIDATION_RULE_NOT_OBJECT: '提交校验规则不是对象',
  SUBMIT_VALIDATION_EMPTY_CONDITIONS: '提交校验条件为空',
  SUBMIT_VALIDATION_REF_DANGLING: '提交校验引用悬空',
  SUBMIT_VALIDATION_EMPTY_MESSAGE: '提交校验缺少提示文案',
  /* 发布不变量 */
  PUBLISHED_FIELD_MUTATED: '已发布字段标识被变更',
  PUBLISHED_CATALOG_MISSING: '已发布字段清单缺失',
}

/** 取某个分类码的中文标签（问题清单的分类列与汇总提示开头均用它） */
export function issueLabel(code: SchemaIssueCode): string {
  return ISSUE_CODE_LABELS[code]
}
