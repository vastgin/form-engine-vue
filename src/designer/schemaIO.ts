/**
 * schema 导入 / 导出 / 保存（task 7.7）。
 * 对应 specs/form-designer「Schema 导入导出与保存」。
 * 导入非法 JSON 时抛错且不破坏当前编辑（由调用方在成功后再替换状态）。
 */

import { SCHEMA_VERSION, type FormSchema } from '@/schema/types'
import { validateSchema } from '@/schema/validate'
import { issueLabel } from './issueLabels'

/** 导出为格式化 JSON 字符串 */
export function exportSchema(schema: FormSchema): string {
  return JSON.stringify(schema, null, 2)
}

/** 创建一张空白表单 */
export function createEmptySchema(name = '未命名表单'): FormSchema {
  return {
    id: `form_${Date.now().toString(36)}`,
    name,
    version: SCHEMA_VERSION,
    fields: [],
    // 不写 labelWidth：缺省值由 resolveFormConfig 在读取时解析（src/schema/defaults.ts 为唯一出处），
    // 避免“新建文档带一个值、导入文档缺省另一个值”的分裂；该字段只在用户真正改动时才出现
    formConfig: { labelPosition: 'right', size: 'default' },
  }
}

/**
 * 从 JSON 字符串解析并校验 schema。
 * 校验不通过时抛出，且**在返回前**抛出——调用方「成功后再替换状态」的写法因此保证
 * 导入被拒时不改变当前编辑内容。
 * 错误文案按分类码组织（不依赖 message 子串）：一次列出全部 error 级问题，每条带分类标签
 * 与字段树位置，使调用方无需逐次修正重试就能看全。
 * @throws 当 JSON 非法或不符合 form-schema 契约时抛出错误
 */
export function importSchema(json: string): FormSchema {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    throw new Error(`JSON 解析失败：${(e as Error).message}`)
  }
  const result = validateSchema(parsed)
  if (!result.valid) {
    const errors = result.issues.filter((i) => i.severity === 'error')
    const messages = errors
      .map((i) => `[${issueLabel(i.code)}] ${i.path || '(root)'}: ${i.message}`)
      .join('; ')
    throw new Error(`schema 校验失败（共 ${errors.length} 处）：${messages}`)
  }
  return parsed as FormSchema
}

/** 触发浏览器下载 schema JSON 文件 */
export function downloadSchema(schema: FormSchema, filename?: string): void {
  const content = exportSchema(schema)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `${schema.name || 'form'}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const STORAGE_PREFIX = 'form-engine:schema:'

/** 保存 schema 至本地存储（无后端时的持久化占位） */
export function saveSchema(schema: FormSchema): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + schema.id, exportSchema(schema))
  } catch {
    // 忽略存储不可用（如隐私模式）
  }
}

/** 从本地存储读取 schema */
export function loadSchema(id: string): FormSchema | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id)
    return raw ? (JSON.parse(raw) as FormSchema) : null
  } catch {
    return null
  }
}
