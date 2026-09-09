/**
 * 设计器子字段管理测试（task 6.5）：覆盖新增 / 复制 / 删除 / 拖拽排序四种操作的
 * schema 结果，并验证 FormDesigner 事件链（SubFormBody → FieldList → onAddSubField）
 * 将「添加子字段」写入 subFields 末尾。子字段新增标识在全表唯一（含跨子表单）。
 * 另覆盖三项设计器行为：发布与已发布字段的标识锁定（含再次发布升版）、子表单「已有字段」池
 * （删除入池 + 画布加回 + 冲突拦截）、保存与发布的字段标识重复前置校验。
 * 对应 specs/form-designer「子字段管理」「表单发布与字段标识锁定」「子表单已有字段回添」
 * 「保存与发布的前置校验」、design D6。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElDropdown, ElInputNumber, ElMessage, ElSwitch } from 'element-plus'
import FormDesigner from '@/designer/FormDesigner.vue'
import FieldList from '@/designer/FieldList.vue'
import SubFormBody from '@/designer/SubFormBody.vue'
import PropertyPanel from '@/designer/PropertyPanel.vue'
import { addSubField, copySubField, moveNode, removeNodeByKey } from '@/designer/schemaOps'
import { FORM_CONFIG_DEFAULTS } from '@/schema/defaults'
import {
  SCHEMA_VERSION,
  type FieldNode,
  type FormConfig,
  type FormSchema,
  type SubFormNode,
} from '@/schema/types'

/** 构造一个含单个子表单（1 个默认子字段）的字段树 */
function subFormTree(): FieldNode[] {
  return [
    { type: 'input', key: 'main', field: 'name', title: '主表姓名' },
    {
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '采购明细',
      subFields: [{ type: 'input', key: 'sf_name', field: 'item_name', title: '产品名称' }],
      props: { minRows: 1, maxRows: 200 },
    } as unknown as FieldNode,
  ]
}

function subFormOf(fields: FieldNode[]): SubFormNode {
  return fields.find((f) => f.type === 'subform') as unknown as SubFormNode
}

/** FieldList 的标签布局为必填 prop（组件不再持有兜底值），统一取契约层缺省值 */
const LABEL_PROPS = {
  labelPosition: FORM_CONFIG_DEFAULTS.labelPosition,
  labelWidth: FORM_CONFIG_DEFAULTS.labelWidth,
}

describe('子字段新增 (6.5)', () => {
  it('追加到 subFields 末尾并分配标识', () => {
    const fields = subFormTree()
    const node = addSubField(fields, 'sf', 'number')
    expect(node).not.toBeNull()
    const sf = subFormOf(fields)
    expect(sf.subFields).toHaveLength(2)
    expect(sf.subFields[1].type).toBe('number')
    expect(sf.subFields[1].key).toBe(node!.key)
    expect(typeof sf.subFields[1].field).toBe('string')
  })

  it('新增标识在全表唯一（含跨子表单与主表字段）', () => {
    const fields: FieldNode[] = [
      { type: 'input', key: 'm', field: 'input_1', title: '主表' },
      {
        type: 'subform',
        key: 'sfA',
        field: 'a',
        title: 'A',
        subFields: [{ type: 'input', key: 'a1', field: 'input_2', title: 'A1' }],
      } as unknown as FieldNode,
      {
        type: 'subform',
        key: 'sfB',
        field: 'b',
        title: 'B',
        subFields: [{ type: 'input', key: 'b1', field: 'input_3', title: 'B1' }],
      } as unknown as FieldNode,
    ]
    const node = addSubField(fields, 'sfB', 'input')!
    const allIds = ['input_1', 'input_2', 'input_3']
    expect(allIds).not.toContain(node.field)
    expect(node.field).toMatch(/^input_\d+$/)
  })

  it('拒绝非常用字段类型（不新增节点）', () => {
    const fields = subFormTree()
    expect(addSubField(fields, 'sf', 'divider')).toBeNull()
    expect(addSubField(fields, 'sf', 'subform')).toBeNull()
    expect(subFormOf(fields).subFields).toHaveLength(1)
  })

  it('目标非子表单时返回 null', () => {
    const fields = subFormTree()
    expect(addSubField(fields, 'main', 'number')).toBeNull()
  })
})

describe('子字段复制 (6.5)', () => {
  it('插入其后，属性相同但标识唯一', () => {
    const fields = subFormTree()
    const copy = copySubField(fields, 'sf', 'sf_name')
    expect(copy).not.toBeNull()
    const sf = subFormOf(fields)
    expect(sf.subFields).toHaveLength(2)
    expect(sf.subFields[1].key).toBe(copy!.key)
    // 属性继承
    expect(copy!.type).toBe('input')
    expect(copy!.title).toBe('产品名称')
    // 标识唯一
    expect(copy!.key).not.toBe('sf_name')
    expect(copy!.field).not.toBe('item_name')
  })

  it('定位失败时返回 null', () => {
    const fields = subFormTree()
    expect(copySubField(fields, 'sf', 'nope')).toBeNull()
    expect(copySubField(fields, 'main', 'sf_name')).toBeNull()
  })
})

describe('子字段删除 (6.5)', () => {
  it('从 subFields 移除，画布预览随之更新', () => {
    const fields = subFormTree()
    addSubField(fields, 'sf', 'number')
    expect(subFormOf(fields).subFields).toHaveLength(2)
    expect(removeNodeByKey(fields, 'sf_name')).toBe(true)
    const sf = subFormOf(fields)
    expect(sf.subFields).toHaveLength(1)
    expect(sf.subFields[0].type).toBe('number')
  })
})

describe('子字段排序即列顺序 (6.5)', () => {
  it('重排 subFields 后预览列顺序随之变化', () => {
    const fields = subFormTree()
    addSubField(fields, 'sf', 'number')
    const sf = subFormOf(fields)
    sf.subFields[1].title = '数量'
    // 将第二列拖到第一位
    moveNode(sf.subFields as unknown as FieldNode[], 1, 0)
    const wrapper = mount(FieldList, {
      props: { fields, selectedKey: '', ...LABEL_PROPS },
      global: { plugins: [ElementPlus] },
    })
    const titles = wrapper.findAll('.subform-col__title').map((t) => t.text())
    expect(titles).toEqual(['数量', '产品名称'])
  })
})

describe('FormDesigner 事件链集成 (6.5)', () => {
  function schemaWithSubForm(): FormSchema {
    return {
      id: 'd',
      name: '设计器子表单',
      version: SCHEMA_VERSION,
      fields: subFormTree(),
      formConfig: { labelPosition: 'right' },
    }
  }

  it('子表单内「添加子字段」写入 subFields 末尾并选中', async () => {
    const wrapper = mount(FormDesigner, {
      props: { modelValue: schemaWithSubForm() },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const body = wrapper.findComponent(SubFormBody)
    expect(body.exists()).toBe(true)
    body.vm.$emit('add', 'number')
    await flushPromises()
    const schema = (wrapper.vm as any).schema as FormSchema
    const sf = schema.fields.find((f) => f.type === 'subform') as unknown as SubFormNode
    expect(sf.subFields).toHaveLength(2)
    expect(sf.subFields[1].type).toBe('number')
    wrapper.unmount()
  })

  it('子表单内「复制子字段」插入其后且标识唯一', async () => {
    const wrapper = mount(FormDesigner, {
      props: { modelValue: schemaWithSubForm() },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const body = wrapper.findComponent(SubFormBody)
    body.vm.$emit('copy', 'sf_name')
    await flushPromises()
    const schema = (wrapper.vm as any).schema as FormSchema
    const sf = schema.fields.find((f) => f.type === 'subform') as unknown as SubFormNode
    expect(sf.subFields).toHaveLength(2)
    expect(sf.subFields[1].field).not.toBe(sf.subFields[0].field)
    expect(sf.subFields[1].key).not.toBe(sf.subFields[0].key)
    wrapper.unmount()
  })
})

describe('子字段属性编辑隔离 (6.6)', () => {
  it('选中子字段改标题只写回该子字段，不影响同标题主表字段', async () => {
    const schema: FormSchema = {
      id: 'd2',
      name: '隔离',
      version: SCHEMA_VERSION,
      fields: [
        { type: 'input', key: 'main', field: 'name', title: '名称' },
        {
          type: 'subform',
          key: 'sf',
          field: 'items',
          title: '明细',
          // 子字段与主表字段同标题「名称」，验证按 key 编辑隔离
          subFields: [{ type: 'input', key: 'sf_name', field: 'item_name', title: '名称' }],
          props: { minRows: 1, maxRows: 200 },
        } as unknown as FieldNode,
      ],
      formConfig: { labelPosition: 'right' },
    }
    const wrapper = mount(FormDesigner, {
      props: { modelValue: schema },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    // 选中子字段列
    await wrapper.find('.subform-col').trigger('click')
    await flushPromises()
    // 属性面板针对子字段发出 patch
    wrapper.findComponent(PropertyPanel).vm.$emit('patch', { title: '货品名称' })
    await flushPromises()
    const s = (wrapper.vm as any).schema as FormSchema
    const sf = s.fields.find((f) => f.type === 'subform') as unknown as SubFormNode
    expect(sf.subFields[0].title).toBe('货品名称')
    // 主表同标题字段未受影响
    expect((s.fields[0] as any).title).toBe('名称')
    wrapper.unmount()
  })
})

/** 构造一个含固定列 / 行操作配置的子表单节点 */
function subFormNodeWith(count: number, fixed: Record<string, unknown>): SubFormNode {
  const subFields = Array.from({ length: count }, (_, i) => ({
    type: 'input' as const,
    key: `s${i}`,
    field: `c${i}`,
    title: `列${i}`,
  }))
  return {
    type: 'subform',
    key: 'sf',
    field: 'items',
    title: '明细',
    subFields,
    props: { minRows: 1, maxRows: 200, ...fixed },
  } as unknown as SubFormNode
}

describe('子表单固定列属性面板钳制 (8.4)', () => {
  function mountPanel(node: SubFormNode) {
    return mount(PropertyPanel, {
      props: { node, dataFields: [node] },
      global: { plugins: [ElementPlus] },
    })
  }
  function numberInput(wrapper: ReturnType<typeof mountPanel>, label: string) {
    const item = wrapper.findAll('.el-form-item').find((it) => {
      const el = it.find('.el-form-item__label')
      return el.exists() && el.text().trim() === label
    })
    return item!.findComponent(ElInputNumber)
  }

  it('固定左列数超子字段数被钳制并提示', async () => {
    const wrapper = mountPanel(subFormNodeWith(2, {}))
    numberInput(wrapper, '固定左列数').vm.$emit('update:modelValue', 5)
    await flushPromises()
    const last = wrapper.emitted('patch')!.at(-1)![0] as { props: Record<string, unknown> }
    expect(last.props.fixedLeftColumns).toBe(2)
    expect(wrapper.find('.property-panel__warn').text()).toContain('合计不超过')
  })

  it('左已占满时固定右列数被钳制为 0', async () => {
    const wrapper = mountPanel(subFormNodeWith(2, { fixedLeftColumns: 2 }))
    numberInput(wrapper, '固定右列数').vm.$emit('update:modelValue', 2)
    await flushPromises()
    const last = wrapper.emitted('patch')!.at(-1)![0] as { props: Record<string, unknown> }
    expect(last.props.fixedRightColumns).toBe(0)
  })

  it('合法固定列数直接写入', async () => {
    const wrapper = mountPanel(subFormNodeWith(4, {}))
    numberInput(wrapper, '固定左列数').vm.$emit('update:modelValue', 1)
    await flushPromises()
    const last = wrapper.emitted('patch')!.at(-1)![0] as { props: Record<string, unknown> }
    expect(last.props.fixedLeftColumns).toBe(1)
    expect(wrapper.find('.property-panel__warn').exists()).toBe(false)
  })

  it('固定列说明点明首末列恒定冻结，配置项只管数据列', () => {
    const wrapper = mountPanel(subFormNodeWith(2, {}))
    const hint = wrapper
      .findAll('.property-panel__hint')
      .map((h) => h.text())
      .join(' ')
    expect(hint).toContain('首列（序号/勾选）与末列（操作）恒定冻结')
  })
})

describe('子表单画布预览固定列标记 (8.3/6.4)', () => {
  it('左/右固定列在列头显示对应标记，中间列无标记', () => {
    const wrapper = mount(SubFormBody, {
      props: { node: subFormNodeWith(3, { fixedLeftColumns: 1, fixedRightColumns: 1 }) },
      global: { plugins: [ElementPlus] },
    })
    const pins = wrapper.findAll('.subform-col').map((col) => {
      const pin = col.find('.subform-col__pin')
      return pin.exists() ? pin.text() : ''
    })
    expect(pins).toEqual(['左固定', '', '右固定'])
  })

  it('未配置固定列时无标记', () => {
    const wrapper = mount(SubFormBody, {
      props: { node: subFormNodeWith(3, {}) },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.findAll('.subform-col__pin').length).toBe(0)
  })
})

describe('子表单批量删除开关（行操作）', () => {
  function mountPanel(node: SubFormNode) {
    return mount(PropertyPanel, {
      props: { node, dataFields: [node] },
      global: { plugins: [ElementPlus] },
    })
  }
  /** 按 el-form-item 标签定位其内的开关 */
  function switchByLabel(wrapper: ReturnType<typeof mountPanel>, label: string) {
    const item = wrapper.findAll('.el-form-item').find((it) => {
      const el = it.find('.el-form-item__label')
      return el.exists() && el.text().trim() === label
    })
    return item!.findComponent(ElSwitch)
  }

  it('子表单属性面板提供行操作区，批量删除缺省关闭', () => {
    const wrapper = mountPanel(subFormNodeWith(2, {}))
    expect(wrapper.text()).toContain('行操作')
    expect(switchByLabel(wrapper, '允许批量删除').props('modelValue')).toBe(false)
  })

  it('开启时写回 props.allowBatchRemove = true 并保留其余子表单配置', async () => {
    const wrapper = mountPanel(subFormNodeWith(2, {}))
    switchByLabel(wrapper, '允许批量删除').vm.$emit('update:modelValue', true)
    await flushPromises()
    const last = wrapper.emitted('patch')!.at(-1)![0] as { props: Record<string, unknown> }
    expect(last.props.allowBatchRemove).toBe(true)
    expect(last.props.minRows).toBe(1)
    expect(last.props.maxRows).toBe(200)
  })

  it('已开启时关闭写回 false', async () => {
    const wrapper = mountPanel(subFormNodeWith(2, { allowBatchRemove: true }))
    const sw = switchByLabel(wrapper, '允许批量删除')
    expect(sw.props('modelValue')).toBe(true)
    sw.vm.$emit('update:modelValue', false)
    await flushPromises()
    const last = wrapper.emitted('patch')!.at(-1)![0] as { props: Record<string, unknown> }
    expect(last.props.allowBatchRemove).toBe(false)
  })
})

describe('子表单画布列头展示字段名', () => {
  it('列头在标签名后带出字段名', () => {
    const wrapper = mount(SubFormBody, {
      props: { node: subFormNodeWith(2, {}) },
      global: { plugins: [ElementPlus] },
    })
    const cols = wrapper.findAll('.subform-col')
    expect(cols.map((c) => c.find('.subform-col__title').text())).toEqual(['列0', '列1'])
    expect(cols.map((c) => c.find('.subform-col__code').text())).toEqual(['c0', 'c1'])
  })

  it('子字段无标识时不渲染字段名占位', () => {
    const node = subFormNodeWith(1, {})
    ;(node.subFields[0] as { field?: string }).field = undefined
    const wrapper = mount(SubFormBody, {
      props: { node },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find('.subform-col__code').exists()).toBe(false)
  })
})

/* ------------- 发布与已发布字段的标识锁定 ------------- */

/** 按文案定位设计器工具栏按钮 */
function toolbarBtn(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('.form-designer__toolbar button').find((b) => b.text() === text)
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('设计器发布与字段标识锁定', () => {
  /** 可发布的字段树：主表字段 + 子表单（含 1 个子字段） */
  function publishableTree(): FieldNode[] {
    return [
      { type: 'input', key: 'a', field: 'name', title: '姓名' },
      {
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '明细',
        subFields: [{ type: 'input', key: 's1', field: 'item_name', title: '产品名称' }],
      },
    ] as unknown as FieldNode[]
  }

  function mountDesigner(fields: FieldNode[], formConfig: FormConfig = {}) {
    return mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'pub',
          name: '发布用例',
          version: SCHEMA_VERSION,
          fields,
          formConfig,
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus] },
    })
  }

  /** 挂载属性面板并取「字段标识」输入框（标识锁定与 dataFields 无关，给空列表即可） */
  function mountFieldId(node: FieldNode) {
    const wrapper = mount(PropertyPanel, {
      props: { node, dataFields: [] },
      global: { plugins: [ElementPlus] },
    })
    const item = wrapper.findAll('.el-form-item').find((it) => {
      const el = it.find('.el-form-item__label')
      return el.exists() && el.text().trim() === '字段标识'
    })!
    return { wrapper, input: item.find('input') }
  }

  it('未发布时工具栏只提供「发布」，不展示发布版本标记', () => {
    const wrapper = mountDesigner(publishableTree())
    expect(toolbarBtn(wrapper, '发布')?.exists()).toBe(true)
    expect(toolbarBtn(wrapper, '取消发布')).toBeUndefined()
    expect(wrapper.find('.form-designer__toolbar .el-tag').exists()).toBe(false)
    wrapper.unmount()
  })

  it('点「发布」后全部字段（含子字段）打标记并记录发布状态、版本与时间', async () => {
    const fields = publishableTree()
    const wrapper = mountDesigner(fields)
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const s = (wrapper.vm as any).schema as FormSchema
    expect(s.formConfig?.published).toBe(true)
    expect(s.formConfig?.publishedVersion).toBe(1)
    expect(typeof s.formConfig?.publishedAt).toBe('string')
    expect(fields.every((n) => n.published === true)).toBe(true)
    expect((fields[1] as unknown as SubFormNode).subFields[0].published).toBe(true)
    wrapper.unmount()
  })

  it('已发布后不设「取消发布」，「发布」按钮常驻并展示版本标记', async () => {
    const wrapper = mountDesigner(publishableTree())
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    expect(toolbarBtn(wrapper, '发布')?.exists()).toBe(true)
    expect(toolbarBtn(wrapper, '取消发布')).toBeUndefined()
    expect(wrapper.find('.form-designer__toolbar .el-tag').text()).toBe('已发布 v1')
    wrapper.unmount()
  })

  it('新增字段后可再次发布：版本递增且新字段标识一并锁定', async () => {
    const fields = publishableTree()
    const wrapper = mountDesigner(fields)
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const firstPublishedAt = (wrapper.vm as any).schema.formConfig.publishedAt as string
    // 首次发布后新增的字段不带标记，再次发布时一并锁定
    fields.push({ type: 'input', key: 'b', field: 'age', title: '年龄' } as FieldNode)
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const s = (wrapper.vm as any).schema as FormSchema
    expect(s.formConfig?.publishedVersion).toBe(2)
    expect(wrapper.find('.form-designer__toolbar .el-tag').text()).toBe('已发布 v2')
    expect(fields.every((n) => n.published === true)).toBe(true)
    // 刷新为最近一次发布时间
    const republishedAt = s.formConfig?.publishedAt ?? ''
    expect(republishedAt >= firstPublishedAt).toBe(true)
    wrapper.unmount()
  })

  it('已发布字段的「字段标识」被禁用并给出解锁说明', () => {
    const { wrapper, input } = mountFieldId({
      type: 'input',
      key: 'a',
      field: 'name',
      title: '姓名',
      published: true,
    } as FieldNode)
    expect(input.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.property-panel__hint--tight').text()).toContain(
      '已发布，字段标识不可修改',
    )
  })

  it('已发布子表单自身的标识同样锁定（仅锁标识，不锁其余属性）', () => {
    const node = {
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '明细',
      subFields: [],
      published: true,
    } as unknown as FieldNode
    const { wrapper, input } = mountFieldId(node)
    expect(input.attributes('disabled')).toBeDefined()
    // 标题仍可改：发布只锁字段标识
    const titleInput = wrapper
      .findAll('.el-form-item')
      .find((it) => it.find('.el-form-item__label').text().trim() === '标题')!
      .find('input')
    expect(titleInput.attributes('disabled')).toBeUndefined()
  })

  it('未发布字段的「字段标识」可编辑且无锁定说明', () => {
    const { wrapper, input } = mountFieldId({
      type: 'input',
      key: 'a',
      field: 'name',
      title: '姓名',
    } as FieldNode)
    expect(input.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.property-panel__hint--tight').exists()).toBe(false)
  })

  it('已发布子字段在画布列头展示锁标记，未发布列无标记', () => {
    const node = subFormNodeWith(2, {})
    node.subFields[0].published = true
    const wrapper = mount(SubFormBody, {
      props: { node },
      global: { plugins: [ElementPlus] },
    })
    const locks = wrapper.findAll('.subform-col').map((c) => c.find('.subform-col__lock').exists())
    expect(locks).toEqual([true, false])
  })
})

/* ------------- 子表单「已有字段」池：画布入口与加回链路 ------------- */

describe('子表单「已有字段」池', () => {
  /** 底部工具区的「已有字段」按钮 */
  const pooledBtn = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('.subform-body__footer button').find((b) => b.text().includes('已有字段'))!

  it('池为空时按钮禁用且不计数，有条目时启用并展示计数', () => {
    const empty = mount(SubFormBody, {
      props: { node: subFormNodeWith(2, {}) },
      global: { plugins: [ElementPlus] },
    })
    expect(pooledBtn(empty).text()).toBe('已有字段')
    expect(pooledBtn(empty).attributes('disabled')).toBeDefined()

    const node = subFormNodeWith(2, {})
    node.fieldPool = [{ type: 'number', key: 'p1', field: 'qty', title: '数量' }]
    const filled = mount(SubFormBody, {
      props: { node },
      global: { plugins: [ElementPlus] },
    })
    expect(pooledBtn(filled).text()).toBe('已有字段（1）')
    expect(pooledBtn(filled).attributes('disabled')).toBeUndefined()
  })

  it('从「已有字段」下拉选中条目冒泡 restore 并携带池内 key', async () => {
    const node = subFormNodeWith(1, {})
    node.fieldPool = [{ type: 'number', key: 'p1', field: 'qty', title: '数量' }]
    const wrapper = mount(SubFormBody, {
      props: { node },
      global: { plugins: [ElementPlus] },
    })
    // 底部两个下拉：[0] 添加子字段、[1] 已有字段
    wrapper.findAllComponents(ElDropdown)[1].vm.$emit('command', 'p1')
    await flushPromises()
    expect(wrapper.emitted('restore')).toEqual([['p1']])
  })

  it('属性面板列出已有字段清单（标题 + 字段名），无池时不展示该区', () => {
    const withPool = subFormNodeWith(1, {})
    withPool.fieldPool = [{ type: 'number', key: 'p1', field: 'qty', title: '数量' }]
    const wrapper = mount(PropertyPanel, {
      props: { node: withPool, dataFields: [withPool] },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.text()).toContain('已有字段（1）')
    expect(wrapper.text()).toContain('qty')

    const bare = subFormNodeWith(1, {})
    const bareWrapper = mount(PropertyPanel, {
      props: { node: bare, dataFields: [bare] },
      global: { plugins: [ElementPlus] },
    })
    expect(bareWrapper.text()).not.toContain('已有字段')
  })

  /** 带子表单（子字段 field = qty）的 schema，供设计器集成用例使用 */
  function schemaWithSubField(pool: FieldNode[] = []): FormSchema {
    return {
      id: 'pool',
      name: '已有字段',
      version: SCHEMA_VERSION,
      fields: [
        {
          type: 'subform',
          key: 'sf',
          field: 'items',
          title: '明细',
          subFields: [{ type: 'number', key: 's1', field: 'qty', title: '数量' }],
          ...(pool.length ? { fieldPool: pool } : {}),
        } as unknown as FieldNode,
      ],
      formConfig: { labelPosition: 'right' },
    }
  }

  function mountPoolDesigner(schema: FormSchema) {
    return mount(FormDesigner, {
      props: { modelValue: schema },
      global: { plugins: [ElementPlus] },
    })
  }

  it('删除子字段后留存进池，画布计数随之出现', async () => {
    const wrapper = mountPoolDesigner(schemaWithSubField())
    await flushPromises()
    wrapper.findComponent(SubFormBody).vm.$emit('remove', 's1')
    await flushPromises()
    const sf = ((wrapper.vm as any).schema as FormSchema).fields[0] as unknown as SubFormNode
    expect(sf.subFields).toHaveLength(0)
    // 完整定义被留存（不只是标识），以便原样加回
    expect(sf.fieldPool![0]).toMatchObject({ key: 's1', field: 'qty', title: '数量' })
    expect(wrapper.text()).toContain('已有字段（1）')
    wrapper.unmount()
  })

  it('从池加回沿用原字段标识并落到明细末尾，池随之清空', async () => {
    const wrapper = mountPoolDesigner(
      schemaWithSubField([{ type: 'input', key: 'p1', field: 'remark', title: '备注' }]),
    )
    await flushPromises()
    wrapper.findComponent(SubFormBody).vm.$emit('restore', 'p1')
    await flushPromises()
    const sf = ((wrapper.vm as any).schema as FormSchema).fields[0] as unknown as SubFormNode
    expect(sf.subFields.map((f) => f.field)).toEqual(['qty', 'remark'])
    expect(sf.subFields[1].key).toBe('p1')
    expect(sf.fieldPool).toHaveLength(0)
    wrapper.unmount()
  })

  it('加回时与该子表单内现有字段标识冲突则拦截，池内条目保留', async () => {
    const warnSpy = vi.spyOn(ElMessage, 'warning')
    const wrapper = mountPoolDesigner(
      schemaWithSubField([{ type: 'number', key: 'p1', field: 'qty', title: '旧数量' }]),
    )
    await flushPromises()
    wrapper.findComponent(SubFormBody).vm.$emit('restore', 'p1')
    await flushPromises()
    const sf = ((wrapper.vm as any).schema as FormSchema).fields[0] as unknown as SubFormNode
    expect(sf.subFields).toHaveLength(1)
    expect(sf.fieldPool).toHaveLength(1)
    // 冲突域为「当前子表单内」，提示文案与之对齐
    expect(String(warnSpy.mock.calls.at(-1)![0])).toContain('已被该子表单内的其他字段占用')
    wrapper.unmount()
  })
})

/* ------------- 保存与发布的前置校验（字段标识不可重复） ------------- */

describe('保存与发布的字段标识重复前置校验', () => {
  function mountDesigner(fields: FieldNode[], id = 'dup') {
    return mount(FormDesigner, {
      props: {
        modelValue: {
          id,
          name: '前置校验',
          version: SCHEMA_VERSION,
          fields,
          formConfig: {},
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus] },
    })
  }

  /** 子表单节点（子字段标识由入参给出） */
  function subForm(key: string, subFieldIds: string[]): FieldNode {
    return {
      type: 'subform',
      key,
      field: `f_${key}`,
      title: '明细',
      subFields: subFieldIds.map((id, i) => ({
        type: 'input',
        key: `${key}_${i}`,
        field: id,
        title: `列${i}`,
      })),
    } as unknown as FieldNode
  }

  it('主表字段标识重复时保存被拦截（不写本地存储）并提示', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error')
    const wrapper = mountDesigner([
      { type: 'input', key: 'a', field: 'name', title: 'A' },
      { type: 'input', key: 'b', field: 'name', title: 'B' },
    ] as unknown as FieldNode[])
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    expect(localStorage.getItem('form-engine:schema:dup')).toBeNull()
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('字段标识重复，无法保存')
    wrapper.unmount()
  })

  it('标识重复时发布被拦截：不打字段标记也不置表单发布态', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error')
    const fields = [
      { type: 'input', key: 'a', field: 'name', title: 'A' },
      { type: 'input', key: 'b', field: 'name', title: 'B' },
    ] as unknown as FieldNode[]
    const wrapper = mountDesigner(fields)
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const s = (wrapper.vm as any).schema as FormSchema
    expect(s.formConfig?.published).toBeUndefined()
    expect(s.formConfig?.publishedAt).toBeUndefined()
    expect(fields.every((n) => n.published === undefined)).toBe(true)
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('字段标识重复，无法发布')
    wrapper.unmount()
  })

  it('同一子表单内子字段标识重复同样拦截保存', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error')
    const wrapper = mountDesigner([subForm('sf', ['qty', 'qty'])])
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    expect(localStorage.getItem('form-engine:schema:dup')).toBeNull()
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('字段标识重复，无法保存')
    wrapper.unmount()
  })

  it('子字段与主表或其他子表单同名不构成重复，保存与发布均放行', async () => {
    const fields = [
      { type: 'input', key: 'm', field: 'name', title: '主表' },
      subForm('sfA', ['name']),
      subForm('sfB', ['name']),
    ] as FieldNode[]
    const wrapper = mountDesigner(fields, 'ok')
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    expect(localStorage.getItem('form-engine:schema:ok')).not.toBeNull()
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const s = (wrapper.vm as any).schema as FormSchema
    expect(s.formConfig?.published).toBe(true)
    expect(fields.every((n) => n.published === true)).toBe(true)
    wrapper.unmount()
  })
})
