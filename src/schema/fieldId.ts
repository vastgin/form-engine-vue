/**
 * 字段标识（`field`）命名契约。
 *
 * 字段标识即后端数据的键与建表时的列名，因此 MUST 只由字母、数字与下划线组成，且
 * MUST NOT 使用系统保留字 / 注入相关关键词命名（否则需要转义、甚至在拼接 SQL 时成为
 * 注入入口）。规则集中于本模块：结构校验（validate）与设计器属性面板提示共用同一判定，
 * 避免出现两套口径。对应 specs/form-schema「字段标识命名合法性」。
 */

/** 合法字段标识：仅字母、数字与下划线，且至少一个字符 */
export const FIELD_ID_PATTERN = /^[A-Za-z0-9_]+$/

/**
 * 系统保留字 / 注入关键词黑名单（比对时忽略大小写）。
 * 收录口径：只放注入语句的骨架词、数据操纵语句与注入载荷常用函数/系统表
 */
export const SQL_RESERVED_WORDS: readonly string[] = [
  'insert',
  'update',
  'delete',
  'upsert',
  'and',
  'or',
  'not',
  'null',
  'is',
  'in',
  'like',
  'of',
  'exec',
  'execute',
  'prepared',
  'statement',
  'drop',
  'alter',
  'create',
  'version',
  'user',
  'information_schema',
  'tenant_id',
  'id',
  'sn',
  'parent_id',
  'tree_path',
  'creator',
  'create_time',
  'updater',
  'update_time',
  'deleted',
  'bpm_process_instance_id',
  'bpm_process_status',
]

/** 黑名单查找表（小写归一，避免每次比对重新构造） */
const RESERVED_LOOKUP = new Set(SQL_RESERVED_WORDS.map((word) => word.toLowerCase()))

/**
 * 字段标识是否命中系统保留字 / 注入关键词（忽略大小写；仅整体匹配，不做子串匹配）。
 * @param fieldId 待判定的字段标识
 */
export function isReservedFieldId(fieldId: unknown): boolean {
  return typeof fieldId === 'string' && RESERVED_LOOKUP.has(fieldId.trim().toLowerCase())
}

/**
 * 判定字段标识命名是否合法。
 * @returns 不合法时返回可直接展示的原因（不重复标识本身），合法时返回 null
 */
export function checkFieldId(fieldId: unknown): string | null {
  if (typeof fieldId !== 'string' || fieldId.length === 0) return '不能为空'
  if (!FIELD_ID_PATTERN.test(fieldId)) {
    return '仅允许字母、数字与下划线，不可包含空格、标点等特殊符号'
  }
  if (isReservedFieldId(fieldId)) {
    return `"${fieldId.toUpperCase()}" 是系统保留字/关键词，请改用其他名称`
  }
  return null
}

/**
 * 组装字段标识的完整错误文案（结构校验与属性面板提示共用，保证口径一致）。
 * @returns 不合法时的提示语；合法时返回 null
 */
export function fieldIdErrorMessage(fieldId: unknown): string | null {
  const reason = checkFieldId(fieldId)
  if (!reason) return null
  if (reason === '不能为空') return '字段标识不能为空'
  return `字段标识 "${String(fieldId)}" 命名不合法：${reason}`
}
