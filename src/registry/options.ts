/**
 * 选项类字段的选项配置工具（增删改选项、默认选中）。
 * 供设计器属性面板与字段默认值使用。对应 specs/form-fields「选项类字段配置」、task 3.4。
 */

import type { FieldOption } from '@/schema/types'

/** 生成一组默认选项 */
export function createDefaultOptions(count = 2): FieldOption[] {
  return Array.from({ length: count }, (_, i) => ({
    label: `选项${i + 1}`,
    value: `选项${i + 1}`,
  }))
}

/** 追加一个选项（自动生成不重复的默认文本/值） */
export function addOption(options: FieldOption[]): FieldOption[] {
  const next = [...options]
  let index = next.length + 1
  let label = `选项${index}`
  while (next.some((o) => o.value === label)) {
    index += 1
    label = `选项${index}`
  }
  next.push({ label, value: label })
  return next
}

/** 删除指定下标的选项 */
export function removeOption(options: FieldOption[], index: number): FieldOption[] {
  if (index < 0 || index >= options.length) return [...options]
  const next = [...options]
  next.splice(index, 1)
  return next
}

/** 更新指定下标选项的部分内容 */
export function updateOption(
  options: FieldOption[],
  index: number,
  patch: Partial<FieldOption>,
): FieldOption[] {
  if (index < 0 || index >= options.length) return [...options]
  const next = [...options]
  next[index] = { ...next[index], ...patch }
  return next
}

/** 移动选项位置（用于排序） */
export function moveOption(options: FieldOption[], from: number, to: number): FieldOption[] {
  if (from < 0 || from >= options.length || to < 0 || to >= options.length || from === to) {
    return [...options]
  }
  const next = [...options]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * 归一化默认选中值：多选字段确保为数组，单选字段确保为单值。
 * @param value 原始默认值
 * @param multiple 是否多选
 */
export function normalizeDefaultValue(value: unknown, multiple: boolean): unknown {
  if (multiple) {
    if (Array.isArray(value)) return value
    if (value === undefined || value === null || value === '') return []
    return [value]
  }
  if (Array.isArray(value)) return value[0] ?? undefined
  return value
}

/** 默认值中的选项值清单：多选取其数组，单选不以数组形态参与比对 */
function defaultList(defaultValue: unknown): FieldOption['value'][] {
  return Array.isArray(defaultValue) ? (defaultValue as FieldOption['value'][]) : []
}

/**
 * 切换某选项的默认选中态：单选字段直接以该值为默认值（再点仍是同一项，清空需走
 * 「清除默认」），多选字段在默认值数组中增删该值。
 * @param defaultValue 当前默认值（节点 `value`）
 * @param value 被点击选项的值
 * @param multiple 该字段是否多选
 */
export function toggleDefaultValue(
  defaultValue: unknown,
  value: FieldOption['value'],
  multiple: boolean,
): unknown {
  if (!multiple) return value
  const list = defaultList(defaultValue)
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/**
 * 选项值被改名后同步默认值，避免默认选中指向已不存在的选项。
 * @param defaultValue 当前默认值
 * @param oldValue 选项改名前的值
 * @param newValue 选项改名后的值
 * @param multiple 该字段是否多选
 */
export function renameValueInDefault(
  defaultValue: unknown,
  oldValue: FieldOption['value'],
  newValue: FieldOption['value'],
  multiple: boolean,
): unknown {
  if (!multiple) return defaultValue === oldValue ? newValue : defaultValue
  return defaultList(defaultValue).map((v) => (v === oldValue ? newValue : v))
}

/**
 * 选项被删除后从默认值中剔除其值（单选命中时回到未选，多选仅去掉该项）。
 * @param defaultValue 当前默认值
 * @param value 被删除选项的值
 * @param multiple 该字段是否多选
 */
export function dropValueFromDefault(
  defaultValue: unknown,
  value: FieldOption['value'],
  multiple: boolean,
): unknown {
  if (!multiple) return defaultValue === value ? undefined : defaultValue
  return defaultList(defaultValue).filter((v) => v !== value)
}
