/**
 * 设计器条件比较操作符共享常量。
 * 供字段级显隐规则编辑器与整表提交校验编辑器复用，避免操作符集合漂移。
 * 对应 specs/form-designer「显隐规则可视化配置」「表单提交校验可视化配置」。
 */
import type { ComparisonOperator } from '@/schema/types'

/** 比较操作符下拉选项（对齐显隐规则操作符集合） */
export const OPERATORS: { label: string; value: ComparisonOperator }[] = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'neq' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notContains' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
  { label: '为空', value: 'empty' },
  { label: '不为空', value: 'notEmpty' },
]

/** 该操作符是否需要目标值输入（empty/notEmpty 无需） */
export function operatorNeedsValue(op: ComparisonOperator): boolean {
  return op !== 'empty' && op !== 'notEmpty'
}
