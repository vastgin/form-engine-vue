/**
 * EngineSubForm 明细表格组件测试（task 4.1-4.5）。
 * 覆盖：按子字段渲染列与可输入单元格、空态、行增删与行数限制（缺省 200 / 硬上限 500 钳制）、
 * __rowKey 剥离与逐格输入不串值、只读与重置、固定列（首末列恒冻结 + 数据列钳制）、
 * 批量删除（勾选列 + 底部删除入口）、底部「新增」与「删除」两按钮同风格与间距。
 * 对应 specs/form-renderer「子表单明细渲染 / 行增删与行数限制 / 只读与重置」。
 */
import { describe, expect, it, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EngineSubForm from '@/renderer/components/EngineSubForm.vue'
import type { DataFieldNode } from '@/schema/types'

/** 子表单明细组件源文件（样式类断言用，vitest root 即工程根目录） */
const SUBFORM_COMPONENT = 'src/renderer/components/EngineSubForm.vue'

/** el-table 布局为异步，统一 flush + 微等待 */
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms))

function mountSubForm(props: Record<string, unknown>) {
  return mount(EngineSubForm, {
    props,
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

function inputSub(field: string, title: string, extra: Partial<DataFieldNode> = {}): DataFieldNode {
  return { type: 'input', key: field, field, title, ...extra }
}

/** 表格数据行 */
function bodyRows(wrapper: ReturnType<typeof mountSubForm>) {
  return wrapper.findAll('.el-table__body-wrapper .el-table__row')
}
/** 新增行按钮 */
function addBtn(wrapper: ReturnType<typeof mountSubForm>) {
  return wrapper.find('.engine-subform__footer .el-button')
}
/** 各行删除按钮 */
function delBtns(wrapper: ReturnType<typeof mountSubForm>) {
  return wrapper.findAll('.el-table__body-wrapper .el-button')
}
function isDisabled(btn: { element: Element }): boolean {
  return (btn.element as HTMLButtonElement).disabled === true
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('EngineSubForm 明细渲染 (4.1)', () => {
  it('按子字段渲染列头与对应类型的可输入单元格', async () => {
    const wrapper = mountSubForm({
      title: '采购明细',
      subFields: [
        inputSub('name', '产品名称'),
        { type: 'number', key: 'qty', field: 'qty', title: '数量', props: { precision: 0 } },
      ],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    const header = wrapper.find('.el-table__header-wrapper')
    expect(header.text()).toContain('产品名称')
    expect(header.text()).toContain('数量')
    // 单元格分别为文本输入与数字步进器
    expect(wrapper.find('.el-table__body-wrapper input').exists()).toBe(true)
    expect(wrapper.find('.el-table__body-wrapper .el-input-number').exists()).toBe(true)
    wrapper.unmount()
  })

  it('必填子字段列头带可见必填标识', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '产品名称', { required: true })],
      modelValue: [],
    })
    await flushPromises()
    await wait()
    expect(wrapper.find('.el-table__header-wrapper .engine-subform__star').exists()).toBe(true)
    wrapper.unmount()
  })

  it('提供行序号列', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    // 序号列首格显示 1
    expect(wrapper.find('.el-table__body-wrapper .el-table__row').text()).toContain('1')
    wrapper.unmount()
  })
})

describe('EngineSubForm 空态 (4.2)', () => {
  it('无子字段时展示空态提示且不渲染表格、不抛异常', async () => {
    const wrapper = mountSubForm({ subFields: [], modelValue: [] })
    await flushPromises()
    await wait()
    expect(wrapper.find('.el-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('尚无可录入列')
    expect(wrapper.find('.el-table').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('EngineSubForm 行增删与行数限制 (4.3)', () => {
  it('初始按 minRows 展开空行', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 2,
    })
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(2)
    expect(wrapper.find('.engine-subform__count').text()).toContain('2 /')
    wrapper.unmount()
  })

  it('minRows 未配置时初始不预置行（0 行）', async () => {
    const wrapper = mountSubForm({ subFields: [inputSub('name', '名称')], modelValue: [] })
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(0)
    expect(wrapper.find('.engine-subform__count').text()).toContain('0 /')
    wrapper.unmount()
  })

  it('点击新增追加一行并对外 emit', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    await addBtn(wrapper).trigger('click')
    await flushPromises()
    await wait()
    expect(wrapper.find('.engine-subform__count').text()).toContain('2 /')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect((emitted!.at(-1)![0] as unknown[]).length).toBe(2)
    wrapper.unmount()
  })

  it('达 maxRows 后新增入口禁用、行数保持', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 1,
      maxRows: 3,
    })
    await flushPromises()
    await wait()
    await addBtn(wrapper).trigger('click')
    await flushPromises()
    await addBtn(wrapper).trigger('click')
    await flushPromises()
    await wait()
    expect(wrapper.find('.engine-subform__count').text()).toContain('3 / 3')
    expect(isDisabled(addBtn(wrapper))).toBe(true)
    wrapper.unmount()
  })

  it('可删除至 0 行（删除不受最少行数限制）', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    // 初始 1 行（minRows 预置），删除按钮可用（不再因行数<=minRows 禁用）
    expect(bodyRows(wrapper).length).toBe(1)
    expect(isDisabled(delBtns(wrapper)[0])).toBe(false)
    await delBtns(wrapper)[0].trigger('click')
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(0)
    const emitted = wrapper.emitted('update:modelValue')
    expect((emitted!.at(-1)![0] as unknown[]).length).toBe(0)
    wrapper.unmount()
  })

  it('maxRows 超硬上限时被钳制为 500', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      maxRows: 800,
    })
    await flushPromises()
    await wait()
    expect(wrapper.find('.engine-subform__count').text()).toContain('/ 500')
    wrapper.unmount()
  })

  it('maxRows 未配置时按缺省 200 行生效', async () => {
    const wrapper = mountSubForm({ subFields: [inputSub('name', '名称')], modelValue: [] })
    await flushPromises()
    await wait()
    expect(wrapper.find('.engine-subform__count').text()).toContain('/ 200')
    wrapper.unmount()
  })

  it('maxRows 在缺省与硬上限之间时原值生效（200 < 350 <= 500）', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      maxRows: 350,
    })
    await flushPromises()
    await wait()
    expect(wrapper.find('.engine-subform__count').text()).toContain('/ 350')
    wrapper.unmount()
  })
})

describe('EngineSubForm 行标识与串值 (4.4)', () => {
  it('对外值剥离内部 __rowKey', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    await addBtn(wrapper).trigger('click')
    await flushPromises()
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as Record<string, unknown>[]
    expect(last.length).toBe(2)
    expect(last.every((r) => !('__rowKey' in r))).toBe(true)
    wrapper.unmount()
  })

  it('新增/删除行后逐格输入不串值', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    // 新增一行 → 2 行
    await addBtn(wrapper).trigger('click')
    await flushPromises()
    await wait()
    const inputs = wrapper.findAll('.el-table__body-wrapper input')
    expect(inputs.length).toBe(2)
    // 逐格输入
    await inputs[0].setValue('A')
    await inputs[1].setValue('B')
    await flushPromises()
    // 删除第 0 行后，剩余行应保持 'B'（未因行组件复用串值）
    await delBtns(wrapper)[0].trigger('click')
    await flushPromises()
    await wait()
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as Record<string, unknown>[]
    expect(last.length).toBe(1)
    expect(last[0].name).toBe('B')
    wrapper.unmount()
  })
})

describe('EngineSubForm 只读与重置 (4.5)', () => {
  it('只读态无增删入口且单元格标记为只读', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [{ name: 'A' }],
      readonly: true,
    })
    await flushPromises()
    await wait()
    expect(wrapper.find('.engine-subform__footer').exists()).toBe(false)
    expect(delBtns(wrapper).length).toBe(0)
    expect(wrapper.find('.engine-subform__cell.is-readonly').exists()).toBe(true)
    wrapper.unmount()
  })

  it('只读态按既有数据展示行', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [{ name: 'A' }, { name: 'B' }],
      readonly: true,
    })
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(2)
    wrapper.unmount()
  })

  it('只读态单元格控件呈禁用态（不再仅靠 pointer-events 屏蔽交互）', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [{ name: 'A' }],
      readonly: true,
    })
    await flushPromises()
    await wait()
    const input = wrapper.find('.el-table__body-wrapper input')
    expect((input.element as HTMLInputElement).disabled).toBe(true)
    expect(input.element.closest('.el-input')?.classList.contains('is-disabled')).toBe(true)
    wrapper.unmount()
  })

  it('子字段自身配置只读：仅该列控件禁用，其余列仍可录入', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('code', '编码', { readonly: true }), inputSub('name', '名称')],
      modelValue: [{ code: 'C1', name: 'N1' }],
    })
    await flushPromises()
    await wait()
    const inputs = wrapper.findAll('.el-table__body-wrapper input')
    expect((inputs[0].element as HTMLInputElement).disabled).toBe(true)
    expect((inputs[1].element as HTMLInputElement).disabled).toBe(false)
    // 只读列仍展示其既有值
    expect((inputs[0].element as HTMLInputElement).value).toBe('C1')
    wrapper.unmount()
  })

  it('子字段只读不阻断同列的录入以外的行操作（仍可新增与删行）', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('code', '编码', { readonly: true })],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    expect(wrapper.find('.engine-subform__footer').exists()).toBe(true)
    expect(addBtn(wrapper).exists()).toBe(true)
    await addBtn(wrapper).trigger('click')
    await wait()
    expect(bodyRows(wrapper).length).toBe(2)
    wrapper.unmount()
  })

  it('重置（外部清空值）回到初始行数并清空内容', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [{ name: 'A' }, { name: 'B' }],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(2)
    // 模拟重置：外部把值清为空数组
    await wrapper.setProps({ modelValue: [] })
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(1)
    const inputs = wrapper.findAll('.el-table__body-wrapper input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })
})

/* 固定列（task 8.3/8.6，design D9）：以 el-table 冻结列的类名断言。
   首列（勾选/序号）与末列（行操作）恒定冻结，仅数据列受 fixedLeftColumns/fixedRightColumns 支配 */
function leftFixedHeaders(wrapper: ReturnType<typeof mountSubForm>): number {
  return wrapper.findAll('.el-table__header-wrapper th.el-table-fixed-column--left').length
}
function rightFixedHeaders(wrapper: ReturnType<typeof mountSubForm>): number {
  return wrapper.findAll('.el-table__header-wrapper th.el-table-fixed-column--right').length
}
function fiveCols(): DataFieldNode[] {
  return ['a', 'b', 'c', 'd', 'e'].map((f) => inputSub(f, f))
}

describe('EngineSubForm 固定列 (8.3/8.6)', () => {
  it('未配置固定列时数据列不冻结，首列序号与末列操作仍恒定冻结', async () => {
    const wrapper = mountSubForm({ subFields: fiveCols(), modelValue: [] })
    await flushPromises()
    await wait()
    expect(leftFixedHeaders(wrapper)).toBe(1)
    expect(rightFixedHeaders(wrapper)).toBe(1)
    wrapper.unmount()
  })

  it('显式配置 0 固定列同样不影响首末列的恒定冻结', async () => {
    const wrapper = mountSubForm({
      subFields: fiveCols(),
      modelValue: [],
      fixedLeftColumns: 0,
      fixedRightColumns: 0,
    })
    await flushPromises()
    await wait()
    expect(leftFixedHeaders(wrapper)).toBe(1)
    expect(rightFixedHeaders(wrapper)).toBe(1)
    wrapper.unmount()
  })

  it('固定左列：序号列 + 前 N 个数据列左冻结，操作列仍单独右冻结', async () => {
    const wrapper = mountSubForm({ subFields: fiveCols(), modelValue: [], fixedLeftColumns: 2 })
    await flushPromises()
    await wait()
    // 序号列(1) + 前 2 数据列 = 3 个左冻结列；右冻结仅操作列
    expect(leftFixedHeaders(wrapper)).toBe(3)
    expect(rightFixedHeaders(wrapper)).toBe(1)
    wrapper.unmount()
  })

  it('固定右列：后 N 个数据列 + 操作列右冻结，序号列仍左冻结', async () => {
    const wrapper = mountSubForm({ subFields: fiveCols(), modelValue: [], fixedRightColumns: 1 })
    await flushPromises()
    await wait()
    // 末 1 数据列 + 操作列 = 2 个右冻结列；左冻结仅序号列
    expect(rightFixedHeaders(wrapper)).toBe(2)
    expect(leftFixedHeaders(wrapper)).toBe(1)
    wrapper.unmount()
  })

  it('左+右合计超子字段数被钳制（先左后右），首末列不参与钳制', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('a', 'a'), inputSub('b', 'b'), inputSub('c', 'c')],
      modelValue: [],
      fixedLeftColumns: 2,
      fixedRightColumns: 2,
    })
    await flushPromises()
    await wait()
    // 左 2 + 序号 1 = 3 左冻结；右被钳到 3-2=1，加操作列 = 2 右冻结
    expect(leftFixedHeaders(wrapper)).toBe(3)
    expect(rightFixedHeaders(wrapper)).toBe(2)
    wrapper.unmount()
  })

  it('非法/负数固定列按 0 处理，小数向下取整（首末列仍冻结）', async () => {
    const wrapper = mountSubForm({
      subFields: fiveCols(),
      modelValue: [],
      fixedLeftColumns: -3,
      fixedRightColumns: 2.9,
    })
    await flushPromises()
    await wait()
    // 负数 -> 0（仅剩序号列）；2.9 -> floor 2（右冻结 2 数据列 + 操作列 = 3）
    expect(leftFixedHeaders(wrapper)).toBe(1)
    expect(rightFixedHeaders(wrapper)).toBe(3)
    wrapper.unmount()
  })

  it('只读态无操作列，右冻结仅数据列，序号列仍左冻结', async () => {
    const wrapper = mountSubForm({
      subFields: fiveCols(),
      modelValue: [{ a: '1' }],
      readonly: true,
      fixedRightColumns: 1,
    })
    await flushPromises()
    await wait()
    // 只读无操作列，右冻结 = 1 个数据列；左冻结 = 序号列
    expect(rightFixedHeaders(wrapper)).toBe(1)
    expect(leftFixedHeaders(wrapper)).toBe(1)
    wrapper.unmount()
  })

  it('开启批量删除时首列换为勾选列，同样恒左冻结', async () => {
    const wrapper = mountSubForm({
      subFields: fiveCols(),
      modelValue: [],
      allowBatchRemove: true,
    })
    await flushPromises()
    await wait()
    expect(wrapper.find('.el-table__header-wrapper .el-checkbox__original').exists()).toBe(true)
    expect(leftFixedHeaders(wrapper)).toBe(1)
    expect(rightFixedHeaders(wrapper)).toBe(1)
    wrapper.unmount()
  })
})

/* ---------------- 行内删除图标化与批量删除 ---------------- */

/** 底部按钮（依次为「添加一行」与可选的批量「删除」） */
function footerBtns(wrapper: ReturnType<typeof mountSubForm>) {
  return wrapper.findAll('.engine-subform__footer .el-button')
}
/** 各行勾选框（仅开启批量删除时存在） */
function rowChecks(wrapper: ReturnType<typeof mountSubForm>) {
  return wrapper.findAll('.el-table__body-wrapper .el-table__row .el-checkbox__original')
}
/** 表头全选勾选框 */
function checkAll(wrapper: ReturnType<typeof mountSubForm>) {
  return wrapper.find('.el-table__header-wrapper .el-checkbox__original')
}

describe('EngineSubForm 行内删除图标化', () => {
  it('行内删除为图标按钮（无文字）且位于专属操作列', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 1,
    })
    await flushPromises()
    await wait()
    const btn = delBtns(wrapper)[0]
    expect(btn.text()).toBe('')
    expect(btn.find('.el-icon').exists()).toBe(true)
    expect(btn.attributes('title')).toBe('删除本行')
    // 操作列以专属类名承载（配合收窄的列宽与内边距）
    expect(wrapper.find('.el-table__body-wrapper td.engine-subform__op-col').exists()).toBe(true)
    wrapper.unmount()
  })

  it('图标按钮仍可逐行删除', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [{ name: 'A' }, { name: 'B' }],
    })
    await flushPromises()
    await wait()
    await delBtns(wrapper)[0].trigger('click')
    await flushPromises()
    await wait()
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as Record<string, unknown>[]
    expect(last).toEqual([{ name: 'B' }])
    wrapper.unmount()
  })
})

describe('EngineSubForm 批量删除', () => {
  it('未开启时首列仍为序号列且底部无批量删除按钮', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 2,
    })
    await flushPromises()
    await wait()
    expect(rowChecks(wrapper).length).toBe(0)
    // 序号列照常呈现 1 / 2
    const rows = bodyRows(wrapper)
    expect(rows[0].text()).toContain('1')
    expect(rows[1].text()).toContain('2')
    expect(footerBtns(wrapper).length).toBe(1)
    wrapper.unmount()
  })

  it('开启后首列变为勾选列（含表头全选），底部多出删除按钮且未勾选时禁用', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 2,
      allowBatchRemove: true,
    })
    await flushPromises()
    await wait()
    expect(rowChecks(wrapper).length).toBe(2)
    expect(checkAll(wrapper).exists()).toBe(true)
    const btns = footerBtns(wrapper)
    expect(btns.length).toBe(2)
    expect(btns[1].text()).toContain('删除')
    expect(isDisabled(btns[1])).toBe(true)
    wrapper.unmount()
  })

  it('勾选多行后批量删除一次移除并 emit 剩余行，勾选态随之清空', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      allowBatchRemove: true,
    })
    await flushPromises()
    await wait()
    const checks = rowChecks(wrapper)
    expect(checks.length).toBe(3)
    await checks[0].setValue(true)
    await checks[2].setValue(true)
    await flushPromises()
    await wait()
    const del = footerBtns(wrapper)[1]
    expect(isDisabled(del)).toBe(false)
    // 按钮文字带出勾选行数
    expect(del.text()).toContain('2')
    await del.trigger('click')
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(1)
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as Record<string, unknown>[]
    expect(last).toEqual([{ name: 'B' }])
    // 删除后无勾选行，批量删除回到禁用态
    expect(isDisabled(footerBtns(wrapper)[1])).toBe(true)
    wrapper.unmount()
  })

  it('表头全选后批量删除可删至 0 行（不受最少行数限制）', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      minRows: 2,
      allowBatchRemove: true,
    })
    await flushPromises()
    await wait()
    await checkAll(wrapper).setValue(true)
    await flushPromises()
    await wait()
    await footerBtns(wrapper)[1].trigger('click')
    await flushPromises()
    await wait()
    expect(bodyRows(wrapper).length).toBe(0)
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toEqual([])
    wrapper.unmount()
  })

  it('只读态即使开启也无勾选列与底部入口', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [{ name: 'A' }],
      readonly: true,
      allowBatchRemove: true,
    })
    await flushPromises()
    await wait()
    expect(rowChecks(wrapper).length).toBe(0)
    expect(checkAll(wrapper).exists()).toBe(false)
    expect(wrapper.find('.engine-subform__footer').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('EngineSubForm 底部按钮风格与间距', () => {
  it('新增行按钮文案为「新增」且带图标', async () => {
    const wrapper = mountSubForm({ subFields: [inputSub('name', '名称')], modelValue: [] })
    await flushPromises()
    await wait()
    const btn = addBtn(wrapper)
    expect(btn.text()).toBe('新增')
    expect(btn.find('.el-icon').exists()).toBe(true)
    wrapper.unmount()
  })

  it('新增与批量删除两按钮同风格（均为默认小号按钮，无强弱色差）', async () => {
    const wrapper = mountSubForm({
      subFields: [inputSub('name', '名称')],
      modelValue: [],
      allowBatchRemove: true,
    })
    await flushPromises()
    await wait()
    const [add, del] = footerBtns(wrapper)
    // 两者均不带语义色类型（primary / danger / success 均会造成风格不一致）
    for (const btn of [add, del]) {
      const typeClasses = btn
        .classes()
        .filter((c) => /^el-button--(primary|success|warning|danger|info|text)$/.test(c))
      expect(typeClasses).toEqual([])
      expect(btn.classes()).toContain('el-button--small')
    }
    wrapper.unmount()
  })

  it('两按钮间距仅由 8px gap 控制（抵消 Element Plus 相邻按钮的 12px 左边距）', async () => {
    // jsdom 不计算样式，故以源码断言样式规则（与 subform.test.ts 行间距用例同一手法）
    const src = await readFile(resolve(process.cwd(), SUBFORM_COMPONENT), 'utf-8')
    expect(src).toMatch(/\.engine-subform__footer\s*\{[^}]*gap:\s*8px/)
    expect(src).toMatch(
      /\.engine-subform__footer\s+:deep\(\.el-button \+ \.el-button\)\s*\{[^}]*margin-left:\s*0/,
    )
  })
})
