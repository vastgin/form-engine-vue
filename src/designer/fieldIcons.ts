/**
 * 设计器字段视觉标识访问器：字段面板、画布卡片、属性面板头部共用同一份
 * 「类型 -> 图标 / 中文名」查询，保证三处对同一控件的识别一致。
 *
 * 两者均以字段注册表为单一来源（design.md 决策 3）：图标随字段定义登记在
 * `FieldDefinition.icon`，中文名取 `FieldDefinition.label`，本模块不再维护第二份目录。
 */
import type { Component } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { fieldRegistry } from '@/registry'

/** 取字段类型图标（注册表为准），未注册类型回退为信息图标 */
export function fieldIcon(type: string): Component {
  return fieldRegistry.get(type)?.icon ?? InfoFilled
}

/** 取字段类型中文名（注册表为准），未注册类型回退为原始类型串 */
export function fieldTypeLabel(type: string): string {
  return fieldRegistry.get(type)?.label ?? type
}
