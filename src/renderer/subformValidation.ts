/**
 * 子表单校验与行数据处理（引擎自持，design D2）。
 *
 * 校验语义（对应 specs/form-renderer「子表单校验」）：
 * - 整体必填：至少存在一行「有效（非空）数据」，否则报整体错误；
 * - 逐行按子字段规则校验：复用 `adapter/validation.ts` 的 async-validator descriptor
 *   与执行引擎，避免与主表字段规则二义（design 风险项：不做第二份规则实现）；
 *   子字段标 `hidden` 时参于行数据但不校验（与主表隐藏字段同一口径）；
 * - 整行为空跳过该行：空行视为未填写，不触发任何子字段级校验（含必填）；
 * - 错误定位到行列：携带行序号（1-based）与子字段标题。
 *
 * 这些均为纯函数（确定性、无副作用），可直接单测，不受 form-create/jsdom 限制影响。
 */

import Schema from 'async-validator'
import { buildValidate, type AsyncValidatorRule } from '@/adapter/validation'
import { isMultipleField, type DataFieldNode, type SubFormNode } from '@/schema/types'

/** 子表单校验错误项（整体级或单元格级） */
export interface SubFormErrorItem {
  /** 出错子字段的 field；整体级错误为空串 */
  fieldKey: string
  /** 行索引（0-based，对应可见行顺序）；整体级错误为 -1 */
  rowIndex: number
  /** 子字段标题；整体级错误为子表单标题 */
  fieldTitle: string
  /** 已定位到行列的可读错误信息 */
  message: string
}

/** 单元格值是否为空：undefined/null/空白串/空数组均视为空 */
export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** 整行是否为空：全部子字段值均为空 */
export function isEmptyRow(row: Record<string, unknown>, subFields: DataFieldNode[]): boolean {
  return subFields.every((sf) => isEmptyValue(row[sf.field]))
}

/**
 * 数据输出用：剔除完全空白行，并按子字段 field 收敛键（剥离 __rowKey 等内部键）。
 * 非数组值按空明细容错（task 5.4）。对应 specs/form-renderer「子表单数据输出」。
 */
export function stripEmptyRows(
  value: unknown,
  subFields: DataFieldNode[],
): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  const out: Record<string, unknown>[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (isEmptyRow(row, subFields)) continue
    const clean: Record<string, unknown> = {}
    for (const sf of subFields) clean[sf.field] = row[sf.field]
    out.push(clean)
  }
  return out
}

/** 以 async-validator 执行 descriptor，返回错误信息列表（规则均为同步） */
function runRules(rules: AsyncValidatorRule[], value: unknown): Promise<string[]> {
  if (!rules.length) return Promise.resolve([])
  return new Promise((resolve) => {
    const validator = new Schema({ value: rules })
    // suppressWarning：async-validator 默认会用「英文缺省信息」console.warn 一次（在替换为
    // 自定义 message 之前），此处抑制以免污染运行态控制台；回调返回的仍是自定义信息。
    validator.validate({ value }, { suppressWarning: true }, (errors) => {
      resolve(errors && errors.length ? errors.map((e) => e.message ?? '校验失败') : [])
    })
  })
}

/**
 * 校验单个子表单节点的行数据。
 * @param node 子表单节点（提供 required 与 subFields）
 * @param rows 行数据（对象数组，键为子字段 field）；非数组按空明细容错
 * @returns 错误项列表（整体级 rowIndex = -1，单元格级携带行列定位）
 */
export async function validateSubForm(
  node: SubFormNode,
  rows: unknown,
): Promise<SubFormErrorItem[]> {
  const list: Record<string, unknown>[] = Array.isArray(rows)
    ? rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    : []
  const subFields = node.subFields ?? []
  const errors: SubFormErrorItem[] = []

  // 整体必填：至少存在一行有效（非空）数据
  const hasValidRow = list.some((row) => !isEmptyRow(row, subFields))
  if (node.required === true && !hasValidRow) {
    errors.push({
      fieldKey: '',
      rowIndex: -1,
      fieldTitle: node.title ?? '',
      message: `请至少填写一行「${node.title ?? '子表单'}」`,
    })
  }

  // 逐行按子字段规则校验；整行为空则跳过该行；隐藏的子字段不呈现也无法录入，故跳过其规则（隐藏优先）
  const checkFields = subFields.filter((sf) => sf.hidden !== true)
  for (let rowIndex = 0; rowIndex < list.length; rowIndex++) {
    const row = list[rowIndex]
    if (isEmptyRow(row, subFields)) continue
    for (const sf of checkFields) {
      const rules = buildValidate(sf, isMultipleField(sf.type))
      if (!rules.length) continue
      const messages = await runRules(rules, row[sf.field])
      for (const m of messages) {
        errors.push({
          fieldKey: sf.field,
          rowIndex,
          fieldTitle: sf.title ?? '',
          message: `第 ${rowIndex + 1} 行「${sf.title ?? sf.field}」${m}`,
        })
      }
    }
  }

  return errors
}
