/**
 * 字段注册表入口：登记全部内置字段定义并导出查询 API。
 * 导入本模块即完成注册（幂等）。
 */

import { fieldRegistry } from './registry'
import { commonFieldDefinitions } from './fields/common'
import { advancedFieldDefinitions } from './fields/advanced'
import { layoutFieldDefinitions } from './fields/layout'
import type { FieldDefinition } from './types'

let registered = false

/** 确保全部内置字段已登记（幂等） */
export function ensureRegistered(): void {
  if (registered) return
  fieldRegistry.registerAll([
    ...commonFieldDefinitions,
    ...advancedFieldDefinitions,
    ...layoutFieldDefinitions,
  ] as FieldDefinition[])
  registered = true
}

// 模块加载即注册
ensureRegistered()

export * from './types'
export * from './registry'
export * from './options'
export { commonFieldDefinitions, defineDataField } from './fields/common'
export { advancedFieldDefinitions } from './fields/advanced'
export { layoutFieldDefinitions } from './fields/layout'
