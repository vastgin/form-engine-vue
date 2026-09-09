/**
 * 显隐规则求值器（design.md 决策 5）：
 * 依据表单数据模型实时计算字段应显示还是隐藏，支持单条件与多条件与/或组合。
 * 对应 specs/form-renderer「执行字段显隐规则」、specs/form-schema「显隐规则数据表达」。
 */

import type { ComparisonOperator, VisibilityCondition, VisibilityRule } from '@/schema/types'

/** 判断值是否为空 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

/** 宽松相等比较（字符串/数字/布尔归一） */
function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) return a.some((item) => looseEqual(item, b))
  if (a === null || a === undefined || b === null || b === undefined) return false
  return String(a) === String(b)
}

/** 包含比较：数组包含元素，或字符串包含子串 */
function containsValue(data: unknown, target: unknown): boolean {
  if (Array.isArray(data)) return data.some((item) => looseEqual(item, target))
  if (typeof data === 'string') return data.includes(String(target ?? ''))
  return false
}

/** 数值比较 */
function numericCompare(data: unknown, target: unknown, op: 'gt' | 'gte' | 'lt' | 'lte'): boolean {
  const a = Number(data)
  const b = Number(target)
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  switch (op) {
    case 'gt':
      return a > b
    case 'gte':
      return a >= b
    case 'lt':
      return a < b
    case 'lte':
      return a <= b
    default:
      return false
  }
}

/** 求值单个条件 */
export function evaluateCondition(
  condition: VisibilityCondition,
  data: Record<string, unknown>,
): boolean {
  const actual = data[condition.field]
  const target = condition.value
  const op: ComparisonOperator = condition.operator

  switch (op) {
    case 'empty':
      return isEmptyValue(actual)
    case 'notEmpty':
      return !isEmptyValue(actual)
    case 'eq':
      return looseEqual(actual, target)
    case 'neq':
      return !looseEqual(actual, target)
    case 'contains':
      return containsValue(actual, target)
    case 'notContains':
      return !containsValue(actual, target)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return numericCompare(actual, target, op)
    default:
      return true
  }
}

/**
 * 求值显隐规则，返回该字段是否应可见。
 * - action='show'：条件命中则显示，否则隐藏
 * - action='hide'：条件命中则隐藏，否则显示
 * 无规则时默认可见。
 */
export function evaluateVisibility(
  rule: VisibilityRule | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    return true
  }
  const results = rule.conditions.map((c) => evaluateCondition(c, data))
  const met = rule.logic === 'or' ? results.some((r) => r) : results.every((r) => r)
  return rule.action === 'hide' ? !met : met
}
