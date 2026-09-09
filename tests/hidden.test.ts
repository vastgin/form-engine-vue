import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import formCreate from '@form-create/element-ui'
import PropertyPanel from '@/designer/PropertyPanel.vue'
import FieldList from '@/designer/FieldList.vue'
import FormRenderer from '@/renderer/FormRenderer.vue'
import EngineSubForm from '@/renderer/components/EngineSubForm.vue'
import { stripEmptyRows, validateSubForm } from '@/renderer/subformValidation'
import { registerEngineComponents } from '@/renderer/components'
import { schemaToRules } from '@/adapter/toRule'
import { exportSchema, importSchema } from '@/designer/schemaIO'
import { validateSchema } from '@/schema/validate'
import { FORM_CONFIG_DEFAULTS } from '@/schema/defaults'
import {
  SCHEMA_VERSION,
  type DataFieldNode,
  type FieldNode,
  type FormSchema,
  type SubFormNode,
} from '@/schema/types'

registerEngineComponents()

/**
 * 字段静态隐藏能力（节点 `hidden`）：
 * - 契约层：`hidden` 缺省按不隐藏处理，布局字段无此属性；
 * - 映射层：hidden -> rule.hidden（收起控件但**不丢数据**，不用 `ignore`），并跳过校验规则生成；
 * - 渲染层：与条件显隐互不串台 —— 静态隐藏不进剔除名单、不被规则解封、隐藏子表单与隐藏子字段列不参与校验；
 * - 子表单：隐藏的子字段不呈现该列（固定列按可见列钳制），但已注入值仍随行数据输出；
 * - 设计层：属性面板隐藏开关 + 冲突说明，画布「隐藏」标记与弱化呈现。
 * 对应 specs/form-schema「字段隐藏」、form-renderer「字段静态隐藏」、form-designer「字段属性配置」。
 */

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms))

function schemaWith(fields: FieldNode[]): FormSchema {
  return { id: 'hd', name: '隐藏能力', version: SCHEMA_VERSION, fields }
}

function dataNode(partial: Partial<DataFieldNode>): DataFieldNode {
  return { type: 'input', key: 'k', field: 'f', title: 'T', ...partial } as DataFieldNode
}

/** 取指定 field 的 rule（含标签页内嵌套展开后的全部 rule） */
function ruleOf(rules: Record<string, any>[], field: string): Record<string, any> | undefined {
  return rules.find((r) => r.field === field)
}

/* ------------------------------- 映射层 ------------------------------- */

describe('hidden 到 form-create rule 的映射', () => {
  it('隐藏字段生成 rule.hidden，且隐藏优先——不产出任何校验规则', () => {
    const rules = schemaToRules(
      schemaWith([
        dataNode({
          field: 'sys_amount',
          required: true,
          hidden: true,
          validate: [{ type: 'max', value: 10 }],
        }),
      ]),
    )
    expect(ruleOf(rules, 'sys_amount')!.hidden).toBe(true)
    expect(ruleOf(rules, 'sys_amount')!.validate).toBeUndefined()
  })

  it('未标隐藏的字段不带 hidden 属性且保留校验规则（对照组）', () => {
    const rules = schemaToRules(
      schemaWith([
        dataNode({ field: 'amount', required: true, validate: [{ type: 'max', value: 10 }] }),
      ]),
    )
    expect(ruleOf(rules, 'amount')!.hidden).toBeUndefined()
    expect(ruleOf(rules, 'amount')!.validate).toBeTruthy()
    expect(ruleOf(rules, 'amount')!.validate.some((r: any) => r.required)).toBe(true)
  })

  it('hidden 为 false 等价于缺省（不写入 rule，避免语义歧义）', () => {
    const rules = schemaToRules(
      schemaWith([dataNode({ field: 'a', hidden: false, required: true })]),
    )
    expect('hidden' in ruleOf(rules, 'a')!).toBe(false)
    expect(ruleOf(rules, 'a')!.validate).toBeTruthy()
  })

  it('隐藏字段的默认值仍随 rule.value 输出（隐藏用于承载系统参数类默认值）', () => {
    const rules = schemaToRules(
      schemaWith([dataNode({ field: 'source', hidden: true, value: 'web' })]),
    )
    expect(ruleOf(rules, 'source')).toMatchObject({ hidden: true, value: 'web' })
  })

  it('标签页内字段隐藏同样生效', () => {
    const rules = schemaToRules(
      schemaWith([
        {
          type: 'tabs',
          key: 'tb',
          tabs: [
            {
              key: 'tb1',
              title: '页1',
              fields: [dataNode({ key: 'i', field: 'inner', required: true, hidden: true })],
            },
          ],
        },
      ]),
    )
    const inner = ruleOf(rules[0].children[0].children, 'inner')
    expect(inner!.hidden).toBe(true)
    expect(inner!.validate).toBeUndefined()
  })

  it('子表单整体隐藏：rule.hidden 且必填标记失效', () => {
    const build = (hidden?: boolean) =>
      schemaToRules(
        schemaWith([
          {
            type: 'subform',
            key: 'sf',
            field: 'items',
            title: '明细',
            required: true,
            hidden,
            subFields: [dataNode({ key: 's1', field: 'name', title: '名称', required: true })],
            props: { minRows: 0, maxRows: 200 },
          } as SubFormNode,
        ]),
      )
    expect(build(true)[0]).toMatchObject({ hidden: true, props: { required: false } })
    expect(build(undefined)[0].hidden).toBeUndefined()
    expect(build(true)[0].props.required).toBe(false)
  })
})

/* ------------------------------- 渲染层 ------------------------------- */

function mountRenderer(schema: FormSchema, props: Record<string, unknown> = {}) {
  return mount(FormRenderer, {
    props: { schema, ...props },
    global: { plugins: [ElementPlus, formCreate] },
    attachTo: document.body,
  })
}

/** 说明类字段（占位标题）+ 隐藏的默认值字段 + 被条件显隐控制的对照字段 */
function hiddenSchema(): FormSchema {
  return schemaWith([
    dataNode({ key: 'a', field: 'sys_source', title: '来源', hidden: true, value: 'web' }),
    dataNode({ key: 'b', field: 'name', title: '姓名' }),
    {
      type: 'input',
      key: 'c',
      field: 'remark',
      title: '备注',
      value: 'r',
      visibleRule: {
        logic: 'and',
        action: 'show',
        conditions: [{ field: 'name', operator: 'eq', value: '其他' }],
      },
    } as DataFieldNode,
  ])
}

describe('渲染器的静态隐藏行为', () => {
  it('隐藏字段不渲染控件，但其值仍在输出数据中（与条件显隐剔除值相反）', async () => {
    const wrapper = mountRenderer(hiddenSchema())
    await flushPromises()
    await wait()

    expect(wrapper.text()).not.toContain('来源')
    expect(wrapper.text()).toContain('姓名')

    const data = (wrapper.vm as any).getData()
    expect(data.sys_source).toBe('web')
    // 对照：被条件显隐隐藏的字段值会被剔除
    expect('remark' in data).toBe(false)
    wrapper.unmount()
  })

  it('静态隐藏优先于显隐规则：条件命中也不解封，且值不被剔除', async () => {
    const schema = schemaWith([
      dataNode({
        key: 'a',
        field: 'sys_source',
        title: '来源',
        hidden: true,
        value: 'web',
        visibleRule: {
          logic: 'and',
          action: 'show',
          conditions: [{ field: 'name', operator: 'eq', value: '其他' }],
        },
      }),
      dataNode({ key: 'b', field: 'name', title: '姓名' }),
    ])
    const wrapper = mountRenderer(schema)
    await flushPromises()
    await wait()

    ;(wrapper.vm as any).setData({ name: '其他' })
    await flushPromises()
    await wait(50)

    expect(wrapper.text()).not.toContain('来源')
    expect((wrapper.vm as any).getData().sys_source).toBe('web')
    wrapper.unmount()
  })

  it('隐藏字段跳过必填：隐藏 + required 不阻止提交（否则无法填写将永远提交不了）', async () => {
    const wrapper = mountRenderer(
      schemaWith([
        dataNode({ key: 'a', field: 'sys_source', title: '来源', hidden: true, required: true }),
      ]),
    )
    await flushPromises()
    await wait()
    const api = (wrapper.vm as any).getApi()
    // 桩化底层校验：规则是否生成由 rule.validate 决定，故此处断言映射层已跳过即可
    api.validate = (cb: any) => cb(true)
    await (wrapper.vm as any).submit()
    await flushPromises()
    expect(wrapper.emitted('submit')).toBeTruthy()
    wrapper.unmount()
  })

  it('隐藏的子表单不参与行校验；未隐藏的必填子表单空数据会被拦下', async () => {
    const build = (hidden?: boolean) =>
      schemaWith([
        {
          type: 'subform',
          key: 'sf',
          field: 'items',
          title: '采购明细',
          required: true,
          hidden,
          subFields: [dataNode({ key: 's1', field: 'name', title: '产品名称', required: true })],
          props: { minRows: 0, maxRows: 200 },
        } as SubFormNode,
      ])

    const shown = mountRenderer(build(undefined))
    await flushPromises()
    await wait()
    expect(await (shown.vm as any).validate()).toBe(false)
    shown.unmount()

    const hiddened = mountRenderer(build(true))
    await flushPromises()
    await wait()
    expect(await (hiddened.vm as any).validate()).toBe(true)
    hiddened.unmount()
  })
})

/* ------------------------------ 设计器面板 ------------------------------ */

/** 挂载属性面板（默认单行文本字段） */
function mountPanel(node: FieldNode) {
  return mount(PropertyPanel, {
    props: { node, dataFields: [] },
    global: { plugins: [ElementPlus] },
  })
}

/** 按 label 文案取属性面板中的勾选框 */
function checkboxOf(wrapper: ReturnType<typeof mountPanel>, label: string) {
  return wrapper.findAll('.el-checkbox').find((c) => c.text() === label)
}

describe('属性面板的隐藏开关', () => {
  it('与必填/只读并排提供「隐藏」勾选，并在悬停说明中讲清值仍提交', () => {
    const wrapper = mountPanel(dataNode({ field: 'a', title: 'A' }))
    expect(checkboxOf(wrapper, '必填')).toBeTruthy()
    expect(checkboxOf(wrapper, '只读')).toBeTruthy()
    const hidden = checkboxOf(wrapper, '隐藏')!
    expect(hidden.find('input').element.checked).toBe(false)
    expect(hidden.attributes('title')).toContain('其值仍随表单提交')
  })

  it('勾选隐藏即 patch({ hidden: true })，取消勾选写回 false', async () => {
    const wrapper = mountPanel(dataNode({ field: 'a', title: 'A' }))
    await checkboxOf(wrapper, '隐藏')!.find('input').setValue(true)
    expect(wrapper.emitted('patch')!.at(-1)).toEqual([{ hidden: true }])

    const wrapper2 = mountPanel(dataNode({ field: 'a', title: 'A', hidden: true }))
    await checkboxOf(wrapper2, '隐藏')!.find('input').setValue(false)
    expect(wrapper2.emitted('patch')!.at(-1)).toEqual([{ hidden: false }])
  })

  it('已隐藏时给出说明：值仍随表单提交', () => {
    const wrapper = mountPanel(dataNode({ field: 'a', title: 'A', hidden: true }))
    const hint = wrapper.find('.property-panel__hint--tight')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('其值仍随表单提交')
    expect(wrapper.find('.property-panel__warn').exists()).toBe(false)
  })

  it('隐藏与必填同时开启时以警示提示「必填与校验规则不生效」（不拦截配置）', () => {
    const wrapper = mountPanel(dataNode({ field: 'a', title: 'A', hidden: true, required: true }))
    const warn = wrapper.find('.property-panel__warn')
    expect(warn.exists()).toBe(true)
    expect(warn.text()).toContain('必填与校验规则对隐藏字段不生效')
    // 冲突提示下不再重复出普通说明
    expect(wrapper.find('.property-panel__hint--tight').exists()).toBe(false)
  })

  it('未隐藏时不出现任何隐藏说明，避免占用面板空间', () => {
    const wrapper = mountPanel(dataNode({ field: 'a', title: 'A', required: true }))
    expect(wrapper.text()).not.toContain('字段已隐藏')
  })

  it('子表单同样可配隐藏；布局字段不提供该开关', () => {
    const sub = mountPanel({
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '明细',
      subFields: [],
      props: {},
    } as SubFormNode)
    expect(checkboxOf(sub, '隐藏')).toBeTruthy()

    const divider = mountPanel({ type: 'divider', key: 'd', title: '分隔' } as unknown as FieldNode)
    expect(checkboxOf(divider, '隐藏')).toBeUndefined()
  })
})

/* ------------------------------- 画布 ------------------------------- */

/** FieldList 的标签布局为必填 prop（组件不再持有兜底值），统一取契约层缺省值 */
const LABEL_PROPS = {
  labelPosition: FORM_CONFIG_DEFAULTS.labelPosition,
  labelWidth: FORM_CONFIG_DEFAULTS.labelWidth,
}

function mountList(fields: FieldNode[]) {
  return mount(FieldList, { props: { fields, ...LABEL_PROPS }, global: { plugins: [ElementPlus] } })
}

describe('画布的隐藏标记与弱化', () => {
  it('隐藏字段卡片带「隐藏」标记与弱化类名，仍可点选编辑', () => {
    const wrapper = mountList([
      dataNode({ key: 'a', field: 'sys_source', title: '来源', hidden: true }),
    ])
    const card = wrapper.find('.field-card')
    expect(card.classes()).toContain('is-hidden')
    expect(card.text()).toContain('隐藏')
    expect(card.attributes('data-field-key')).toBe('a')
  })

  it('未隐藏的字段卡片无隐藏标记', () => {
    const wrapper = mountList([dataNode({ key: 'a', field: 'a', title: 'A' })])
    const card = wrapper.find('.field-card')
    expect(card.classes()).not.toContain('is-hidden')
    expect(card.text()).not.toContain('隐藏')
  })

  it('显隐与隐藏标记互不混淆（各自独立呈现）', () => {
    const wrapper = mountList([
      {
        type: 'input',
        key: 'a',
        field: 'a',
        title: 'A',
        visibleRule: {
          logic: 'and',
          action: 'hide',
          conditions: [{ field: 'b', operator: 'eq', value: '1' }],
        },
      } as DataFieldNode,
    ])
    const card = wrapper.find('.field-card')
    expect(card.text()).toContain('显隐')
    expect(card.classes()).not.toContain('is-hidden')
  })

  it('子表单整体隐藏也带标记；布局字段永不标记', () => {
    const wrapper = mountList([
      {
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '明细',
        hidden: true,
        subFields: [],
        props: {},
      } as SubFormNode,
      { type: 'divider', key: 'd', title: '分隔' } as unknown as FieldNode,
    ])
    const cards = wrapper.findAll('.field-card')
    expect(cards[0].classes()).toContain('is-hidden')
    expect(cards[1].classes()).not.toContain('is-hidden')
  })
})

/* --------------------------- 子表单子字段的列隐藏 --------------------------- */

/** 子字段：单行文本 */
const subName = (extra: Partial<DataFieldNode> = {}) =>
  dataNode({ key: 's1', field: 'name', title: '产品名称', ...extra })
/** 隐藏子字段：内部编码列 */
const subCode = (extra: Partial<DataFieldNode> = {}) =>
  dataNode({ key: 's2', field: 'code', title: '内部编码', hidden: true, ...extra })

function mountSubFormTable(props: Record<string, unknown>) {
  return mount(EngineSubForm, {
    props,
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

describe('子表单子字段的列隐藏', () => {
  it('隐藏的子字段不呈现该列，其余列照常可录入', async () => {
    const wrapper = mountSubFormTable({
      title: '采购明细',
      subFields: [subName(), subCode()],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    const header = wrapper.find('.el-table__header-wrapper')
    expect(header.text()).toContain('产品名称')
    expect(header.text()).not.toContain('内部编码')
    wrapper.unmount()
  })

  it('隐藏列不占列位也不参与固定列钳制', async () => {
    const wrapper = mountSubFormTable({
      subFields: [subCode(), subName()],
      modelValue: [],
      fixedLeftColumns: 1,
      minRows: 1,
    })
    await flushPromises()
    await wait()
    // 可见列仅「产品名称」一列：首列即左固定，不应因隐藏列存在而错位
    expect(wrapper.findAll('.el-table__header-wrapper th').length).toBeGreaterThan(1)
    expect(wrapper.find('.el-table__header-wrapper').text()).toContain('产品名称')
    wrapper.unmount()
  })

  it('隐藏列的已注入值仍随行数据对外输出（不呈现不等于不提交）', async () => {
    const wrapper = mountSubFormTable({
      subFields: [subName(), subCode()],
      modelValue: [{ name: 'A', code: 'X-1' }],
    })
    await flushPromises()
    await wait()
    await wrapper.find('.engine-subform__footer .el-button').trigger('click')
    await flushPromises()
    const rows = wrapper.emitted('update:modelValue')!.at(-1)![0] as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'A', code: 'X-1' })
    wrapper.unmount()
  })

  it('子字段全部隐藏时给出专门空态', async () => {
    const wrapper = mountSubFormTable({ subFields: [subCode()], modelValue: [] })
    await flushPromises()
    await wait()
    expect(wrapper.find('.el-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('子字段已全部隐藏')
    expect(wrapper.find('.el-table').exists()).toBe(false)
    wrapper.unmount()
  })

  it('隐藏子字段跳过逐行规则校验，可见子字段仍校验（隐藏优先）', async () => {
    const node = (code: SubFormNode['subFields'][number]) =>
      ({
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '明细',
        subFields: [subName({ required: true }), code],
      }) as SubFormNode
    // 行内 name 已填：必填且隐藏的 code 不报错
    const errors = await validateSubForm(node(subCode({ required: true })), [
      { name: 'A', code: '' },
    ])
    expect(errors).toHaveLength(0)
    // 对照组：不隐藏的 code 携非法值仍被拦下
    const withVisible = await validateSubForm(
      node(dataNode({ key: 's2', field: 'code', title: '编码', required: true })),
      [{ name: 'A', code: '' }],
    )
    expect(withVisible.map((e) => e.fieldKey)).toEqual(['code'])
  })

  it('行数据输出仍含隐藏列的键（stripEmptyRows 按全部子字段收敛）', () => {
    const out = stripEmptyRows(
      [
        { name: 'A', code: 'X-1' },
        { name: '', code: 'X-2' },
        { name: '', code: '' },
      ],
      [subName(), subCode()],
    )
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({ name: '', code: 'X-2' })
  })

  it('渲染器端到端：隐藏子字段不阻提交且其值仍在输出行中', async () => {
    const build = (hidden: boolean) =>
      schemaWith([
        {
          type: 'subform',
          key: 'sf',
          field: 'items',
          title: '明细',
          required: true,
          subFields: [
            subName({ required: true }),
            dataNode({ key: 's2', field: 'code', title: '编码', required: true, hidden }),
          ],
          props: { minRows: 0, maxRows: 200 },
        } as SubFormNode,
      ])

    const hiddened = mountRenderer(build(true))
    await flushPromises()
    await wait()
    ;(hiddened.vm as any).setData({ items: [{ name: 'A', code: 'X-1' }] })
    await flushPromises()
    await wait()
    expect(await (hiddened.vm as any).validate()).toBe(true)
    expect((hiddened.vm as any).getData().items).toEqual([{ name: 'A', code: 'X-1' }])
    hiddened.unmount()

    // 对照：同一子字段不隐藏时，其必填未填会拦下提交
    const shown = mountRenderer(build(false))
    await flushPromises()
    await wait()
    ;(shown.vm as any).setData({ items: [{ name: 'A', code: '' }] })
    await flushPromises()
    await wait()
    expect(await (shown.vm as any).validate()).toBe(false)
    shown.unmount()
  })

  it('画布列头带「隐藏」标记，且该列不再标固定列', () => {
    const wrapper = mountList([
      {
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '明细',
        subFields: [subCode(), subName()],
        props: { fixedLeftColumns: 1 },
      } as SubFormNode,
    ])
    const cols = wrapper.findAll('.subform-col')
    expect(cols[0].classes()).toContain('is-hidden')
    expect(cols[0].text()).toContain('隐藏')
    expect(cols[0].find('.subform-col__pin').exists()).toBe(false)
    expect(cols[1].classes()).not.toContain('is-hidden')
    expect(cols[1].text()).toContain('左固定')
  })
})

/* --------------------------- 结构校验与导入导出 --------------------------- */

describe('隐藏参与结构校验与导入导出', () => {
  it('隐藏 + 必填不构成 error（不阻断保存与发布）', () => {
    const schema = schemaWith([
      dataNode({ key: 'a', field: 'sys_source', title: '来源', hidden: true, required: true }),
    ])
    expect(validateSchema(schema).valid).toBe(true)
  })

  it('缺省无 hidden 键：结构校验同样通过（隐藏为可选属性）', () => {
    expect(validateSchema(schemaWith([dataNode({ key: 'a', field: 'a', title: 'A' })])).valid).toBe(
      true,
    )
  })

  it('导出再导入完整保留隐藏配置（含标签页内字段与子表单）', () => {
    const schema = schemaWith([
      dataNode({ key: 'a', field: 'sys_source', title: '来源', hidden: true }),
      {
        type: 'tabs',
        key: 'tb',
        tabs: [
          {
            key: 't1',
            title: '页1',
            fields: [dataNode({ key: 'b', field: 'inner', hidden: true })],
          },
        ],
      } as FieldNode,
      {
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '明细',
        hidden: true,
        subFields: [],
        props: {},
      } as SubFormNode,
    ])
    const restored = importSchema(exportSchema(schema))
    expect((restored.fields[0] as DataFieldNode).hidden).toBe(true)
    expect((restored.fields[1] as any).tabs[0].fields[0].hidden).toBe(true)
    expect((restored.fields[2] as SubFormNode).hidden).toBe(true)
  })
})
