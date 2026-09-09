import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import FormDesigner from '@/designer/FormDesigner.vue'
import FormPropertyPanel from '@/designer/FormPropertyPanel.vue'
import { ISSUE_CODE_LABELS, issueLabel } from '@/designer/issueLabels'
import {
  addTab,
  createNode,
  findNodeByKey,
  genFieldId,
  getPooledSubFields,
  markAllPublished,
  moveNode,
  removeNodeByKey,
  removeSubFieldToPool,
  removeTab,
  restorePooledSubField,
  updateNodeByKey,
} from '@/designer/schemaOps'
import { createEmptySchema, exportSchema, importSchema } from '@/designer/schemaIO'
import { SCHEMA_ISSUE_CODES, validateSchema } from '@/schema/validate'
import {
  isDataField,
  SCHEMA_VERSION,
  type DataFieldNode,
  type FieldNode,
  type FormConfig,
  type FormSchema,
  type SubFormNode,
  type TabsFieldNode,
  type VisibilityRule,
} from '@/schema/types'

describe('设计器 schema 操作 (7.3)', () => {
  it('createNode 为数据字段分配唯一 key 与 field 标识', () => {
    const fields: FieldNode[] = []
    const n1 = createNode('input', fields)
    fields.push(n1)
    const n2 = createNode('input', fields)
    expect(isDataField(n1) && isDataField(n2)).toBe(true)
    expect(n1.key).not.toBe(n2.key)
    if (isDataField(n1) && isDataField(n2)) {
      expect(n1.field).not.toBe(n2.field)
    }
  })

  it('genFieldId 避免与既有标识冲突', () => {
    const fields: FieldNode[] = [{ type: 'input', key: 'a', field: 'input_1', title: 'A' }]
    expect(genFieldId('input', fields)).toBe('input_2')
  })

  it('createNode 布局字段不带 field', () => {
    const node = createNode('divider', [])
    expect(node.type).toBe('divider')
    expect(isDataField(node)).toBe(false)
  })

  it('拖拽 clone：字段工厂须接收类型字符串而非面板列表项对象', () => {
    const fields: FieldNode[] = []
    // 面板项为 { type, label, icon }，vuedraggable 的 clone 回调收到整个对象，
    // 必须取 .type 再传入工厂
    const paletteItem = { type: 'input', label: '单行文本', icon: null } as const
    const node = createNode(paletteItem.type, fields)
    expect(isDataField(node)).toBe(true)
    expect(node.type).toBe('input')
    // 回归保护：若将整个列表项对象误传给工厂，会因类型未注册而抛错（导致“拖不进画布”）
    expect(() => createNode(paletteItem as any, fields)).toThrow(/未注册的字段类型/)
  })

  it('findNodeByKey 递归定位容器内节点', () => {
    const fields: FieldNode[] = [
      {
        type: 'tabs',
        key: 'tabs',
        tabs: [
          {
            key: 't1',
            title: '页',
            fields: [{ type: 'input', key: 'inner', field: 'x', title: 'X' }],
          },
        ],
      },
    ]
    const ctx = findNodeByKey(fields, 'inner')
    expect(ctx).not.toBeNull()
    expect(ctx!.node.key).toBe('inner')
  })

  it('removeNodeByKey 删除顶层与容器内节点', () => {
    const fields: FieldNode[] = [
      { type: 'input', key: 'a', field: 'a', title: 'A' },
      {
        type: 'tabs',
        key: 'tabs',
        tabs: [
          {
            key: 't1',
            title: '页',
            fields: [{ type: 'input', key: 'inner', field: 'x', title: 'X' }],
          },
        ],
      },
    ]
    expect(removeNodeByKey(fields, 'a')).toBe(true)
    expect(fields).toHaveLength(1)
    expect(removeNodeByKey(fields, 'inner')).toBe(true)
    expect(removeNodeByKey(fields, 'nope')).toBe(false)
  })

  it('updateNodeByKey 更新通用属性与 props', () => {
    const fields: FieldNode[] = [
      { type: 'input', key: 'a', field: 'a', title: 'A', props: { x: 1 } },
    ]
    updateNodeByKey(fields, 'a', { title: '新标题', props: { y: 2 } } as Partial<FieldNode>)
    const node = fields[0] as any
    expect(node.title).toBe('新标题')
    expect(node.props).toEqual({ x: 1, y: 2 })
  })

  it('moveNode 在同一数组内重排', () => {
    const fields: FieldNode[] = [
      { type: 'input', key: 'a', field: 'a', title: 'A' },
      { type: 'input', key: 'b', field: 'b', title: 'B' },
    ]
    moveNode(fields, 0, 1)
    expect(fields[0].key).toBe('b')
    expect(fields[1].key).toBe('a')
  })
})

describe('schemaOps 递归进入子表单子字段 (6.3)', () => {
  function subFormFixture(): FieldNode[] {
    return [
      { type: 'input', key: 'main', field: 'name', title: '名称' },
      {
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '明细',
        subFields: [
          { type: 'input', key: 'sf_name', field: 'item_name', title: '名称' },
          { type: 'number', key: 'sf_qty', field: 'qty', title: '数量' },
        ],
        props: { minRows: 1, maxRows: 200 },
      } as any,
    ]
  }

  it('findNodeByKey 定位深层子字段并带上所属子表单父节点', () => {
    const ctx = findNodeByKey(subFormFixture(), 'sf_qty')
    expect(ctx).not.toBeNull()
    expect(ctx!.node.key).toBe('sf_qty')
    expect(ctx!.parent?.key).toBe('sf')
    expect(ctx!.index).toBe(1)
  })

  it('顶层字段 parent 为 null', () => {
    const ctx = findNodeByKey(subFormFixture(), 'main')
    expect(ctx!.parent).toBeNull()
  })

  it('removeNodeByKey 从 subFields 删除子字段且不影响主表字段', () => {
    const fields = subFormFixture()
    expect(removeNodeByKey(fields, 'sf_name')).toBe(true)
    const sf = fields[1] as any
    expect(sf.subFields).toHaveLength(1)
    expect(sf.subFields[0].key).toBe('sf_qty')
    expect(fields).toHaveLength(2)
    expect(fields[0].key).toBe('main')
  })

  it('updateNodeByKey 只更新子字段，不影响同标题的主表字段', () => {
    const fields = subFormFixture()
    updateNodeByKey(fields, 'sf_name', { title: '货品名称', required: true } as Partial<FieldNode>)
    const sf = fields[1] as any
    expect(sf.subFields[0].title).toBe('货品名称')
    expect(sf.subFields[0].required).toBe(true)
    // 主表同标题字段未被改动
    expect((fields[0] as any).title).toBe('名称')
    expect((fields[0] as any).required).toBeUndefined()
  })

  it('删除主表字段不误伤子表单内子字段', () => {
    const fields = subFormFixture()
    expect(removeNodeByKey(fields, 'main')).toBe(true)
    expect(fields).toHaveLength(1)
    expect((fields[0] as any).subFields).toHaveLength(2)
  })
})

describe('schema 导入导出 (7.7)', () => {
  it('createEmptySchema 生成有效空表单', () => {
    const s = createEmptySchema('我的表单')
    expect(s.name).toBe('我的表单')
    expect(s.version).toBe(SCHEMA_VERSION)
    expect(s.fields).toEqual([])
    // 缺省标签宽度不写入文档：由 resolveFormConfig 在读取时解析（单一来源），
    // 避免“新建文档带一个值、导入文档缺省另一个值”的分裂
    expect(Object.keys(s.formConfig ?? {})).not.toContain('labelWidth')
  })

  it('导出的 JSON 可被重新导入', () => {
    const s = createEmptySchema('往返')
    s.fields.push({ type: 'input', key: 'a', field: 'a', title: 'A' })
    const json = exportSchema(s)
    const imported = importSchema(json)
    expect(imported.name).toBe('往返')
    expect(imported.fields).toHaveLength(1)
  })

  it('含固定列配置的子表单导入导出往返无损 (8.5)', () => {
    const s = createEmptySchema('固定列往返')
    s.fields.push({
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '明细',
      subFields: [
        { type: 'input', key: 's1', field: 'a', title: 'A' },
        { type: 'input', key: 's2', field: 'b', title: 'B' },
        { type: 'input', key: 's3', field: 'c', title: 'C' },
      ],
      props: { minRows: 1, maxRows: 50, fixedLeftColumns: 1, fixedRightColumns: 1 },
    } as any)
    const imported = importSchema(exportSchema(s))
    const sf = imported.fields[0] as any
    expect(sf.type).toBe('subform')
    expect(sf.subFields.map((x: any) => x.field)).toEqual(['a', 'b', 'c'])
    expect(sf.props).toMatchObject({
      minRows: 1,
      maxRows: 50,
      fixedLeftColumns: 1,
      fixedRightColumns: 1,
    })
  })

  it('含发布标记与已有字段池的 schema 导入导出往返无损', () => {
    const s = createEmptySchema('发布往返')
    s.fields.push({ type: 'input', key: 'a', field: 'a', title: 'A', published: true })
    s.fields.push({
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '明细',
      published: true,
      subFields: [{ type: 'input', key: 's1', field: 'name', title: '名称', published: true }],
      fieldPool: [{ type: 'number', key: 'p1', field: 'qty', title: '数量' }],
      props: { minRows: 1, maxRows: 200 },
    } as unknown as FieldNode)
    s.formConfig = {
      ...s.formConfig,
      published: true,
      publishedVersion: 3,
      publishedAt: '2026-09-05T00:00:00.000Z',
      // 清单与画布标记保持一致（发布不变量的比对基线）；池内字段不入清单
      publishedFields: [
        { type: 'input', key: 'a', field: 'a', title: 'A', published: true },
        {
          type: 'subform',
          key: 'sf',
          field: 'items',
          title: '明细',
          published: true,
          subFields: [{ type: 'input', key: 's1', field: 'name', title: '名称', published: true }],
        },
      ],
    }
    const imported = importSchema(exportSchema(s))
    expect(imported.formConfig?.published).toBe(true)
    expect(imported.formConfig?.publishedVersion).toBe(3)
    expect(imported.formConfig?.publishedAt).toBe('2026-09-05T00:00:00.000Z')
    // 清单快照同样往返无损（含子表单条目的子字段）
    expect(imported.formConfig?.publishedFields?.map((f) => f.field)).toEqual(['a', 'items'])
    expect((imported.fields[0] as any).published).toBe(true)
    const sf = imported.fields[1] as any
    expect(sf.published).toBe(true)
    expect(sf.subFields[0].published).toBe(true)
    // 池内字段随文档一同持久化（以便下次打开仍可加回）
    expect(sf.fieldPool.map((x: any) => x.field)).toEqual(['qty'])
  })

  it('导入非法 JSON 抛错', () => {
    expect(() => importSchema('{ not json')).toThrow(/JSON 解析失败/)
  })

  it('导入不符合契约的 schema 抛错', () => {
    expect(() => importSchema(JSON.stringify({ id: 'x' }))).toThrow(/校验失败/)
  })

  it('含子表单的 schema 导入导出往返一致（类型/子字段顺序/行数配置无损） (6.7)', () => {
    const s = createEmptySchema('子表单往返')
    s.fields.push({
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '采购明细',
      required: true,
      subFields: [
        { type: 'input', key: 'n', field: 'name', title: '产品名称', required: true },
        { type: 'number', key: 'q', field: 'qty', title: '数量' },
      ],
      props: { minRows: 2, maxRows: 5 },
    } as unknown as FieldNode)
    const imported = importSchema(exportSchema(s))
    const sf = imported.fields[0] as any
    expect(sf.type).toBe('subform')
    expect(sf.title).toBe('采购明细')
    expect(sf.required).toBe(true)
    expect(sf.props).toEqual({ minRows: 2, maxRows: 5 })
    expect(sf.subFields).toHaveLength(2)
    // 子字段顺序无损
    expect(sf.subFields.map((f: any) => f.field)).toEqual(['name', 'qty'])
    expect(sf.subFields.map((f: any) => f.title)).toEqual(['产品名称', '数量'])
    expect(sf.subFields[0].required).toBe(true)
  })
})

describe('多标签页页签新增与删除', () => {
  const newTabs = () => createNode('tabs', []) as TabsFieldNode

  it('addTab 在末尾追加空页签且 key 唯一', () => {
    const node = newTabs()
    const fields: FieldNode[] = [node]
    const before = node.tabs.length
    const tab = addTab(fields, node.key)
    expect(tab).not.toBeNull()
    expect(node.tabs).toHaveLength(before + 1)
    // 新页签为空容器，可直接拖入字段
    expect(tab?.fields).toEqual([])
    expect(tab?.title).toBe(`标签页${before + 1}`)
    expect(new Set(node.tabs.map((t) => t.key)).size).toBe(node.tabs.length)
  })

  it('addTab 可递归定位嵌套页签容器，目标不存在或非 tabs 返回 null', () => {
    const inner = newTabs()
    const outer = newTabs()
    outer.tabs[0].fields.push(inner)
    const fields: FieldNode[] = [outer]
    expect(addTab(fields, inner.key)).not.toBeNull()
    expect(inner.tabs).toHaveLength(3)
    expect(outer.tabs).toHaveLength(2)
    expect(addTab(fields, 'not-exists')).toBeNull()
    const divider = createNode('divider', fields)
    fields.push(divider)
    expect(addTab(fields, divider.key)).toBeNull()
  })

  it('removeTab 删除页签连同其字段，仅剩最后一个时拒绝', () => {
    const node = newTabs()
    const fields: FieldNode[] = [node]
    const input = createNode('input', fields) as DataFieldNode
    fields.push(input)
    node.tabs[1].fields.push(input)
    expect(removeTab(fields, node.key, node.tabs[1].key)).toBe(true)
    expect(node.tabs).toHaveLength(1)
    // 仅剩一个页签时不得删除，避免容器无页签可用
    expect(removeTab(fields, node.key, node.tabs[0].key)).toBe(false)
    expect(node.tabs).toHaveLength(1)
    expect(removeTab(fields, node.key, 'no-such-tab')).toBe(false)
  })

  it('页签增删后的 schema 仍可通过结构校验', () => {
    const node = newTabs()
    const fields: FieldNode[] = [node]
    addTab(fields, node.key)
    removeTab(fields, node.key, node.tabs[1].key)
    const result = validateSchema({
      id: 'f1',
      name: '测试表单',
      version: SCHEMA_VERSION,
      fields,
    })
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(result.valid).toBe(true)
  })
})

/* --------------- 发布标记与已有字段池（schemaOps 纯函数） --------------- */

/** 含标签页与子表单的字段树（共 6 个节点）：验证递归覆盖与池操作 */
function publishTree(): FieldNode[] {
  return [
    { type: 'input', key: 'a', field: 'a', title: 'A' },
    {
      type: 'tabs',
      key: 'tabs',
      tabs: [
        {
          key: 't1',
          title: '页',
          fields: [{ type: 'input', key: 'inner', field: 'tab_field', title: 'I' }],
        },
      ],
    },
    {
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '明细',
      subFields: [
        { type: 'input', key: 's1', field: 'name', title: '名称' },
        { type: 'number', key: 's2', field: 'qty', title: '数量' },
      ],
      props: { minRows: 1, maxRows: 200 },
    } as unknown as FieldNode,
  ]
}

/** 取树内的子表单节点 */
function subFormOf(fields: FieldNode[]): SubFormNode {
  return findNodeByKey(fields, 'sf')!.node as unknown as SubFormNode
}

describe('schemaOps 发布标记', () => {
  it('markAllPublished 递归标记主表、标签页内与子表单子字段并返回数量', () => {
    const fields = publishTree()
    expect(markAllPublished(fields)).toBe(6)
    expect(fields.every((n) => n.published === true)).toBe(true)
    expect(findNodeByKey(fields, 'inner')!.node.published).toBe(true)
    expect(findNodeByKey(fields, 's2')!.node.published).toBe(true)
  })

  it('发布可反复执行：再次发布同样标记期间新增的字段', () => {
    const fields = publishTree()
    expect(markAllPublished(fields)).toBe(6)
    // 首次发布后新增的字段不带标记，再次发布时一并锁定
    fields.push({ type: 'input', key: 'extra', field: 'extra', title: '新增字段' })
    expect(markAllPublished(fields)).toBe(7)
    expect(findNodeByKey(fields, 'extra')!.node.published).toBe(true)
  })

  it('池内字段不在标记范围内', () => {
    const fields = publishTree()
    removeSubFieldToPool(fields, 'sf', 's2')
    markAllPublished(fields)
    expect(subFormOf(fields).fieldPool![0].published).toBeUndefined()
  })
})

describe('schemaOps 子表单已有字段池', () => {
  it('removeSubFieldToPool 移出子字段清单并留存完整定义', () => {
    const fields = publishTree()
    const removed = removeSubFieldToPool(fields, 'sf', 's2')
    expect(removed?.field).toBe('qty')
    const sf = subFormOf(fields)
    expect(sf.subFields.map((f) => f.field)).toEqual(['name'])
    expect(getPooledSubFields(fields, 'sf').map((f) => f.field)).toEqual(['qty'])
    // 保留原有标题与类型以便原样加回
    expect(sf.fieldPool![0]).toMatchObject({ type: 'number', key: 's2', title: '数量' })
  })

  it('定位失败时返回 null 且不建池', () => {
    const fields = publishTree()
    expect(removeSubFieldToPool(fields, 'nope', 's1')).toBeNull()
    expect(removeSubFieldToPool(fields, 'sf', 'nope')).toBeNull()
    expect((subFormOf(fields) as { fieldPool?: unknown }).fieldPool).toBeUndefined()
    expect(getPooledSubFields(fields, 'nope')).toEqual([])
    expect(getPooledSubFields(fields, 'sf')).toEqual([])
  })

  it('池内已有同 key 或同 field 的条目时以最新定义替换（不堆积）', () => {
    const fields = publishTree()
    const sf = subFormOf(fields)
    sf.fieldPool = [{ type: 'number', key: 'stale', field: 'qty', title: '旧数量' }]
    removeSubFieldToPool(fields, 'sf', 's2')
    expect(sf.fieldPool).toHaveLength(1)
    expect(sf.fieldPool![0]).toMatchObject({ key: 's2', title: '数量' })
  })

  it('加回时沿用原标识与配置并落到清单末尾，池随之清空', () => {
    const fields = publishTree()
    removeSubFieldToPool(fields, 'sf', 's1')
    const sf = subFormOf(fields)
    // 移除期间清单又追加了新子字段，验证加回落到末尾
    sf.subFields.push({ type: 'input', key: 's3', field: 'spec', title: '规格' })
    const result = restorePooledSubField(fields, 'sf', 's1')
    expect(result.ok).toBe(true)
    expect(sf.subFields.map((f) => f.field)).toEqual(['qty', 'spec', 'name'])
    expect(sf.subFields[2].title).toBe('名称')
    expect(getPooledSubFields(fields, 'sf')).toEqual([])
  })

  it('标识已被本子表单内其他子字段占用时不予加回（保留池内条目）', () => {
    const fields = publishTree()
    removeSubFieldToPool(fields, 'sf', 's2')
    const sf = subFormOf(fields)
    sf.subFields.push({ type: 'number', key: 's3', field: 'qty', title: '数量副本' })
    const result = restorePooledSubField(fields, 'sf', 's2')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('field-conflict')
      expect(result.field).toBe('qty')
    }
    expect(getPooledSubFields(fields, 'sf')).toHaveLength(1)
    expect(sf.subFields).toHaveLength(2)
  })

  it('与主表字段同名不构成冲突（子字段作用域为当前子表单）', () => {
    const fields = publishTree()
    ;(fields[0] as DataFieldNode).field = 'name' // 主表字段占用 name
    removeSubFieldToPool(fields, 'sf', 's1') // 子字段 s1 的 field 亦为 name
    const result = restorePooledSubField(fields, 'sf', 's1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.node.field).toBe('name')
  })

  it('池中无该条目或子表单不存在时返回 not-found', () => {
    const fields = publishTree()
    removeSubFieldToPool(fields, 'sf', 's2')
    expect(restorePooledSubField(fields, 'sf', 'nope')).toEqual({ ok: false, reason: 'not-found' })
    expect(restorePooledSubField(fields, 'nope', 's2')).toEqual({ ok: false, reason: 'not-found' })
  })

  it('key 与树内现有节点重复时重新分配（标识保持不变）', () => {
    const fields = publishTree()
    removeSubFieldToPool(fields, 'sf', 's2')
    fields.push({ type: 'input', key: 's2', field: 'other', title: '占用 key' })
    const result = restorePooledSubField(fields, 'sf', 's2')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.node.key).not.toBe('s2')
      expect(result.node.field).toBe('qty')
    }
  })

  it('入池后的 schema 仍通过结构校验（池内字段不参与唯一性判定）', () => {
    const fields = publishTree()
    removeSubFieldToPool(fields, 'sf', 's1') // 池内留存 name
    fields.push({ type: 'input', key: 'dup', field: 'name', title: '与池内同名' })
    const result = validateSchema({ id: 'f1', name: 'n', version: SCHEMA_VERSION, fields })
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

/* -------- 设计器挂载：表单级缺省值消费与选中态一致性 -------- */

describe('设计器挂载：表单级缺省值与选中态一致性', () => {
  function mountDesigner(fields: FieldNode[], formConfig: FormConfig = {}) {
    return mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'd',
          name: '设计',
          version: SCHEMA_VERSION,
          fields,
          formConfig,
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
  }
  /** 右侧属性面板当前激活的上下文 tab */
  function activeTab(wrapper: ReturnType<typeof mount>) {
    return wrapper.find('.form-designer__right .el-tabs__item.is-active').text()
  }
  /** 画布内某卡片工具条上的「删除」入口 */
  function removeBtnOf(wrapper: ReturnType<typeof mount>, key: string) {
    return wrapper.find(
      `.field-card[data-field-key="${key}"] .field-card__bar .field-card__no-drag`,
    )
  }
  const inputNode = (key: string, field: string, title: string) =>
    ({ type: 'input', key, field, title }) as unknown as FieldNode
  /** 多标签页容器：首个页签内含一个字段 */
  function tabsNode(): FieldNode {
    return {
      type: 'tabs',
      key: 'tb',
      title: '分组',
      tabs: [
        {
          key: 't1',
          title: '标签页1',
          fields: [{ type: 'input', key: 'inner', field: 'dept', title: '部门' }],
        },
        { key: 't2', title: '标签页2', fields: [] },
      ],
    } as unknown as FieldNode
  }
  /** 子表单：含一个子字段 */
  function subFormNode(): FieldNode {
    return {
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '明细',
      subFields: [{ type: 'input', key: 's1', field: 'item_name', title: '产品名称' }],
    } as unknown as FieldNode
  }

  it('表单属性面板显示契约层解析出的缺省标签宽度，未交互时不回填文档', async () => {
    const wrapper = mountDesigner([inputNode('a', 'name', '姓名')])
    await flushPromises()
    const panel = wrapper.findComponent(FormPropertyPanel)
    const widthInput = panel.find('.el-input-number input').element as HTMLInputElement
    expect(widthInput.value).toBe('125')
    // 解析值只用于展示：未与控件交互则不发出 patch，文档中不出现 labelWidth 键
    expect(panel.emitted('patch')).toBeUndefined()
    const s = (wrapper.vm as unknown as { schema: FormSchema }).schema
    expect(Object.keys(s.formConfig ?? {})).not.toContain('labelWidth')
    wrapper.unmount()
  })

  it('设计器三处消费点均不再内联兜底值（缺省值只在契约层一处）', async () => {
    // 与 FieldList 的 prop 必填化配套：从源码层面确认兜底点已彻底消失，
    // 避免未来又在画布/面板重新长出第二份缺省值而与填报态漂移
    const consumers = [
      'src/designer/FormDesigner.vue',
      'src/designer/FieldList.vue',
      'src/designer/FormPropertyPanel.vue',
    ]
    for (const rel of consumers) {
      const src = await readFile(resolve(process.cwd(), rel), 'utf-8')
      expect(src, `${rel} 不得内联标签宽度兜底值`).not.toMatch(/labelWidth\s*\?\?/)
      expect(src, `${rel} 不得内联标签对齐兜底值`).not.toMatch(/labelPosition\s*\?\?/)
    }
  })

  it('删除多标签页容器后，其内部字段的选中态被清空且面板切到「表单属性」', async () => {
    const wrapper = mountDesigner([tabsNode(), inputNode('a', 'name', '姓名')])
    await flushPromises()
    await wrapper.find('.field-card[data-field-key="inner"]').trigger('click')
    await flushPromises()
    expect(activeTab(wrapper)).toBe('字段属性')
    expect(wrapper.find('.field-card.is-selected').attributes('data-field-key')).toBe('inner')
    // 删除容器（连同其页签与内部字段）
    await removeBtnOf(wrapper, 'tb').trigger('click')
    await flushPromises()
    expect(wrapper.find('.field-card.is-selected').exists()).toBe(false)
    expect(activeTab(wrapper)).toBe('表单属性')
    // 面板不报错也不残留已删节点的属性：回到表单级配置与字段空态引导
    expect(wrapper.text()).toContain('表单布局')
    expect(wrapper.text()).toContain('请选择一个字段')
    wrapper.unmount()
  })

  it('删除子表单后，其子字段的选中态被清空且属性面板不报错', async () => {
    const wrapper = mountDesigner([subFormNode(), inputNode('a', 'name', '姓名')])
    await flushPromises()
    // 选中子字段（子表单列头点击上抛 select）
    await wrapper.find('.subform-col').trigger('click')
    await flushPromises()
    expect(activeTab(wrapper)).toBe('字段属性')
    expect(wrapper.find('.subform-col.is-selected').exists()).toBe(true)
    await removeBtnOf(wrapper, 'sf').trigger('click')
    await flushPromises()
    expect(wrapper.find('.subform-col.is-selected').exists()).toBe(false)
    expect(activeTab(wrapper)).toBe('表单属性')
    expect(wrapper.text()).toContain('请选择一个字段')
    wrapper.unmount()
  })

  it('删除无关节点不影响当前选中字段与其「字段属性」上下文', async () => {
    const wrapper = mountDesigner([inputNode('a', 'name', '姓名'), inputNode('b', 'dept', '部门')])
    await flushPromises()
    await wrapper.find('.field-card[data-field-key="a"]').trigger('click')
    await flushPromises()
    expect(activeTab(wrapper)).toBe('字段属性')
    await removeBtnOf(wrapper, 'b').trigger('click')
    await flushPromises()
    // A 与 B 无祖先/后代关系：A 的选中态与上下文保持不变
    expect(wrapper.find('.field-card.is-selected').attributes('data-field-key')).toBe('a')
    expect(activeTab(wrapper)).toBe('字段属性')
    wrapper.unmount()
  })
})

/* ---------------- 结构问题分类标签映射（6.2） ---------------- */

describe('问题分类标签映射覆盖全部分类码', () => {
  it('SCHEMA_ISSUE_CODES 每一项都有非空中文标签，且键集合不多不少', () => {
    for (const code of SCHEMA_ISSUE_CODES) {
      expect(typeof ISSUE_CODE_LABELS[code], `${code} 缺少中文分类标签`).toBe('string')
      expect(ISSUE_CODE_LABELS[code].length, `${code} 的标签为空`).toBeGreaterThan(0)
    }
    // 穷举键集合：契约层新增 code 而映射表漏配（或残留已废弃的 code）都在此暴露
    expect(Object.keys(ISSUE_CODE_LABELS).sort()).toEqual([...SCHEMA_ISSUE_CODES].sort())
  })

  it('需在汇总提示开篇单列措辞的两类标签与主 spec 文案一致', () => {
    // form-designer 主 spec「保存被字段标识重复阻断」与「保存与发布被非法命名阻断」
    // 两条 Scenario 对这两句文案有断言：汇总提示以标签开篇，改标签即破坏既有规格
    expect(issueLabel('FIELD_ID_CONFLICT')).toBe('字段标识重复')
    expect(issueLabel('INVALID_FIELD_NAME')).toBe('字段标识命名不合法')
  })
})

/* ---------------- 设计器：结构问题清单、定位与导入阻断（6.5 / 6.6 / 6.7） ---------------- */

describe('设计器结构问题清单与定位', () => {
  /** el-table 布局为异步，统一 flush + 微等待 */
  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms))
  /**
   * el-dialog 关闭时遮罩的 display 由离场过渡回调写入（jsdom 下按帧计时），
   * 比 el-table 布局慢，断言「弹窗已关」前需更长的等待
   */
  const waitDialogClosed = (ms = 150) => new Promise((r) => setTimeout(r, ms))

  // locateByKey 在整个 document 上按 [data-field-key] 查卡片，故每个用例前清空上一个用例
  // 可能残留的 DOM，避免其他用例的卡片让「卡片不可见」分支误判为可见
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function mountDesigner(fields: FieldNode[], id = 'issues', formConfig: FormConfig = {}) {
    return mount(FormDesigner, {
      props: {
        modelValue: {
          id,
          name: '问题清单',
          version: SCHEMA_VERSION,
          fields,
          formConfig,
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
  }
  /** 按文案定位设计器工具栏按钮 */
  function toolbarBtn(wrapper: ReturnType<typeof mount>, text: string) {
    return wrapper.findAll('.form-designer__toolbar button').find((b) => b.text() === text)
  }
  /** 问题清单表格的数据行 */
  function issueRows(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.form-designer__issues .el-table__body-wrapper .el-table__row')
  }
  /**
   * 问题清单弹窗是否可见：el-dialog 关闭是用 v-show 隐藏遮罩（DOM 仍在），
   * 故不能用 exists() 判定开关，需看遮罩的内联 display
   */
  function issuesDialogVisible(wrapper: ReturnType<typeof mount>) {
    const table = wrapper.find('.form-designer__issues')
    if (!table.exists()) return false
    const overlay = table.element.closest('.el-overlay') as HTMLElement | null
    return overlay ? overlay.style.display !== 'none' : true
  }
  /** 右侧属性面板当前激活的上下文 tab */
  function activeTab(wrapper: ReturnType<typeof mount>) {
    return wrapper.find('.form-designer__right .el-tabs__item.is-active').text()
  }
  /** 设计器当前选中的节点 key（卡片未渲染时只能经暴露状态断言） */
  function selectedKeyOf(wrapper: ReturnType<typeof mount>) {
    return (wrapper.vm as unknown as { selectedKey: string }).selectedKey
  }
  function inputNode(key: string, field: string, title: string, extra = {}) {
    return { type: 'input', key, field, title, ...extra } as unknown as FieldNode
  }
  const showWhen = (field: string): VisibilityRule => ({
    logic: 'and',
    action: 'show',
    conditions: [{ field, operator: 'eq', value: 'x' }],
  })
  /**
   * 恰好 3 处 error 级问题的字段树：标识重复 + 命名不合法（系统保留字）+ 显隐引用悬空。
   * 三类分属不同分类码，用于验证「一次列出全部」而非只报第一条。
   */
  function brokenFields(): FieldNode[] {
    return [
      inputNode('a', 'name', '姓名'),
      inputNode('b', 'name', '姓名副本'),
      inputNode('c', 'dept', '部门', { visibleRule: showWhen('ghost') }),
      inputNode('d', 'insert', '保留字'),
    ]
  }
  /** 问题字段位于第二个（默认未激活）页签内，其卡片尚未渲染 */
  function danglingInInactiveTab(): FieldNode[] {
    return [
      {
        type: 'tabs',
        key: 'tb',
        title: '分组',
        tabs: [
          { key: 't1', title: '标签页1', fields: [] },
          {
            key: 't2',
            title: '标签页2',
            fields: [inputNode('inner', 'dept', '部门', { visibleRule: showWhen('ghost') })],
          },
        ],
      } as unknown as FieldNode,
      inputNode('a', 'name', '姓名'),
    ]
  }
  /** 含悬空显隐引用的完整文档（导入用） */
  function danglingDoc() {
    return {
      id: 'imp',
      name: '导入',
      version: SCHEMA_VERSION,
      fields: [
        { type: 'input', key: 'a', field: 'name', title: '姓名' },
        { type: 'input', key: 'b', field: 'dept', title: '部门', visibleRule: showWhen('ghost') },
      ],
      formConfig: {},
    }
  }

  it('存在 3 处 error 时点保存：清单列出全部 3 条、汇总提示含总数、不写本地存储', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error')
    const wrapper = mountDesigner(brokenFields())
    await flushPromises()
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    await wait()
    // MUST NOT 只列第一条
    expect(issuesDialogVisible(wrapper)).toBe(true)
    expect(issueRows(wrapper)).toHaveLength(3)
    const text = wrapper.find('.form-designer__issues').text()
    // 每行呈现由 code 映射的分类标签与字段树位置
    expect(text).toContain('字段标识重复')
    expect(text).toContain('字段标识命名不合法')
    expect(text).toContain('显隐规则引用悬空')
    expect(text).toContain('fields[2].visibleRule.conditions[0]')
    // 汇总提示告知问题总数（delta spec「多处问题全部列出」）
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('3 处结构问题')
    // 呈现清单不改变阻断语义：不写入持久化存储
    expect(localStorage.getItem('form-engine:schema:issues')).toBeNull()
    errSpy.mockRestore()
    wrapper.unmount()
  })

  it('存在 error 时点发布：不打任何发布标记、发布版本不递增，清单同样呈现', async () => {
    const fields = brokenFields()
    const wrapper = mountDesigner(fields, 'issues-pub')
    await flushPromises()
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    await wait()
    const s = (wrapper.vm as unknown as { schema: FormSchema }).schema
    expect(s.formConfig?.published).toBeUndefined()
    expect(s.formConfig?.publishedVersion).toBeUndefined()
    expect(fields.every((n) => n.published === undefined)).toBe(true)
    // 发布与保存共用同一道前置校验，同样一次呈现全部问题
    expect(issueRows(wrapper)).toHaveLength(3)
    wrapper.unmount()
  })

  it('点击带 fieldKey 的条目定位到画布字段并关闭清单', async () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const wrapper = mountDesigner(brokenFields(), 'issues-locate')
    await flushPromises()
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    await wait()
    // 首条为标识重复，归属卡片 key 为 b
    await wrapper.find('.form-designer__issues .form-designer__issue-locate').trigger('click')
    await flushPromises()
    await waitDialogClosed()
    expect(selectedKeyOf(wrapper)).toBe('b')
    expect(wrapper.find('.field-card.is-selected').attributes('data-field-key')).toBe('b')
    expect(activeTab(wrapper)).toBe('字段属性')
    expect(scrollSpy).toHaveBeenCalled()
    // 定位后清单关闭，画布立即可见
    expect(issuesDialogVisible(wrapper)).toBe(false)
    scrollSpy.mockRestore()
    wrapper.unmount()
  })

  it('定位未激活页签内的问题字段：完成选中并给出反馈，不静默无响应', async () => {
    const warnSpy = vi.spyOn(ElMessage, 'warning')
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const wrapper = mountDesigner(danglingInInactiveTab(), 'issues-tab')
    await flushPromises()
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    await wait()
    expect(issueRows(wrapper)).toHaveLength(1)
    await wrapper.find('.form-designer__issues .form-designer__issue-locate').trigger('click')
    await flushPromises()
    await wait()
    // 卡片尚未渲染（第二个页签未激活）：选中仍完成，且 MUST NOT 静默无响应
    expect(selectedKeyOf(wrapper)).toBe('inner')
    expect(activeTab(wrapper)).toBe('字段属性')
    expect(String(warnSpy.mock.calls.at(-1)![0])).toContain('标签页')
    expect(scrollSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
    scrollSpy.mockRestore()
    wrapper.unmount()
  })

  it('清单含表单级问题（无 fieldKey）时仍正常渲染，该行不提供定位入口', async () => {
    const fields = [inputNode('a', 'name', '姓名')]
    markAllPublished(fields)
    // 已发布 + 有带标记节点 + 清单为空 → 恰好一条表单级 PUBLISHED_CATALOG_MISSING
    const wrapper = mountDesigner(fields, 'issues-form', {
      published: true,
      publishedFields: [],
    })
    await flushPromises()
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    await wait()
    const rows = issueRows(wrapper)
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('已发布字段清单缺失')
    expect(rows[0].text()).toContain('formConfig.publishedFields')
    // 表单级问题没有对应卡片：缺定位入口，但不得因此使整份清单呈现失败
    expect(rows[0].find('.form-designer__issue-locate').exists()).toBe(false)
    wrapper.unmount()
  })

  it('按清单修正全部问题后再次保存：不再呈现清单且写入成功', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error')
    const wrapper = mountDesigner(brokenFields(), 'issues-fixed')
    await flushPromises()
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    await wait()
    expect(issueRows(wrapper)).toHaveLength(3)
    // 先关掉清单，再按清单逐条修正：改重复标识、去掉悬空引用、换掉系统保留字
    const okBtn = wrapper
      .findAll('.el-dialog__footer .el-button')
      .find((b) => b.text() === '知道了')
    await okBtn!.trigger('click')
    await flushPromises()
    await waitDialogClosed()
    expect(issuesDialogVisible(wrapper)).toBe(false)

    const s = (wrapper.vm as unknown as { schema: FormSchema }).schema
    ;(s.fields[1] as DataFieldNode).field = 'name_copy'
    delete (s.fields[2] as DataFieldNode).visibleRule
    ;(s.fields[3] as DataFieldNode).field = 'remark'
    await flushPromises()

    const blockedCalls = errSpy.mock.calls.length
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    await waitDialogClosed()
    // 校验通过：不再报错、不再呈现清单，且正常写入本地存储
    expect(errSpy.mock.calls).toHaveLength(blockedCalls)
    expect(issuesDialogVisible(wrapper)).toBe(false)
    expect(localStorage.getItem('form-engine:schema:issues-fixed')).not.toBeNull()
    errSpy.mockRestore()
    wrapper.unmount()
  })

  describe('导入被拒时的提示与编辑内容保护 (6.7)', () => {
    it('失败文案按分类码组织：带分类标签、条数与条件路径', () => {
      const json = JSON.stringify(danglingDoc())
      expect(() => importSchema(json)).toThrow(/校验失败（共 1 处）/)
      expect(() => importSchema(json)).toThrow(/\[显隐规则引用悬空\]/)
      expect(() => importSchema(json)).toThrow(/fields\[1\]\.visibleRule\.conditions\[0\]/)
    })

    it('设计器内导入含悬空显隐引用的文档被拒，原编辑内容不变', async () => {
      const errSpy = vi.spyOn(ElMessage, 'error')
      const wrapper = mountDesigner([inputNode('a', 'name', '姓名')], 'issues-import')
      await flushPromises()
      const before = JSON.stringify((wrapper.vm as unknown as { schema: FormSchema }).schema)
      await toolbarBtn(wrapper, '导入')!.trigger('click')
      await flushPromises()
      await wrapper.find('.el-dialog textarea').setValue(JSON.stringify(danglingDoc()))
      const confirm = wrapper
        .findAll('.el-dialog__footer .el-button')
        .find((b) => b.text() === '导入')
      await confirm!.trigger('click')
      await flushPromises()
      const msg = String(errSpy.mock.calls.at(-1)![0])
      expect(msg).toContain('校验失败')
      // 提示指出悬空引用及其分类（而非仅依赖 message 子串）
      expect(msg).toContain('[显隐规则引用悬空]')
      // SHALL NOT 用该文档替换当前正在编辑的表单
      expect(JSON.stringify((wrapper.vm as unknown as { schema: FormSchema }).schema)).toBe(before)
      expect(localStorage.getItem('form-engine:schema:issues-import')).toBeNull()
      errSpy.mockRestore()
      wrapper.unmount()
    })
  })
})
