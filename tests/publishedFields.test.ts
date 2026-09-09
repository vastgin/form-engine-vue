import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PublishedFieldsPanel from '@/designer/PublishedFieldsPanel.vue'
import FormDesigner from '@/designer/FormDesigner.vue'
import {
  buildPublishedCatalog,
  clonePublishedEntry,
  findCanvasFieldByFieldId,
  getCanvasFieldIds,
  markAllPublished,
  removeNodeByKey,
} from '@/designer/schemaOps'
import { exportSchema, importSchema } from '@/designer/schemaIO'
import { validateSchema } from '@/schema/validate'
import {
  SCHEMA_VERSION,
  type DataFieldNode,
  type FieldNode,
  type FormConfig,
  type FormSchema,
  type PublishedFieldEntry,
} from '@/schema/types'

/**
 * 已发布字段清单（设计器左侧「字段」tab）：
 * - schemaOps 纯函数：发布快照的范围与去重、拖回克隆、画布在用比对与定位；
 * - PublishedFieldsPanel：按控件分组、在用置灰、置灰项点击定位、空态；
 * - FormDesigner 集成：发布生成清单 / 再次发布重建、左侧双 tab、删字段后清单仍可拖回；
 * - validateSchema 发布不变量：已发布字段标识与清单快照的一致性、清单不参与唯一性判定。
 * 对应 specs/form-designer「已发布字段清单」「左侧面板组件/字段双 tab」
 * 与 specs/form-schema「表单发布状态」。
 */

const PANEL_SOURCE = 'src/designer/PublishedFieldsPanel.vue'

function source(relPath: string): Promise<string> {
  return readFile(resolve(process.cwd(), relPath), 'utf-8')
}

/** 可发布字段树：主表字段 + 布局字段 + 多标签页（内含字段）+ 子表单（内含子字段） */
function tree(): FieldNode[] {
  return [
    { type: 'input', key: 'a', field: 'name', title: '姓名' },
    { type: 'divider', key: 'd', title: '分隔线' },
    {
      type: 'tabs',
      key: 'tb',
      title: '分组',
      tabs: [
        {
          key: 't1',
          title: '标签页1',
          fields: [{ type: 'select', key: 'inner', field: 'dept', title: '部门', options: [] }],
        },
        { key: 't2', title: '标签页2', fields: [] },
      ],
    },
    {
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '明细',
      subFields: [{ type: 'input', key: 's1', field: 'item_name', title: '产品名称' }],
    },
  ] as unknown as FieldNode[]
}

/** 按发布顺序构造清单：先打标记再快照（与 FormDesigner 的发布链路一致） */
function publishedCatalog(fields: FieldNode[]): PublishedFieldEntry[] {
  markAllPublished(fields)
  return buildPublishedCatalog(fields)
}

/** 组装一份可通过结构校验的文档（发布不变量只关心 formConfig 与字段树的一致性） */
function schemaOf(fields: FieldNode[], formConfig: FormConfig = {}): FormSchema {
  return {
    id: 'pub',
    name: '发布不变量',
    version: SCHEMA_VERSION,
    fields,
    formConfig,
  } as unknown as FormSchema
}

/** 取出某一码的问题条目（断言条数以验证「不逐字段报」的汇总策略） */
function issuesOf(result: ReturnType<typeof validateSchema>, code: string) {
  return result.issues.filter((i) => i.code === code)
}

/* ---------------- schemaOps：清单快照、克隆与比对 ---------------- */

describe('buildPublishedCatalog 快照范围', () => {
  it('仅收录主表数据字段（含多标签页内字段与子表单整体），排除布局字段与子字段', () => {
    const catalog = publishedCatalog(tree())
    expect(catalog.map((e) => e.field)).toEqual(['name', 'dept', 'items'])
    // 子表单的子字段与布局字段不入清单
    expect(catalog.some((e) => e.field === 'item_name')).toBe(false)
    const types: string[] = catalog.map((e) => e.type)
    expect(types).not.toContain('divider')
    expect(types).not.toContain('tabs')
  })

  it('条目在 markAllPublished 之后生成，因此自带发布标记（拖回后标识仍锁定）', () => {
    const catalog = publishedCatalog(tree())
    expect(catalog.every((e) => e.published === true)).toBe(true)
  })

  it('条目是深拷贝：后续编辑画布节点不影响既有快照', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    ;(fields[0] as DataFieldNode).title = '改名'
    ;(fields[3] as unknown as { subFields: DataFieldNode[] }).subFields[0].title = '子字段改名'
    expect(catalog[0].title).toBe('姓名')
    // 子表单条目内的子字段定义同样脱离引用共享
    expect((catalog[2] as { subFields: DataFieldNode[] }).subFields[0].title).toBe('产品名称')
  })

  it('同一字段标识只入一条（去重），并保持字段树顺序', () => {
    const fields = tree()
    // 构造重复标识：另一字段被人改成同一标识（结构校验会另行报错）
    fields.push({ type: 'number', key: 'dup', field: 'name', title: '重复标识' } as FieldNode)
    const catalog = publishedCatalog(fields)
    expect(catalog.map((e) => e.field)).toEqual(['name', 'dept', 'items'])
    expect(catalog[0].title).toBe('姓名')
  })

  it('清单在发布时重建：已删除出画布的字段不再进入新清单', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    removeNodeByKey(fields, 'a')
    expect(catalog.map((e) => e.field)).toEqual(['name', 'dept', 'items'])
    expect(buildPublishedCatalog(fields).map((e) => e.field)).toEqual(['dept', 'items'])
  })

  it('返回新数组且不改动传入的字段树', () => {
    const fields = tree()
    markAllPublished(fields)
    const before = JSON.stringify(fields)
    const catalog = buildPublishedCatalog(fields)
    expect(catalog).not.toBe(fields)
    expect(JSON.stringify(fields)).toBe(before)
  })
})

describe('clonePublishedEntry 拖回画布', () => {
  it('沿用字段标识与全部配置，仅重新分配内部 key', () => {
    const catalog = publishedCatalog(tree())
    const entry = catalog[0]
    const copy = clonePublishedEntry(entry)
    expect(copy.field).toBe('name')
    expect(copy.title).toBe('姓名')
    expect(copy.published).toBe(true)
    expect(copy.key).not.toBe(entry.key)
    expect(copy.key).toMatch(/^input_/)
  })

  it('子表单条目整块拖回（含子字段），除内部 key 外与源条目同形且不共享引用', () => {
    const catalog = publishedCatalog(tree())
    const entry = catalog[2]
    const copy = clonePublishedEntry(entry)
    /** 忽略设计器内部 key 后的同形比对（key 按规则重新分配） */
    const withoutKey = (n: PublishedFieldEntry) => ({ ...n, key: '' })
    expect(withoutKey(copy)).toEqual(withoutKey(entry))
    ;(copy as unknown as { subFields: DataFieldNode[] }).subFields[0].title = '拖后改名'
    expect((entry as unknown as { subFields: DataFieldNode[] }).subFields[0].title).toBe('产品名称')
  })
})

describe('画布在用比对与定位', () => {
  it('getCanvasFieldIds 收集主表作用域标识（含标签页内与子表单），不含子字段', () => {
    const ids = getCanvasFieldIds(tree())
    expect([...ids].sort()).toEqual(['dept', 'items', 'name'])
    expect(ids.has('item_name')).toBe(false)
  })

  it('findCanvasFieldByFieldId 可定位标签页内字段，未命中返回 null', () => {
    const fields = tree()
    expect(findCanvasFieldByFieldId(fields, 'dept')?.key).toBe('inner')
    expect(findCanvasFieldByFieldId(fields, 'items')?.key).toBe('sf')
    expect(findCanvasFieldByFieldId(fields, 'item_name')).toBeNull()
  })
})

/* ---------------- PublishedFieldsPanel 展示与交互 ---------------- */

const catalogEntries: PublishedFieldEntry[] = [
  { type: 'input', key: 'a', field: 'name', title: '姓名', published: true },
  { type: 'subform', key: 'sf', field: 'items', title: '明细', subFields: [], published: true },
] as unknown as PublishedFieldEntry[]

function mountPanel(
  entries: PublishedFieldEntry[],
  fields: FieldNode[] = [
    { type: 'input', key: 'a2', field: 'name', title: '姓名', published: true } as FieldNode,
  ],
) {
  return mount(PublishedFieldsPanel, {
    props: { entries, fields },
    global: { plugins: [ElementPlus] },
  })
}

describe('PublishedFieldsPanel 分组与置灰', () => {
  it('按控件所属分组列出「常用 / 高级」，不设布局分组', () => {
    const wrapper = mountPanel(catalogEntries)
    expect(wrapper.findAll('.published-fields__title').map((t) => t.text())).toEqual([
      '常用',
      '高级',
    ])
  })

  it('条目标签为字段标题并带出字段标识；无标题时回落为控件名', () => {
    const wrapper = mountPanel([
      ...catalogEntries,
      { type: 'number', key: 'n', field: 'qty', published: true } as unknown as PublishedFieldEntry,
    ])
    // 同一分组的条目同列呈现：常用（姓名、数字）在前，高级（明细）在后
    const labels = wrapper.findAll('.published-fields__label').map((l) => l.text())
    const codes = wrapper.findAll('.published-fields__code').map((c) => c.text())
    expect(labels).toEqual(['姓名', '数字', '明细'])
    expect(codes).toEqual(['name', 'qty', 'items'])
  })

  it('画布中已在用的条目置灰，未在用的条目保持可拖', () => {
    const wrapper = mountPanel(catalogEntries)
    const items = wrapper.findAll('.published-fields__item')
    expect(items[0].classes()).toContain('is-used')
    expect(items[1].classes()).not.toContain('is-used')
  })

  it('点击置灰条目上抛 locate（携带字段标识），点击可拖条目无动作', async () => {
    const wrapper = mountPanel(catalogEntries)
    const items = wrapper.findAll('.published-fields__item')
    await items[0].trigger('click')
    expect(wrapper.emitted('locate')).toEqual([['name']])
    await items[1].trigger('click')
    expect(wrapper.emitted('locate')).toHaveLength(1)
  })

  it('清单为空时展示可读空态而非空白面板', () => {
    const wrapper = mountPanel([])
    expect(wrapper.find('.published-fields__item').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无已发布字段')
  })

  it('未注册类型与布局类型的条目被跳过（不产生无归属分组）', () => {
    const wrapper = mountPanel([
      ...catalogEntries,
      { type: 'divider', key: 'd', field: 'dv' } as unknown as PublishedFieldEntry,
      { type: 'mystery', key: 'm', field: 'ms' } as unknown as PublishedFieldEntry,
    ])
    expect(wrapper.findAll('.published-fields__item')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('dv')
  })

  it('拖拽契约：以 clone 方式 pull 到画布组，置灰项被 filter 排除且保留点击', async () => {
    const src = await source(PANEL_SOURCE)
    expect(src).toMatch(/:group="\{ name: 'fields', pull: 'clone', put: false \}"/)
    expect(src).toMatch(/:clone="handleClone"/)
    expect(src).toMatch(/filter="\.is-used"/)
    expect(src).toMatch(/:prevent-on-filter="false"/)
    expect(src).toMatch(/\.published-fields__item\.is-used\s*\{[^}]*cursor:\s*not-allowed/)
  })
})

/* ---------------- FormDesigner 集成：双 tab 与发布链路 ---------------- */

/** 按文案定位设计器工具栏按钮 */
function toolbarBtn(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('.form-designer__toolbar button').find((b) => b.text() === text)
}

function mountDesigner(fields: FieldNode[], formConfig: FormConfig = {}) {
  return mount(FormDesigner, {
    props: {
      modelValue: {
        id: 'catalog',
        name: '清单用例',
        version: SCHEMA_VERSION,
        fields,
        formConfig,
      } as unknown as FormSchema,
    },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

/** 左侧面板的 tab 文案（按 DOM 序） */
function leftTabLabels(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.form-designer__left .el-tabs__item').map((t) => t.text())
}

async function switchLeftTab(wrapper: ReturnType<typeof mount>, index: number): Promise<void> {
  await wrapper.findAll('.form-designer__left .el-tabs__item')[index].trigger('click')
  await flushPromises()
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('设计器左侧面板双 tab', () => {
  it('默认展示「组件」目录，分组文案为常用 / 高级 / 布局', async () => {
    const wrapper = mountDesigner(tree())
    await flushPromises()
    expect(leftTabLabels(wrapper)).toEqual(['组件', '字段'])
    expect(
      wrapper.findAll('.form-designer__left .field-palette__title').map((t) => t.text()),
    ).toEqual(['常用', '高级', '布局'])
    wrapper.unmount()
  })

  it('未发布时「字段」tab 展示空态', async () => {
    const wrapper = mountDesigner(tree())
    await flushPromises()
    await switchLeftTab(wrapper, 1)
    expect(wrapper.find('.form-designer__left').text()).toContain('暂无已发布字段')
    wrapper.unmount()
  })
})

describe('发布生成清单、再次发布重建', () => {
  it('点「发布」后主表字段进入 formConfig.publishedFields，「字段」tab 全部置灰', async () => {
    const fields = tree()
    const wrapper = mountDesigner(fields)
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const s = (wrapper.vm as unknown as { schema: FormSchema }).schema
    expect(s.formConfig?.publishedFields?.map((e) => e.field)).toEqual(['name', 'dept', 'items'])
    await switchLeftTab(wrapper, 1)
    const items = wrapper.findAll('.published-fields__item')
    expect(items).toHaveLength(3)
    expect(items.every((i) => i.classes().includes('is-used'))).toBe(true)
    wrapper.unmount()
  })

  it('已发布字段被删除出画布后清单条目不再置灰（可拖回且沿用标识）', async () => {
    const wrapper = mountDesigner(tree())
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    // 走画布删除入口（而非直接改传入的数组），保证设计器响应式链路同步到清单
    await wrapper
      .find('.field-card[data-field-key="a"]')
      .find('.field-card__no-drag')
      .trigger('click')
    await flushPromises()
    await switchLeftTab(wrapper, 1)
    const items = wrapper.findAll('.published-fields__item')
    expect(items[0].classes()).not.toContain('is-used')
    expect(items[0].attributes('title')).toContain('沿用字段标识 name')
    expect(items[1].classes()).toContain('is-used')
    wrapper.unmount()
  })

  it('点击置灰条目选中画布中对应卡片并滚动定位', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const wrapper = mountDesigner(tree())
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    await switchLeftTab(wrapper, 1)
    await wrapper.findAll('.published-fields__item')[1].trigger('click') // dept
    await flushPromises()
    expect(wrapper.find('.field-card.is-selected').attributes('data-field-key')).toBe('inner')
    expect(spy).toHaveBeenCalledTimes(1)
    // 选中联动右侧切到「字段属性」
    expect(wrapper.find('.form-designer__right .el-tabs__item.is-active').text()).toBe('字段属性')
    wrapper.unmount()
  })

  it('新增字段后再次发布：版本递增且清单按当时画布重建', async () => {
    const wrapper = mountDesigner(tree())
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    // 走画布删除入口移除 name，再重新加一个字段，然后再次发布
    await wrapper
      .find('.field-card[data-field-key="a"]')
      .find('.field-card__no-drag')
      .trigger('click')
    await flushPromises()
    ;(wrapper.vm as unknown as { schema: FormSchema }).schema.fields.push({
      type: 'number',
      key: 'fresh',
      field: 'qty',
      title: '数量',
    } as FieldNode)
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const s = (wrapper.vm as unknown as { schema: FormSchema }).schema
    expect(s.formConfig?.publishedVersion).toBe(2)
    // 清单代表最近一次发布：已删的 name 不再进入，新增的 qty 进入
    expect(s.formConfig?.publishedFields?.map((e) => e.field)).toEqual(['dept', 'items', 'qty'])
    wrapper.unmount()
  })
})

describe('清单随 schema 导入导出往返', () => {
  it('导出的 JSON 含已发布字段清单，导入后条目与发布状态完整保留', () => {
    const catalog = publishedCatalog(tree())
    const schema = {
      id: 'rt',
      name: '往返',
      version: SCHEMA_VERSION,
      // 画布另取一份未打标记的字段树，验证清单标记独立于画布字段
      fields: tree(),
      formConfig: { published: true, publishedVersion: 2, publishedFields: catalog },
    } as unknown as FormSchema
    const imported = importSchema(exportSchema(schema))
    expect(imported.formConfig?.publishedVersion).toBe(2)
    expect(imported.formConfig?.publishedFields?.map((e) => e.field)).toEqual([
      'name',
      'dept',
      'items',
    ])
    expect(imported.formConfig?.publishedFields?.[0]).toMatchObject({
      type: 'input',
      title: '姓名',
      published: true,
    })
  })
})

/* ---------------- 契约层：发布不变量（validateSchema） ---------------- */

describe('发布不变量：已发布字段标识与清单快照一致', () => {
  it('带标记字段的 field 改为快照外的值 → PUBLISHED_FIELD_MUTATED 且可定位到画布卡片', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    ;(fields[0] as DataFieldNode).field = 'renamed'
    const result = validateSchema(schemaOf(fields, { published: true, publishedFields: catalog }))
    expect(result.valid).toBe(false)
    const mutated = issuesOf(result, 'PUBLISHED_FIELD_MUTATED')
    expect(mutated).toHaveLength(1)
    // message 含节点完整路径与当前标识，fieldKey 供问题清单点击定位
    expect(mutated[0].path).toBe('fields[0]')
    expect(mutated[0].message).toContain('fields[0]')
    expect(mutated[0].message).toContain('renamed')
    expect(mutated[0].fieldKey).toBe('a')
  })

  it('多标签页内字段改穿同样被拒（路径下钻到页签内下标）', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    const tabs = fields[2] as unknown as { tabs: { fields: DataFieldNode[] }[] }
    tabs.tabs[0].fields[0].field = 'department'
    const result = validateSchema(schemaOf(fields, { published: true, publishedFields: catalog }))
    const mutated = issuesOf(result, 'PUBLISHED_FIELD_MUTATED')
    expect(mutated).toHaveLength(1)
    expect(mutated[0].path).toBe('fields[2].tabs[0].fields[0]')
    expect(mutated[0].fieldKey).toBe('inner')
  })

  it('子字段改穿按其所属子表单的快照子集合判定', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    const subForm = fields[3] as unknown as { subFields: DataFieldNode[] }
    subForm.subFields[0].field = 'item_code'
    const result = validateSchema(schemaOf(fields, { published: true, publishedFields: catalog }))
    const mutated = issuesOf(result, 'PUBLISHED_FIELD_MUTATED')
    expect(mutated).toHaveLength(1)
    expect(mutated[0].path).toBe('fields[3].subFields[0]')
    expect(mutated[0].fieldKey).toBe('s1')
    // 文案点出所属子表单，使作用域归属可诊断
    expect(mutated[0].message).toContain('items')
  })

  it('发布后新增（不带标记）的字段用任意合法标识都不受不变量约束', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    fields.push({ type: 'number', key: 'fresh', field: 'qty', title: '数量' } as FieldNode)
    const result = validateSchema(schemaOf(fields, { published: true, publishedFields: catalog }))
    expect(result.issues.filter((i) => i.code.startsWith('PUBLISHED_'))).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('已发布且存在带标记节点但清单为空或缺失 → 恰好一条 PUBLISHED_CATALOG_MISSING', () => {
    const fields = tree()
    markAllPublished(fields)
    const empty = validateSchema(schemaOf(fields, { published: true, publishedFields: [] }))
    expect(empty.valid).toBe(false)
    const missing = issuesOf(empty, 'PUBLISHED_CATALOG_MISSING')
    expect(missing).toHaveLength(1)
    expect(missing[0].path).toBe('formConfig.publishedFields')
    // 报一条汇总而非逐字段报：带标记节点有 3 个，不得放大成 3 条
    expect(issuesOf(empty, 'PUBLISHED_FIELD_MUTATED')).toEqual([])
    // 清单键完全缺失与空数组同等对待
    const absent = validateSchema(schemaOf(fields, { published: true }))
    expect(issuesOf(absent, 'PUBLISHED_CATALOG_MISSING')).toHaveLength(1)
  })

  it('已发布但清单为空且无任何带标记节点 → 合法（发布时无数据字段）', () => {
    // tree() 未经 markAllPublished，节点均不带标记
    const result = validateSchema(schemaOf(tree(), { published: true, publishedFields: [] }))
    expect(result.issues.filter((i) => i.code.startsWith('PUBLISHED_'))).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('未发布表单不受不变量约束（formConfig.published 非真时跳过判定）', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    ;(fields[0] as DataFieldNode).field = 'renamed'
    // 标记与清单不一致，但表单尚未发布：不变量不介入
    const result = validateSchema(schemaOf(fields, { publishedFields: catalog }))
    expect(result.issues.filter((i) => i.code.startsWith('PUBLISHED_'))).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('字段删除后经池拖回（沿用标识、保留标记、key 重新分配）不误报', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    removeNodeByKey(fields, 'a')
    const copy = clonePublishedEntry(catalog[0])
    // 身份锚是 field 而非设计器内部 key：key 变了但标识沿用，故不属于改穿
    expect(copy.key).not.toBe('a')
    expect(copy.field).toBe('name')
    expect(copy.published).toBe(true)
    fields.unshift(copy)
    const result = validateSchema(schemaOf(fields, { published: true, publishedFields: catalog }))
    expect(result.issues.filter((i) => i.code.startsWith('PUBLISHED_'))).toEqual([])
    expect(result.valid).toBe(true)
  })
})

describe('已发布清单不参与字段标识唯一性判定', () => {
  it('画布字段与清单中已不在画布的条目同名时不报 FIELD_ID_CONFLICT', () => {
    const fields = tree()
    const catalog = publishedCatalog(fields)
    // dept 出画布，其清单条目按规格仍保留（清单独立于画布存在）
    removeNodeByKey(fields, 'inner')
    // 画布另建一个同标识字段：与清单条目同名，但清单不属于字段树作用域
    fields.push({
      type: 'select',
      key: 'dept_new',
      field: 'dept',
      title: '部门',
      options: [],
      published: true,
    } as FieldNode)
    const result = validateSchema(schemaOf(fields, { published: true, publishedFields: catalog }))
    expect(issuesOf(result, 'FIELD_ID_CONFLICT')).toEqual([])
    expect(result.valid).toBe(true)
  })
})
