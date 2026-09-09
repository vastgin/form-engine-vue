/**
 * 拖放白名单纯函数（design D6）：判定某字段类型是否可放入某类放置区。
 * - 画布根区域 / 多标签页容器：接受全部字段；
 * - 子表单子字段区：仅接受常用（数据）字段，拒绝布局字段与子表单（禁止嵌套）。
 * 对应 specs/form-designer「字段面板与拖拽添加」「不接受的字段类型被拒绝」、task 6.2。
 */

import { SUBFIELD_ALLOWED_TYPES, type FieldType } from '@/schema/types'

/** 放置区类型：画布根 / 多标签页容器 / 子表单子字段区 */
export type DropTarget = 'root' | 'tabs' | 'subform'

/**
 * 判定字段类型是否可放入目标放置区。
 * @param target 放置区类型
 * @param fieldType 被拖入字段的类型标识
 */
export function canDropInto(target: DropTarget, fieldType: FieldType | string): boolean {
  if (target === 'subform') {
    // 子字段区仅接受白名单内的常用数据字段（排除布局字段与子表单嵌套）
    return (SUBFIELD_ALLOWED_TYPES as string[]).includes(fieldType)
  }
  // 画布根与多标签页容器接受全部字段
  return true
}

/** 被拒绝时的可读提示（指明该字段不可作为子表单的子字段） */
export function dropRejectMessage(fieldType: FieldType | string, label?: string): string {
  const name = label || String(fieldType)
  return `「${name}」不能作为子表单的子字段`
}
