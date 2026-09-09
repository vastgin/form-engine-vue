/**
 * 设计器 schema 操作（纯函数，可单测）：节点创建、增删改查、唯一标识生成、
 * 发布标记与已发布字段清单、子表单「已有字段」池。
 * 支持在字段树（含多标签页容器）中定位与操作节点。
 * 对应 specs/form-designer「字段面板与拖拽添加」「画布字段排序与删除」「字段属性配置」
 * 「表单发布与字段标识锁定」「已发布字段清单」「子表单已有字段回添」。
 */

import { ensureRegistered, fieldRegistry } from '@/registry'
import {
  isCommonFieldType,
  isSubFormField,
  isTabsField,
  type CommonFieldType,
  type DataFieldNode,
  type FieldNode,
  type FieldType,
  type PublishedFieldEntry,
  type SubFormNode,
  type TabsFieldNode,
  type TabsTab,
} from '@/schema/types'
import { collectAllFields, collectDataFields, getChildArrays } from '@/schema/traverse'

ensureRegistered()

/** 生成节点唯一 key */
export function genKey(prefix = 'node'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 为数据字段生成表单内唯一的 field 标识。
 * 取全表（主表数据字段 + 子表单 + 其全部子字段）作为避重范围，严格于 validate 的作用域
 * （子字段仅需在当前子表单内唯一），以免自动分配的标识与任何现有字段重名（task 1.4 / 6.5）。
 */
export function genFieldId(type: string, fields: FieldNode[]): string {
  const existing = new Set(
    collectAllFields(fields)
      .map((n) => (n as { field?: unknown }).field)
      .filter((f): f is string => typeof f === 'string'),
  )
  let index = 1
  let candidate = `${type}_${index}`
  while (existing.has(candidate)) {
    index += 1
    candidate = `${type}_${index}`
  }
  return candidate
}

/** 依据字段类型创建新节点（分配唯一 key 与 field 标识） */
export function createNode(type: FieldType, fields: FieldNode[]): FieldNode {
  const def = fieldRegistry.get(type)
  if (!def) throw new Error(`未注册的字段类型: ${String(type)}`)
  const key = genKey(def.type)
  if (def.isData) {
    return def.createDefault(key, genFieldId(def.type, fields))
  }
  return def.createDefault(key)
}

/** 节点定位上下文 */
export interface NodeContext {
  node: FieldNode
  /** 所在数组（顶层 fields、某标签页 fields 或某子表单 subFields） */
  arr: FieldNode[]
  index: number
  /** 父容器节点（顶层字段为 null；子字段为所属子表单；标签页内字段为所属 tabs） */
  parent: FieldNode | null
}

/**
 * 在字段树中按 key 递归定位节点：经统一子节点访问器（getChildArrays）同时下降进入
 * 多标签页各标签页的 fields 与子表单的 subFields（design D5，task 6.3）。
 * @param parent 递归携带的父容器节点（顶层调用为 null）
 */
export function findNodeByKey(
  fields: FieldNode[],
  key: string,
  parent: FieldNode | null = null,
): NodeContext | null {
  for (let i = 0; i < fields.length; i++) {
    const node = fields[i]
    if (node.key === key) return { node, arr: fields, index: i, parent }
    for (const childArr of getChildArrays(node)) {
      const found = findNodeByKey(childArr, key, node)
      if (found) return found
    }
  }
  return null
}

/** 在指定数组插入节点（默认追加到末尾） */
export function insertNode(arr: FieldNode[], node: FieldNode, index?: number): void {
  if (index === undefined || index < 0 || index > arr.length) arr.push(node)
  else arr.splice(index, 0, node)
}

/** 按 key 删除节点（递归，含容器内子节点） */
export function removeNodeByKey(fields: FieldNode[], key: string): boolean {
  const ctx = findNodeByKey(fields, key)
  if (!ctx) return false
  ctx.arr.splice(ctx.index, 1)
  return true
}

/** 按 key 更新节点属性（浅合并；props 深合并一层） */
export function updateNodeByKey(
  fields: FieldNode[],
  key: string,
  patch: Partial<FieldNode>,
): boolean {
  const ctx = findNodeByKey(fields, key)
  if (!ctx) return false
  const node = ctx.node as Record<string, any>
  Object.entries(patch).forEach(([k, v]) => {
    if (k === 'props') {
      node.props = { ...(node.props ?? {}), ...(v as Record<string, unknown>) }
    } else {
      node[k] = v
    }
  })
  return true
}

/** 在同一数组内移动节点（拖拽排序） */
export function moveNode(arr: FieldNode[], from: number, to: number): void {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return
  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
}

/* -------------------------------------------------------------------------- */
/* 子表单子字段管理（task 6.5）                                             */
/* -------------------------------------------------------------------------- */

/** 深拷贝一个数据字段节点并分配新的 key 与全表唯一 field 标识（用于复制子字段） */
export function cloneDataField(node: DataFieldNode, fields: FieldNode[]): DataFieldNode {
  const copy = JSON.parse(JSON.stringify(node)) as DataFieldNode
  copy.key = genKey(node.type)
  copy.field = genFieldId(node.type, fields)
  return copy
}

/** 定位子表单节点（按 key），非子表单返回 null */
function findSubForm(fields: FieldNode[], subFormKey: string) {
  const ctx = findNodeByKey(fields, subFormKey)
  return ctx && isSubFormField(ctx.node) ? ctx.node : null
}

/**
 * 在指定子表单末尾新增一个子字段（仅常用数据字段，分配全表唯一标识）。
 * @returns 新子字段节点；目标非子表单或类型不合法时返回 null
 */
export function addSubField(
  fields: FieldNode[],
  subFormKey: string,
  type: CommonFieldType | string,
): DataFieldNode | null {
  const subForm = findSubForm(fields, subFormKey)
  if (!subForm || !isCommonFieldType(type)) return null
  const node = createNode(type, fields) as DataFieldNode
  subForm.subFields.push(node)
  return node
}

/**
 * 复制子表单内某子字段，插入其后（复制体获得新的唯一 key 与 field）。
 * @returns 复制体节点；定位失败时返回 null
 */
export function copySubField(
  fields: FieldNode[],
  subFormKey: string,
  subKey: string,
): DataFieldNode | null {
  const subForm = findSubForm(fields, subFormKey)
  if (!subForm) return null
  const idx = subForm.subFields.findIndex((f) => f.key === subKey)
  if (idx === -1) return null
  const copy = cloneDataField(subForm.subFields[idx], fields)
  subForm.subFields.splice(idx + 1, 0, copy)
  return copy
}

/* -------------------------------------------------------------------------- */
/* 发布状态：字段标记                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 将当前字段树内的全部节点标记为已发布（递归含多标签页内字段与子表单子字段）。
 * 已有字段池（fieldPool）不在遍历范围内，故池内字段不受影响。
 * 发布可反复执行，每次发布都会为当时画布内全部字段打标记（新增字段因此被锁定）。
 * @returns 被标记的节点数
 */
export function markAllPublished(fields: FieldNode[]): number {
  const all = collectAllFields(fields)
  for (const node of all) node.published = true
  return all.length
}

/* -------------------------------------------------------------------------- */
/* 已发布字段清单：快照、在用比对与拖回                                        */
/* -------------------------------------------------------------------------- */

/** 深拷贝一个节点（脱离与画布的引用共享，使清单快照不受后续编辑影响） */
function deepCloneNode<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T
}

/**
 * 生成已发布字段清单快照：取主表作用域的数据字段（含多标签页内字段与子表单整体，
 * MUST NOT 含子表单子字段与布局字段）的完整定义，按 `field` 去重后保持字段树顺序。
 * 清单代表「最近一次发布」的字段集合，故每次发布按当时画布重建而不与旧清单归并。
 * MUST 在 `markAllPublished` 之后调用，快照因此自带 `published: true`（拖回后标识仍锁定）。
 * @param fields 当前画布字段树
 * @returns 新数组（条目为深拷贝，不修改入参，供上层写回 formConfig）
 */
export function buildPublishedCatalog(fields: FieldNode[]): PublishedFieldEntry[] {
  const catalog: PublishedFieldEntry[] = []
  const seen = new Set<string>()
  for (const node of collectDataFields(fields)) {
    // 标识重复的后续节点不重复入清单（重复本身由结构校验在建存/发布前阻断）
    if (seen.has(node.field)) continue
    seen.add(node.field)
    catalog.push(deepCloneNode(node))
  }
  return catalog
}

/**
 * 克隆一个清单条目用于放入画布：沿用其字段标识与全部配置（保证已有数据键连续），
 * 仅重新分配设计器内部 key（同一棵字段树内 key 不可重复）。
 */
export function clonePublishedEntry(entry: PublishedFieldEntry): PublishedFieldEntry {
  const copy = deepCloneNode(entry)
  copy.key = genKey(entry.type)
  return copy
}

/**
 * 画布主表作用域内已在用的数据字段标识集合：与清单条目按 `field` 比对以判定是否置灰。
 * 子表单的子字段不进入顶层数据键，故不在集合内（与清单范围一致）。
 */
export function getCanvasFieldIds(fields: FieldNode[]): Set<string> {
  return new Set(collectDataFields(fields).map((n) => n.field))
}

/**
 * 按字段标识定位画布内的主表数据字段（含多标签页内字段与子表单），用于清单点击定位。
 * @returns 节点；画布内不存在（已删除或仅为子字段）时返回 null
 */
export function findCanvasFieldByFieldId(
  fields: FieldNode[],
  fieldId: string,
): PublishedFieldEntry | null {
  return collectDataFields(fields).find((n) => n.field === fieldId) ?? null
}

/* -------------------------------------------------------------------------- */
/* 子表单「已有字段」池：移除留存与加回                                        */
/* -------------------------------------------------------------------------- */

/** 加回结果：成功带出节点，失败带出原因供上层提示 */
export type RestorePooledResult =
  | { ok: true; node: DataFieldNode }
  | { ok: false; reason: 'not-found' | 'field-conflict'; field?: string }

/** 取得（并在缺失时创建）子表单的已有字段池数组引用 */
function ensurePool(subForm: SubFormNode): DataFieldNode[] {
  if (!Array.isArray(subForm.fieldPool)) subForm.fieldPool = []
  return subForm.fieldPool
}

/** 读取子表单的已有字段池（缺省为空数组） */
export function getPooledSubFields(fields: FieldNode[], subFormKey: string): DataFieldNode[] {
  return findSubForm(fields, subFormKey)?.fieldPool ?? []
}

/**
 * 从子表单移除一个子字段并留存到「已有字段」池（保留原 key/field/全部配置以便原样加回）。
 * 池中已存在同 key 或同 field 的条目时以最新定义替换，避免重复堆积（同一子表单内标识唯一）。
 * @returns 被移除的子字段；定位失败时返回 null
 */
export function removeSubFieldToPool(
  fields: FieldNode[],
  subFormKey: string,
  subKey: string,
): DataFieldNode | null {
  const subForm = findSubForm(fields, subFormKey)
  if (!subForm) return null
  const idx = subForm.subFields.findIndex((f) => f.key === subKey)
  if (idx === -1) return null
  const [removed] = subForm.subFields.splice(idx, 1)
  const pool = ensurePool(subForm)
  const dup = pool.findIndex((p) => p.key === removed.key || p.field === removed.field)
  if (dup === -1) pool.push(removed)
  else pool.splice(dup, 1, removed)
  return removed
}

/**
 * 把池中字段加回子字段清单末尾：沿用其原有 field 标识与全部配置（不重新分配标识，
 * 以保证已有数据键连续）。标识已被本子表单内其他子字段占用时不予加回（与 validate 的
 * 子表单内作用域一致，与主表字段重名不构成冲突）；key 供设计器定位节点用，需全树唯一，
 * 与现有节点重复时重新分配。
 */
export function restorePooledSubField(
  fields: FieldNode[],
  subFormKey: string,
  pooledKey: string,
): RestorePooledResult {
  const subForm = findSubForm(fields, subFormKey)
  if (!subForm) return { ok: false, reason: 'not-found' }
  const pool = ensurePool(subForm)
  const idx = pool.findIndex((p) => p.key === pooledKey)
  if (idx === -1) return { ok: false, reason: 'not-found' }
  const node = pool[idx]
  if (subForm.subFields.some((f) => f.field === node.field)) {
    return { ok: false, reason: 'field-conflict', field: node.field }
  }
  // 池不参与遍历，故此处命中均为字段树内实际存在的节点
  if (collectAllFields(fields).some((n) => n.key === node.key)) node.key = genKey(node.type)
  pool.splice(idx, 1)
  subForm.subFields.push(node)
  return { ok: true, node }
}

/* -------------------------------------------------------------------------- */
/* 多标签页容器：页签新增与删除                                              */
/* -------------------------------------------------------------------------- */

/** 定位多标签页容器节点（按 key），非 tabs 类型返回 null */
function findTabsNode(fields: FieldNode[], tabsKey: string): TabsFieldNode | null {
  const ctx = findNodeByKey(fields, tabsKey)
  return ctx && isTabsField(ctx.node) ? ctx.node : null
}

/**
 * 在指定多标签页容器末尾新增一个空标签页（key 唯一，可直接拖入字段）。
 * @returns 新标签页；目标不存在或非多标签页容器时返回 null
 */
export function addTab(fields: FieldNode[], tabsKey: string): TabsTab | null {
  const node = findTabsNode(fields, tabsKey)
  if (!node) return null
  const tab: TabsTab = {
    key: genKey('tab'),
    title: `标签页${node.tabs.length + 1}`,
    fields: [],
  }
  node.tabs.push(tab)
  return tab
}

/**
 * 删除指定标签页（连同其内部字段一起移除）。
 * 至少保留一个标签页：仅剩一个时拒绝删除，避免容器无页签可用。
 * @returns 是否删除成功
 */
export function removeTab(fields: FieldNode[], tabsKey: string, tabKey: string): boolean {
  const node = findTabsNode(fields, tabsKey)
  if (!node || node.tabs.length <= 1) return false
  const idx = node.tabs.findIndex((t) => t.key === tabKey)
  if (idx === -1) return false
  node.tabs.splice(idx, 1)
  return true
}
