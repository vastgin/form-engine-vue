/**
 * schema 遍历工具：在字段树（含多标签页与子表单容器嵌套）中收集数据字段、
 * 构建初始数据模型、按 field 查找节点。供渲染器数据模型与显隐/校验使用。
 * tabs 的标签页字段与 subform 的 subFields 经统一的子节点访问器（getChildArrays/
 * getChildNodes/setChildNodes）走同一条递归路径（design D5）。
 */

import {
  isDataField,
  isMultipleField,
  isSubFormField,
  isTabsField,
  type CollectableDataField,
  type DataFieldNode,
  type FieldNode,
} from './types'
import { normalizeDefaultValue } from '@/registry/options'

/**
 * 统一子节点访问器：返回容器节点直接持有的子字段数组引用（可原地增删改）。
 * - 多标签页：各标签页的 fields 数组
 * - 子表单：subFields 数组
 * - 其他节点：无子节点
 */
export function getChildArrays(node: FieldNode): FieldNode[][] {
  if (isTabsField(node)) return (node.tabs ?? []).map((tab) => tab.fields)
  if (isSubFormField(node)) return [node.subFields]
  return []
}

/** 读取容器的全部直接子节点（扁平只读视图） */
export function getChildNodes(node: FieldNode): FieldNode[] {
  return getChildArrays(node).flat()
}

/** 整体替换容器子节点（仅适用于单一子数组容器，如子表单的 subFields） */
export function setChildNodes(node: FieldNode, list: FieldNode[]): void {
  if (isSubFormField(node)) node.subFields = list as DataFieldNode[]
}

/**
 * 递归收集参与顶层数据收集的字段节点（含多标签页内子字段）。
 * 子表单作为整体是一个数据字段（值为对象数组），其子字段不进入顶层数据键，
 * 故本函数不下降进入 subFields。
 */
export function collectDataFields(nodes: FieldNode[]): CollectableDataField[] {
  const result: CollectableDataField[] = []
  if (!Array.isArray(nodes)) return result
  for (const node of nodes) {
    if (isSubFormField(node)) {
      result.push(node)
    } else if (isDataField(node)) {
      result.push(node)
    } else if (isTabsField(node)) {
      for (const tab of node.tabs ?? []) {
        result.push(...collectDataFields(tab.fields))
      }
    }
  }
  return result
}

/** 递归收集全部字段节点（含布局字段、容器子字段与子表单子字段） */
export function collectAllFields(nodes: FieldNode[]): FieldNode[] {
  const result: FieldNode[] = []
  if (!Array.isArray(nodes)) return result
  for (const node of nodes) {
    result.push(node)
    for (const childArr of getChildArrays(node)) {
      result.push(...collectAllFields(childArr))
    }
  }
  return result
}

/** 依据字段树构建初始表单数据模型（仅顶层数据字段，取默认值并归一化多选；子表单为 []） */
export function buildInitialData(nodes: FieldNode[]): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const field of collectDataFields(nodes)) {
    if (isSubFormField(field)) {
      // 子表单初始值为空数组；按 minRows 展开空行由渲染层负责（design D5/D7）
      data[field.field] = []
      continue
    }
    const multiple = isMultipleField(field.type)
    const initial = field.value !== undefined ? field.value : multiple ? [] : undefined
    data[field.field] = normalizeDefaultValue(initial, multiple)
  }
  return data
}

/**
 * 按 field 标识查找数据字段节点（递归进入多标签页与子表单子字段）。
 * 子表单自身与其子字段均可被定位（field 标识全表唯一，见 validate）。
 */
export function findDataField(
  nodes: FieldNode[],
  fieldId: string,
): CollectableDataField | undefined {
  for (const n of collectAllFields(nodes)) {
    if ((isDataField(n) || isSubFormField(n)) && n.field === fieldId) return n
  }
  return undefined
}
