/**
 * 整表提交校验求值器（表单属性 → 提交校验）。
 *
 * 复用显隐规则的 `evaluateCondition`，对 `formConfig.submitValidation` 中每条规则的
 * 条件组按 `logic`（与/或）归约：条件组求值为真即代表该校验不通过，返回其提示文案。
 * 引擎自持纯函数，可直接单测，不依赖 form-create 运行时校验。
 * 对应 specs/form-renderer「执行表单级提交校验」、form-schema「表单级提交校验数据表达」。
 */

import { evaluateCondition } from './visibility'
import type { SubmitValidationRule } from '@/schema/types'

/** 按 logic 归约一个条件组的求值结果（空条件视为不命中） */
function evaluateGroup(rule: SubmitValidationRule, data: Record<string, unknown>): boolean {
  const conditions = rule.conditions ?? []
  if (conditions.length === 0) return false
  const results = conditions.map((c) => evaluateCondition(c, data))
  return rule.logic === 'or' ? results.some((r) => r) : results.every((r) => r)
}

/**
 * 求值整表提交校验规则列表。
 * @param rules 提交校验规则（缺省或空数组时视为无整表校验）
 * @param data 当前表单数据（提交收集后的数据）
 * @returns 首个命中（不通过）规则的提示文案；全部不命中时返回 null
 */
export function evaluateSubmitValidation(
  rules: SubmitValidationRule[] | undefined,
  data: Record<string, unknown>,
): string | null {
  if (!Array.isArray(rules) || rules.length === 0) return null
  for (const rule of rules) {
    if (evaluateGroup(rule, data)) return rule.message
  }
  return null
}
