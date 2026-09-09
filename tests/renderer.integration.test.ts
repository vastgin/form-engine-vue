import { describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import formCreate from '@form-create/element-ui'
import FormRenderer from '@/renderer/FormRenderer.vue'
import { registerEngineComponents } from '@/renderer/components'
import { SCHEMA_VERSION, type FormSchema } from '@/schema/types'

registerEngineComponents()

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms))

function mountRenderer(schema: FormSchema, props: Record<string, unknown> = {}) {
  return mount(FormRenderer, {
    props: { schema, ...props },
    global: { plugins: [ElementPlus, formCreate] },
    attachTo: document.body,
  })
}

function simpleSchema(): FormSchema {
  return {
    id: 'it',
    name: '集成测试表单',
    version: SCHEMA_VERSION,
    formConfig: { labelPosition: 'right' },
    fields: [
      { type: 'text', key: 'l', title: '说明', props: { content: 'hi' } },
      { type: 'input', key: 'a', field: 'name', title: '姓名', required: true },
      {
        type: 'radio',
        key: 'b',
        field: 'type',
        title: '类型',
        options: [
          { label: '标准', value: '标准' },
          { label: '其他', value: '其他' },
        ],
      },
      {
        type: 'input',
        key: 'c',
        field: 'remark',
        title: '备注',
        visibleRule: {
          logic: 'and',
          action: 'show',
          conditions: [{ field: 'type', operator: 'eq', value: '其他' }],
        },
      },
    ],
  }
}

describe('渲染器集成 (4.2/5.4/8.1)', () => {
  it('挂载并渲染数据字段，说明文字作为布局展示', async () => {
    const wrapper = mountRenderer(simpleSchema())
    await flushPromises()
    await wait()
    // 至少渲染出姓名输入框
    expect(wrapper.findAll('input').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('说明')
    wrapper.unmount()
  })

  it('getData 排除布局字段', async () => {
    const wrapper = mountRenderer(simpleSchema())
    await flushPromises()
    await wait()
    const data = (wrapper.vm as any).getData()
    expect(Object.keys(data)).toContain('name')
    expect(Object.keys(data)).toContain('type')
    expect(Object.keys(data)).not.toContain('l')
    wrapper.unmount()
  })

  it('显隐规则：依赖值命中后显示受控字段并纳入数据', async () => {
    const wrapper = mountRenderer(simpleSchema())
    await flushPromises()
    await wait()

    // 初始 type 为空，remark 应被隐藏且不在数据中
    expect(Object.keys((wrapper.vm as any).getData())).not.toContain('remark')

    // 设置 type=其他，触发显示
    ;(wrapper.vm as any).setData({ type: '其他' })
    await flushPromises()
    await wait(50)

    expect(Object.keys((wrapper.vm as any).getData())).toContain('remark')
    wrapper.unmount()
  })

  it('提交经 form-create 真实管线输出收集到的数据', async () => {
    const wrapper = mountRenderer(simpleSchema())
    await flushPromises()
    await wait()

    // 填充必填项后提交：数据经真实 form-create 实例收集并输出
    ;(wrapper.vm as any).setData({ name: '张三' })
    await flushPromises()
    await wait()
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()

    const submitted = wrapper.emitted('submit')
    expect(submitted).toBeTruthy()
    expect((submitted![0][0] as any).name).toBe('张三')
    wrapper.unmount()
  })

  /** 按标签文本定位必填项的 el-form-item，取其星号位置类（asterisk-left / asterisk-right） */
  async function asteriskClasses(labelPosition: 'left' | 'right' | 'top'): Promise<string[]> {
    const schema = simpleSchema()
    schema.formConfig = { ...(schema.formConfig ?? {}), labelPosition }
    const wrapper = mountRenderer(schema)
    await flushPromises()
    await wait()
    const item = wrapper
      .findAll('.el-form-item')
      .find((it) => it.find('.el-form-item__label').text().includes('姓名'))
    const classes = item ? item.classes() : []
    wrapper.unmount()
    return classes
  }

  it('必填星号位置随标签对齐联动：左对齐移到标签右侧，右对齐/顶部对齐维持左侧', async () => {
    // 星号位置由 el-form 的 requireAsteriskPosition 下发到 el-form-item 的类上
    expect(await asteriskClasses('left')).toContain('asterisk-right')
    expect(await asteriskClasses('right')).toContain('asterisk-left')
    expect(await asteriskClasses('top')).toContain('asterisk-left')
  })

  // 说明：form-create 的运行时校验（api.validate）在 jsdom/vitest 环境下不会
  // 强制执行字段规则（实测：即便字段值违反 required/pattern，仍 resolve true），
  // 该运行时行为需在浏览器中验证。此处通过桩化底层 api.validate 直接验证
  // 渲染器的提交门控契约——「校验未通过则不输出数据」，规则生成的正确性由
  // tests/adapter.test.ts 覆盖。
  it('校验未通过时不触发 submit（提交门控契约）', async () => {
    const wrapper = mountRenderer(simpleSchema())
    await flushPromises()
    await wait()

    const api = (wrapper.vm as any).getApi()
    expect(api).toBeTruthy()
    // 桩化：令 form-create 报告校验失败
    api.validate = (cb: any) => cb(false)

    ;(wrapper.vm as any).setData({ name: '张三' })
    await flushPromises()
    await (wrapper.vm as any).submit()
    await flushPromises()
    expect(wrapper.emitted('submit')).toBeFalsy()

    // 恢复为校验通过：门控放行，输出数据
    api.validate = (cb: any) => cb(true)
    await (wrapper.vm as any).submit()
    await flushPromises()
    expect(wrapper.emitted('submit')).toBeTruthy()
    wrapper.unmount()
  })
})

/* ---------------- 整表提交校验与提交按钮（add-designer-property-tabs 2.2/2.3） ---------------- */

function submitValidationSchema(): FormSchema {
  return {
    id: 'sv',
    name: '整表校验',
    version: SCHEMA_VERSION,
    formConfig: {
      submitValidation: [
        {
          logic: 'and',
          conditions: [{ field: 'amount', operator: 'gt', value: 100 }],
          message: '金额不能超过100',
        },
      ],
    },
    fields: [{ type: 'number', key: 'n', field: 'amount', title: '金额' }],
  }
}

describe('整表提交校验与提交按钮 (2.2/2.3)', () => {
  it('条件命中阻止提交，不命中放行', async () => {
    const wrapper = mountRenderer(submitValidationSchema())
    await flushPromises()
    await wait()
    const api = (wrapper.vm as any).getApi()
    api.validate = (cb: any) => cb(true)

    // amount=200 命中「>100」→ 阻止提交
    ;(wrapper.vm as any).setData({ amount: 200 })
    await flushPromises()
    await wait()
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeFalsy()

    // amount=50 不命中 → 放行
    ;(wrapper.vm as any).setData({ amount: 50 })
    await flushPromises()
    await wait()
    await (wrapper.vm as any).submit()
    await flushPromises()
    await wait()
    expect(wrapper.emitted('submit')).toBeTruthy()
    wrapper.unmount()
  })

  it('无 submitValidation 配置时不因整表校验阻止提交', async () => {
    const wrapper = mountRenderer(simpleSchema())
    await flushPromises()
    await wait()
    const api = (wrapper.vm as any).getApi()
    api.validate = (cb: any) => cb(true)
    ;(wrapper.vm as any).setData({ name: '李四' })
    await flushPromises()
    await (wrapper.vm as any).submit()
    await flushPromises()
    expect(wrapper.emitted('submit')).toBeTruthy()
    wrapper.unmount()
  })

  it('自定义提交按钮文字', async () => {
    const schema = submitValidationSchema()
    schema.formConfig!.submitButton = { text: '确认提交' }
    const wrapper = mountRenderer(schema)
    await flushPromises()
    await wait()
    expect(wrapper.text()).toContain('确认提交')
    wrapper.unmount()
  })

  it('隐藏提交按钮时不渲染主按钮但保留重置', async () => {
    const schema = submitValidationSchema()
    schema.formConfig!.submitButton = { hidden: true }
    const wrapper = mountRenderer(schema)
    await flushPromises()
    await wait()
    expect(wrapper.find('.form-renderer__actions .el-button--primary').exists()).toBe(false)
    expect(wrapper.text()).toContain('重置')
    wrapper.unmount()
  })
})

/* ---------------- 填报态多标签页默认选中首个页签 ---------------- */

function tabsSchema(): FormSchema {
  return {
    id: 'tb',
    name: '标签页表单',
    version: SCHEMA_VERSION,
    fields: [
      {
        type: 'tabs',
        key: 'tabs',
        tabs: [
          {
            key: 'tb1',
            title: '基本信息',
            fields: [{ type: 'input', key: 'a', field: 'name', title: '姓名' }],
          },
          {
            key: 'tb2',
            title: '付款信息',
            fields: [{ type: 'input', key: 'b', field: 'account', title: '账号' }],
          },
        ],
      },
    ],
  }
}

describe('填报态多标签页默认选中首个页签', () => {
  /** 页签头（文档序） */
  function tabItems(wrapper: ReturnType<typeof mountRenderer>) {
    return wrapper.findAll('.engine-tabs .el-tabs__item')
  }
  /** 页签面板（文档序），v-show 以行内 display 控制可见性 */
  function panes(wrapper: ReturnType<typeof mountRenderer>) {
    return wrapper.findAll('.engine-tabs .el-tab-pane')
  }

  it('挂载即选中首个页签并只展示其内容', async () => {
    const wrapper = mountRenderer(tabsSchema())
    await flushPromises()
    await wait()
    const items = tabItems(wrapper)
    expect(items).toHaveLength(2)
    expect(items[0].classes()).toContain('is-active')
    expect(items[0].text()).toBe('基本信息')
    expect(items[1].classes()).not.toContain('is-active')
    const visible = panes(wrapper)
    expect((visible[0].element as HTMLElement).style.display).not.toBe('none')
    expect((visible[1].element as HTMLElement).style.display).toBe('none')
    wrapper.unmount()
  })

  it('点击第二个页签后切换选中项与可见面板', async () => {
    const wrapper = mountRenderer(tabsSchema())
    await flushPromises()
    await wait()
    await tabItems(wrapper)[1].trigger('click')
    await flushPromises()
    await wait()
    expect(tabItems(wrapper)[1].classes()).toContain('is-active')
    expect(tabItems(wrapper)[0].classes()).not.toContain('is-active')
    expect((panes(wrapper)[1].element as HTMLElement).style.display).not.toBe('none')
    wrapper.unmount()
  })
})
