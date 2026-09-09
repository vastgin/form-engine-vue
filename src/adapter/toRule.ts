/**
 * 适配层（design.md 决策 2）：将 form-schema 转换为 form-create rule 与 option，
 * 隔离第三方库细节。渲染器只依赖本模块，不直接接触 form-create rule 结构。
 * 对应 specs/form-renderer「依据 Schema 渲染表单」、task 4.1。
 */

import { ensureRegistered, fieldRegistry } from '@/registry'
import type { FormCreateRule, RuleContext } from '@/registry/types'
import { resolveFormConfig } from '@/schema/defaults'
import type { FieldNode, FormSchema } from '@/schema/types'

ensureRegistered()

/** 默认渲染上下文 */
export function createContext(partial: Partial<RuleContext> = {}): RuleContext {
  const ctx: RuleContext = {
    readonly: false,
    ...partial,
    dataSources: { members: [], departments: [], ...(partial.dataSources ?? {}) },
  }
  // 注入递归映射器，供容器字段（多标签页）展开子字段
  ctx.mapNodes = (nodes: FieldNode[]) => mapNodes(nodes, ctx)
  return ctx
}

/** 未知字段类型的占位 rule（对应 form-schema「未知字段类型」容错） */
function unknownRule(node: FieldNode): FormCreateRule {
  return {
    type: 'engine-unknown',
    native: true,
    props: { fieldType: String((node as { type?: unknown }).type ?? '') },
    col: { span: 24 },
  }
}

/** 映射单个字段节点为 rule 列表 */
export function mapNode(node: FieldNode, ctx: RuleContext): FormCreateRule[] {
  if (!node || typeof node !== 'object') return []
  const def = fieldRegistry.get(node.type)
  if (!def) {
    console.warn(`[form-engine] 未知字段类型: ${String(node.type)}，已占位处理`)
    return [unknownRule(node)]
  }
  const result = def.toRule(node, ctx)
  if (result === null) return []
  return Array.isArray(result) ? result : [result]
}

/** 映射字段节点数组为 rule 列表 */
export function mapNodes(nodes: FieldNode[], ctx: RuleContext): FormCreateRule[] {
  if (!Array.isArray(nodes)) return []
  const rules: FormCreateRule[] = []
  for (const node of nodes) {
    rules.push(...mapNode(node, ctx))
  }
  return rules
}

/** 将整个 schema 转换为 form-create rule 列表 */
export function schemaToRules(
  schema: FormSchema,
  ctx: RuleContext = createContext(),
): FormCreateRule[] {
  return mapNodes(schema.fields ?? [], ctx)
}

/** 将 formConfig 转换为 form-create option（表单级配置） */
export function schemaToOption(schema: FormSchema): Record<string, any> {
  // 缺省值统一由 resolveFormConfig 给出（src/schema/defaults.ts 为唯一出处），
  // 本层 MUST NOT 自行持有兜底值，否则会与设计器画布的呈现宽度漂移
  const resolved = resolveFormConfig(schema.formConfig)
  const form: Record<string, any> = {
    // el-form 原生支持 left/right/top 三种对齐，直接透传（缺省右对齐），
    // 不能把 left 折叠为 right，否则表单属性「标签左对齐」不生效
    labelPosition: resolved.labelPosition,
    labelWidth: `${resolved.labelWidth}px`,
    size: resolved.size,
    // 必填星号位置随标签对齐联动：左对齐时标签靠左、星号移到标签文字右侧；
    // 右对齐与顶部对齐沿用 element-plus 默认（星号在标签左侧）。
    // 该属性由 el-form 下发给 el-form-item，产出 asterisk-left / asterisk-right 类，
    // 无需引擎自写样式覆盖
    requireAsteriskPosition: resolved.labelPosition === 'left' ? 'right' : 'left',
  }
  if (schema.formConfig?.disabled) form.disabled = true
  return {
    form,
    // 由渲染器自行控制提交/重置按钮与事件，关闭 form-create 内置按钮
    submitBtn: false,
    resetBtn: false,
    formData: {},
  }
}
