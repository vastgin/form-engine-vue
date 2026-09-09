/**
 * 子表单跨层集成测试（task 5.2 / 5.3 / 5.4，并作为 7.1 的子表单集成套件）。
 * 经 FormRenderer 贯通 schema(SubFormNode) → registry/adapter(engine-subform rule) →
 * 渲染(EngineSubForm) → 校验合并 → 数据输出，验证：
 * - 主表 / 子表单 / 两者同时失败互不吞没，错误经 provide→inject 在明细呈现（design D2）；
 * - 子表单值为对象数组、空白行剔除、隐藏子表单排除输出且不参与校验；
 * - 值为非数组时按空明细容错，不中断其余字段渲染；
 * - 批量删除开关贯通（首列勾选框 + 底部删除入口）与 native 规则的底部行间距补足。
 * 注：jsdom 下 form-create 的 api.validate 恒 true，主表失败以桩化模拟（见 renderer.integration.test.ts 说明）。
 */
import { describe, expect, it, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import formCreate from '@form-create/element-ui'
import FormRenderer from '@/renderer/FormRenderer.vue'
import { registerEngineComponents } from '@/renderer/components'
import { SCHEMA_VERSION, type FormSchema } from '@/schema/types'

registerEngineComponents()

/** 子表单明细组件源文件（vitest root 即工程根目录） */
const SUBFORM_COMPONENT = 'src/renderer/components/EngineSubForm.vue'

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms))

function mountRenderer(schema: FormSchema, props: Record<string, unknown> = {}) {
  return mount(FormRenderer, {
    props: { schema, ...props },
    global: { plugins: [ElementPlus, formCreate] },
    attachTo: document.body,
  })
}

/** 含一个必填主表字段与一个必填子表单（名称必填 + 数量）的 schema */
function subFormSchema(): FormSchema {
  return {
    id: 'sf',
    name: '子表单集成',
    version: SCHEMA_VERSION,
    formConfig: { labelPosition: 'right' },
    fields: [
      { type: 'input', key: 'main', field: 'mainName', title: '主表姓名', required: true },
      {
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '采购明细',
        required: true,
        subFields: [
          { type: 'input', key: 'n', field: 'name', title: '产品名称', required: true },
          { type: 'number', key: 'q', field: 'qty', title: '数量', props: { precision: 0 } },
        ],
        props: { minRows: 1, maxRows: 200 },
      },
    ],
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('子表单校验合并 (5.2)', () => {
  it('子表单整体必填无有效行时阻止提交，并经 provide→inject 在明细呈现整体错误', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeFalsy()
    const overall = wrapper.find('.engine-subform__overall-error')
    expect(overall.exists()).toBe(true)
    expect(overall.text()).toContain('采购明细')
    wrapper.unmount()
  })

  it('行内缺必填时单元格呈现定位到行列的错误', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    // 该行数量有值（非空行）但必填的产品名称为空
    ;(wrapper.vm as any).setData({ mainName: 'x', items: [{ name: '', qty: 5 }] })
    await flushPromises()
    await wait()
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeFalsy()
    const cellErr = wrapper.find('.engine-subform__cell-error')
    expect(cellErr.exists()).toBe(true)
    expect(cellErr.text()).toContain('第 1 行')
    expect(cellErr.text()).toContain('产品名称')
    wrapper.unmount()
  })

  it('主表校验失败时阻止提交（子表单即便通过）', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    ;(wrapper.vm as any).setData({ mainName: '张三', items: [{ name: 'A', qty: 1 }] })
    await flushPromises()
    await wait()
    const api = (wrapper.vm as any).getApi()
    api.validate = (cb: any) => cb(false) // 桩化主表失败
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeFalsy()
    wrapper.unmount()
  })

  it('主表与子表单同时失败时互不吞没（子表单错误仍呈现）', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    const api = (wrapper.vm as any).getApi()
    api.validate = (cb: any) => cb(false) // 主表失败
    // 子表单无数据 → 子表单整体必填失败
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeFalsy()
    // 子表单错误未被主表失败吞没
    expect(wrapper.find('.engine-subform__overall-error').exists()).toBe(true)
    wrapper.unmount()
  })

  it('主表与子表单均通过时提交成功', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    ;(wrapper.vm as any).setData({
      mainName: '张三',
      items: [
        { name: 'A', qty: 1 },
        { name: 'B', qty: 2 },
      ],
    })
    await flushPromises()
    await wait()
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeTruthy()
    wrapper.unmount()
  })
})

describe('子表单数据输出 (5.3)', () => {
  it('输出为对象数组（键为子字段 field）', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    ;(wrapper.vm as any).setData({
      items: [
        { name: 'A', qty: 1 },
        { name: 'B', qty: 2 },
      ],
    })
    await flushPromises()
    await wait()
    const data = (wrapper.vm as any).getData()
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.items).toEqual([
      { name: 'A', qty: 1 },
      { name: 'B', qty: 2 },
    ])
    wrapper.unmount()
  })

  it('完全空白行从输出中剔除', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    ;(wrapper.vm as any).setData({
      items: [
        { name: 'A', qty: 1 },
        { name: '', qty: undefined },
      ],
    })
    await flushPromises()
    await wait()
    const data = (wrapper.vm as any).getData()
    expect(data.items).toEqual([{ name: 'A', qty: 1 }])
    wrapper.unmount()
  })

  it('子表单被显隐隐藏时不出现在输出且不参与校验', async () => {
    const schema = subFormSchema()
    ;(schema.fields[1] as any).visibleRule = {
      logic: 'and',
      action: 'show',
      conditions: [{ field: 'mainName', operator: 'eq', value: 'show' }],
    }
    const wrapper = mountRenderer(schema)
    await flushPromises()
    await wait()
    // mainName != 'show' → 子表单隐藏；即便其中有内容也应被排除
    ;(wrapper.vm as any).setData({ mainName: 'hide', items: [{ name: 'A', qty: 1 }] })
    await flushPromises()
    await wait(60)
    const data = (wrapper.vm as any).getData()
    expect('items' in data).toBe(false)
    // 隐藏子表单不参与校验：必填也不阻止提交
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeTruthy()
    wrapper.unmount()
  })
})

describe('子表单非数组容错 (5.4)', () => {
  it('值为 null 时按空明细处理，getData 返回空数组且不中断其余字段渲染', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    ;(wrapper.vm as any).setData({ items: null })
    await flushPromises()
    await wait()
    const data = (wrapper.vm as any).getData()
    expect(data.items).toEqual([])
    // 主表输入框仍渲染
    expect(wrapper.findAll('input').length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('值为对象时按空明细容错，不抛异常', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    ;(wrapper.vm as any).setData({ items: { foo: 1 } })
    await flushPromises()
    await wait()
    const data = (wrapper.vm as any).getData()
    expect(data.items).toEqual([])
    wrapper.unmount()
  })
})

describe('子表单批量删除贯通（schema → rule → 渲染）', () => {
  /** 在集成 schema 上开启批量删除 */
  function batchSchema(): FormSchema {
    const schema = subFormSchema()
    ;(schema.fields[1] as any).props.allowBatchRemove = true
    return schema
  }

  it('开启后填报态首列为勾选列，批量删除结果进入 getData', async () => {
    const wrapper = mountRenderer(batchSchema())
    await flushPromises()
    await wait()
    ;(wrapper.vm as any).setData({
      mainName: '张三',
      items: [
        { name: 'A', qty: 1 },
        { name: 'B', qty: 2 },
      ],
    })
    await flushPromises()
    await wait()
    const checks = wrapper.findAll(
      '.engine-subform .el-table__body-wrapper .el-table__row .el-checkbox__original',
    )
    expect(checks.length).toBe(2)
    await checks[0].setValue(true)
    await flushPromises()
    await wait()
    const btns = wrapper.findAll('.engine-subform__footer .el-button')
    expect(btns.length).toBe(2)
    await btns[1].trigger('click')
    await flushPromises()
    await wait()
    expect((wrapper.vm as any).getData().items).toEqual([{ name: 'B', qty: 2 }])
    wrapper.unmount()
  })

  it('未开启时填报态保持序号列（无勾选框与批量删除按钮）', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    expect(wrapper.findAll('.engine-subform .el-checkbox__original').length).toBe(0)
    expect(wrapper.findAll('.engine-subform__footer .el-button').length).toBe(1)
    wrapper.unmount()
  })
})

describe('子表单与其他字段的行间距', () => {
  it('native 规则不经 el-form-item 包裹，故由组件自带 18px 底部留白', async () => {
    const wrapper = mountRenderer(subFormSchema())
    await flushPromises()
    await wait()
    // 子表单 rule 为 native：不生成 el-form-item / el-col 包裹，也就没有默认下边距
    const el = wrapper.find('.engine-subform').element as HTMLElement
    expect(el.closest('.el-form-item')).toBeNull()
    // 由组件自行补足与 el-form-item 默认一致的 18px，使与下一行字段不贴在一起
    const src = await readFile(resolve(process.cwd(), SUBFORM_COMPONENT), 'utf-8')
    expect(src).toMatch(/\.engine-subform\s*\{[^}]*margin-bottom:\s*18px/)
    wrapper.unmount()
  })
})
