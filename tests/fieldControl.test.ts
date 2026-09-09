/**
 * 共享控件 FieldControl 单元测试（task 3.2）。
 * 覆盖：多选字段的数组值形态、成员/部门字段的数据源注入与未注入空列表、
 * 选项/数字/日期全类型渲染，以及子字段 width 不参与渲染。
 * 末尾两个 describe 为「统一渲染单轨」护栏：控件形态必须全部来自注册表，
 * 本组件不得重新出现按字段类型的手写分支。
 * 对应 specs/form-fields「子字段与同类型主表字段行为一致」、design D3。
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import FieldControl from '@/components/FieldControl.vue'
import { fieldRegistry } from '@/registry'
import type { DataFieldNode, FieldOption } from '@/schema/types'

/** Element Plus 控件将绑定值反射到 DOM 需等待渲染/选项注册，故统一 flush + 微等待 */
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms))

function mountControl(node: DataFieldNode, props: Record<string, unknown> = {}) {
  // 与 FieldPreview 一致：控件值由 modelValue 承载（默认取 node.value），可经 props 覆盖
  return mount(FieldControl, {
    props: { node, modelValue: node.value, ...props },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

/** 打开下拉并返回 teleport 到 body 的下拉项数量 */
async function openAndCountOptions(wrapper: ReturnType<typeof mountControl>): Promise<number> {
  await wrapper.find('.el-select__wrapper').trigger('click')
  await flushPromises()
  return document.body.querySelectorAll('.el-select-dropdown__item').length
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('FieldControl 多选值数组形态', () => {
  it('复选框组以数组承载多选值并勾选对应项', async () => {
    const wrapper = mountControl({
      type: 'checkbox',
      key: 'k',
      field: 'hobby',
      title: '兴趣',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      value: ['a', 'c'],
    })
    await flushPromises()
    expect(wrapper.findAll('.el-checkbox').length).toBe(3)
    // 数组值 ['a','c'] 命中两项
    expect(wrapper.findAll('.el-checkbox.is-checked').length).toBe(2)
    wrapper.unmount()
  })

  it('复选框组值为空数组时不勾选任何项', () => {
    const wrapper = mountControl({
      type: 'checkbox',
      key: 'k',
      field: 'hobby',
      title: '兴趣',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
      value: [],
    })
    expect(wrapper.findAll('.el-checkbox').length).toBe(2)
    expect(wrapper.findAll('.el-checkbox.is-checked').length).toBe(0)
    wrapper.unmount()
  })

  it('下拉复选框（selectMultiple）为多选模式并按数组值渲染选中标记', async () => {
    const wrapper = mountControl({
      type: 'selectMultiple',
      key: 'k',
      field: 'tags',
      title: '标签',
      options: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      value: ['a', 'b'],
    })
    expect(wrapper.find('.el-select').exists()).toBe(true)
    // 多选模式下已选值以标签形式呈现在选择框内（非 teleport），需等选项注册完成
    await flushPromises()
    await wait()
    expect(wrapper.findAll('.el-select .el-tag').length).toBe(2)
    wrapper.unmount()
  })
})

describe('FieldControl 成员/部门数据源', () => {
  it('成员字段未注入数据源时候选为空列表且不报错', async () => {
    const wrapper = mountControl({
      type: 'member',
      key: 'k',
      field: 'owner',
      title: '负责人',
    })
    expect(wrapper.find('.el-select').exists()).toBe(true)
    expect(await openAndCountOptions(wrapper)).toBe(0)
    wrapper.unmount()
  })

  it('成员字段注入数据源后按候选渲染下拉项', async () => {
    const members: FieldOption[] = [
      { label: '张三', value: 'u1' },
      { label: '李四', value: 'u2' },
    ]
    const wrapper = mountControl(
      { type: 'member', key: 'k', field: 'owner', title: '负责人' },
      { dataSources: { members } },
    )
    expect(await openAndCountOptions(wrapper)).toBe(2)
    wrapper.unmount()
  })

  it('成员多选字段以数组承载多选值', async () => {
    const members: FieldOption[] = [
      { label: '张三', value: 'u1' },
      { label: '李四', value: 'u2' },
    ]
    const wrapper = mountControl(
      {
        type: 'memberMultiple',
        key: 'k',
        field: 'owners',
        title: '负责人',
        value: ['u1', 'u2'],
      },
      { dataSources: { members } },
    )
    expect(wrapper.find('.el-select').exists()).toBe(true)
    // 多选：两个已选值呈现为标签
    await flushPromises()
    await wait()
    expect(wrapper.findAll('.el-select .el-tag').length).toBe(2)
    wrapper.unmount()
  })

  it('部门字段未注入数据源时候选为空列表', async () => {
    const wrapper = mountControl({
      type: 'department',
      key: 'k',
      field: 'dept',
      title: '部门',
    })
    expect(await openAndCountOptions(wrapper)).toBe(0)
    wrapper.unmount()
  })
})

describe('FieldControl 全类型渲染与 width 隔离', () => {
  it('数字字段渲染步进器并呈现数值', async () => {
    const wrapper = mountControl({
      type: 'number',
      key: 'k',
      field: 'qty',
      title: '数量',
      props: { precision: 0, step: 1 },
      value: 7,
    })
    await flushPromises()
    expect(wrapper.find('.el-input-number').exists()).toBe(true)
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('7')
    wrapper.unmount()
  })

  it('日期字段渲染日期选择器并呈现值', async () => {
    const wrapper = mountControl({
      type: 'date',
      key: 'k',
      field: 'day',
      title: '日期',
      value: '2024-01-02',
    })
    await flushPromises()
    await wait()
    expect(wrapper.find('.el-date-editor').exists()).toBe(true)
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('2024-01-02')
    wrapper.unmount()
  })

  it('日期字段配置 value-format，选中后以字符串回流并可回显（子表单日期可正常选值）', async () => {
    const wrapper = mountControl({
      type: 'date',
      key: 'k',
      field: 'day',
      title: '日期',
    })
    await flushPromises()
    const picker = wrapper.findComponent({ name: 'ElDatePicker' })
    expect(picker.exists()).toBe(true)
    // 缺 value-format 时 el-date-picker 会 emit Date 对象，dateValue 只认字符串会回填成空（本次 bug）
    expect(picker.props('valueFormat')).toBe('YYYY-MM-DD')
    // 模拟选中：字符串值经 dateValue 回显到输入框
    await wrapper.setProps({ modelValue: '2024-03-05' })
    await flushPromises()
    await wait()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('2024-03-05')
    wrapper.unmount()
  })

  it('日期时间字段 value-format 带时分秒', async () => {
    const wrapper = mountControl({
      type: 'date',
      key: 'k',
      field: 'time',
      title: '日期时间',
      props: { dateType: 'datetime' },
    })
    await flushPromises()
    const picker = wrapper.findComponent({ name: 'ElDatePicker' })
    expect(picker.props('valueFormat')).toBe('YYYY-MM-DD HH:mm:ss')
    wrapper.unmount()
  })

  it('单选按钮组按选项渲染', async () => {
    const wrapper = mountControl({
      type: 'radio',
      key: 'k',
      field: 'r',
      title: '单选',
      options: [
        { label: '是', value: 'y' },
        { label: '否', value: 'n' },
      ],
      value: 'y',
    })
    await flushPromises()
    expect(wrapper.findAll('.el-radio').length).toBe(2)
    expect(wrapper.findAll('.el-radio.is-checked').length).toBe(1)
    wrapper.unmount()
  })

  it('子字段的 width 不参与渲染（不落到内联样式）', () => {
    const wrapper = mountControl({
      type: 'input',
      key: 'k',
      field: 'col',
      title: '列',
      width: 30,
    })
    // FieldControl 根节点固定铺满，节点级 width 不写入内联样式（明细列宽由表格布局决定）
    expect(wrapper.element.getAttribute('style') ?? '').not.toContain('30')
    wrapper.unmount()
  })
})

describe('统一渲染单轨：全类型均由注册表驱动', () => {
  it('遍历注册表常用分组：每类字段都渲染出声明的控件而非兜底文案', () => {
    const common = fieldRegistry.listByGroup('common')
    expect(common.length).toBeGreaterThan(0)
    common.forEach((def) => {
      const control = def.control!
      const node = def.createDefault('k', `f_${def.type}`) as DataFieldNode
      const wrapper = mountControl(node)
      // 落到兜底分支意味着注册表未声明 control，或本组件又出现了类型分支
      expect(wrapper.find('.field-control__empty').exists(), `${def.type} 落到了兜底文案分支`).toBe(
        false,
      )
      expect(
        wrapper.findComponent(control.component).exists(),
        `${def.type} 未渲染注册表声明的控件`,
      ).toBe(true)
      wrapper.unmount()
    })
  })

  it('组合控件按注册表声明的子项组件逐个渲染候选项', () => {
    const radio = fieldRegistry.get('radio')!
    const node = radio.createDefault('k', 'r') as DataFieldNode
    node.options = [
      { label: '是', value: 'y' },
      { label: '否', value: 'n' },
    ]
    const wrapper = mountControl(node)
    expect(wrapper.findAllComponents(radio.control!.item!.component)).toHaveLength(2)
    expect(wrapper.text()).toContain('是')
    expect(wrapper.text()).toContain('否')
    wrapper.unmount()
  })

  it('下拉框的子项以 label 属性承载文本（与单选/复选的插槽方式区分）', () => {
    expect(fieldRegistry.get('select')!.control!.item!.labelAs).toBe('prop')
    expect(fieldRegistry.get('radio')!.control!.item!.labelAs).toBe('slot')
    expect(fieldRegistry.get('checkbox')!.control!.item!.labelAs).toBe('slot')
  })

  it('预览态候选为空时仅内联组控件呈现配置提示，下拉类不写不可见提示', async () => {
    expect(fieldRegistry.get('checkbox')!.control!.itemsInline).toBe(true)
    expect(fieldRegistry.get('select')!.control!.itemsInline).toBeFalsy()

    const node = fieldRegistry.get('checkbox')!.createDefault('k', 'c') as DataFieldNode
    node.options = []
    const wrapper = mountControl(node, { preview: true })
    await flushPromises()
    expect(wrapper.text()).toContain('请在右侧「选项」中配置')
    wrapper.unmount()
  })

  it('未声明 control 的类型（子表单/布局）落到兜底文案而不报错', () => {
    const wrapper = mount(FieldControl, {
      // 子表单不由 FieldControl 承载，此处验证兜底容错
      props: { node: { type: 'subform', key: 'k', field: 's', title: '子表单' } as never },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find('.field-control__empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('子表单')
    wrapper.unmount()
  })
})

describe('FieldControl 只读态（供子表单单元格等宿主复用）', () => {
  function readonlyNode(extra: Partial<DataFieldNode> = {}): DataFieldNode {
    return {
      type: 'input',
      key: 'k',
      field: 'code',
      title: '编码',
      value: 'C1',
      ...extra,
    } as DataFieldNode
  }

  it('节点自身配置只读时控件呈禁用态', async () => {
    const wrapper = mountControl(readonlyNode({ readonly: true }))
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('宿主下发只读（子表单整体只读等）时同样禁用控件', async () => {
    const wrapper = mountControl(readonlyNode(), { readonly: true })
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('未配置只读时控件可录入', async () => {
    const wrapper = mountControl(readonlyNode())
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(false)
    wrapper.unmount()
  })

  it('预览态不加 disabled：设计器画布不因只读而灰化（design D3 取舍保持）', async () => {
    const wrapper = mountControl(readonlyNode({ readonly: true }), { preview: true })
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(false)
    wrapper.unmount()
  })
})

describe('源码护栏：控件形态不得回流到组件内分支', () => {
  // vitest 下 import.meta.url 非 file 协议，故由工程根目录（vitest root）解析源码路径
  const SOURCE = resolve(process.cwd(), 'src/components/FieldControl.vue')

  async function readSource(): Promise<string> {
    return readFile(SOURCE, 'utf-8')
  }

  it('模板中不存在按字段类型的手写 v-if 分支', async () => {
    const source = await readSource()
    expect(source).not.toMatch(/v-(?:else-)?if="[^"]*\btype\s*===/)
    expect(source).not.toMatch(/v-else-if=/)
  })

  it('不直接依赖具体 Element Plus 控件（组件名均来自注册表）', async () => {
    const source = await readSource()
    expect(source).not.toMatch(/from 'element-plus'/)
    expect(source).not.toMatch(/\bEl(?:Input|Select|Radio|Checkbox|DatePicker)\b/)
  })

  it('以 <component :is> 渲染注册表声明的控件', async () => {
    const source = await readSource()
    expect(source).toMatch(/:is="control\.component"/)
    expect(source).toMatch(/fieldRegistry\.get\(/)
  })
})
