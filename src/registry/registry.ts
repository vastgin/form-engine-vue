/**
 * 字段注册表核心：登记与查询字段定义（design.md 决策 3）。
 * 设计器字段面板、属性面板与渲染器映射均从此处读取，保证设计态与运行态一致。
 * 对应 task 3.1。
 */

import type { FieldGroup, FieldType } from '@/schema/types'
import type { FieldDefinition } from './types'

export class FieldRegistry {
  private defs = new Map<FieldType, FieldDefinition>()
  /** 保留登记顺序，用于字段面板稳定展示 */
  private order: FieldType[] = []

  /** 登记单个字段定义 */
  register(def: FieldDefinition): void {
    if (!this.defs.has(def.type)) this.order.push(def.type)
    this.defs.set(def.type, def)
  }

  /** 批量登记 */
  registerAll(defs: FieldDefinition[]): void {
    defs.forEach((d) => this.register(d))
  }

  /** 按类型获取定义 */
  get(type: FieldType | string): FieldDefinition | undefined {
    return this.defs.get(type as FieldType)
  }

  /** 是否已登记该类型 */
  has(type: FieldType | string): boolean {
    return this.defs.has(type as FieldType)
  }

  /** 全部字段定义（按登记顺序） */
  list(): FieldDefinition[] {
    return this.order.map((t) => this.defs.get(t)!).filter(Boolean)
  }

  /** 按分组获取字段定义 */
  listByGroup(group: FieldGroup): FieldDefinition[] {
    return this.list().filter((d) => d.group === group)
  }

  /** 全部数据字段定义 */
  dataFields(): FieldDefinition[] {
    return this.list().filter((d) => d.isData)
  }

  /** 全部布局字段定义 */
  layoutFields(): FieldDefinition[] {
    return this.list().filter((d) => !d.isData)
  }

  /** 已登记字段类型数量 */
  get size(): number {
    return this.defs.size
  }
}

/** 全局字段注册表单例 */
export const fieldRegistry = new FieldRegistry()
