import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { reactive, toRaw } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElInput, ElInputNumber, ElRadioGroup } from 'element-plus'
import formCreate from '@form-create/element-ui'
import FieldPreview from '@/designer/FieldPreview.vue'
import FieldPalette from '@/designer/FieldPalette.vue'
import FieldList from '@/designer/FieldList.vue'
import PropertyPanel from '@/designer/PropertyPanel.vue'
import OptionsEditor from '@/designer/OptionsEditor.vue'
import FormPropertyPanel from '@/designer/FormPropertyPanel.vue'
import SubmitValidationEditor from '@/designer/SubmitValidationEditor.vue'
import FormDesigner from '@/designer/FormDesigner.vue'
import { registerEngineComponents } from '@/renderer/components'
import { createNode } from '@/designer/schemaOps'
import { fieldTypeLabel } from '@/designer/fieldIcons'
import { schemaToOption } from '@/adapter/toRule'
import { FORM_CONFIG_DEFAULTS } from '@/schema/defaults'
import {
  isSubFormField,
  SCHEMA_VERSION,
  type DataFieldNode,
  type FieldNode,
  type FieldOption,
  type FieldType,
  type FormSchema,
  type TabsFieldNode,
  type TabsTab,
} from '@/schema/types'

registerEngineComponents()

/** FieldList 的标签布局为必填 prop（组件不再持有兜底值），测试统一取契约层缺省值 */
const LABEL_PROPS = {
  labelPosition: FORM_CONFIG_DEFAULTS.labelPosition,
  labelWidth: FORM_CONFIG_DEFAULTS.labelWidth,
}

function mountPreview(node: FieldNode) {
  return mount(FieldPreview, { props: { node }, global: { plugins: [ElementPlus] } })
}

const inputNode: DataFieldNode = {
  type: 'input',
  key: 'a',
  field: 'name',
  title: '姓名',
  placeholder: '请输入姓名',
  value: '张三',
}

describe('画布控件可视化预览', () => {
  it('单行文本渲染真实输入框并呈现默认值与占位', () => {
    const wrapper = mountPreview(inputNode)
    const el = wrapper.find('input')
    expect(el.exists()).toBe(true)
    expect(el.attributes('placeholder')).toBe('请输入姓名')
    expect(el.element.value).toBe('张三')
  })

  it('单选按钮组按选项渲染可视化单选', () => {
    const wrapper = mountPreview({
      type: 'radio',
      key: 'b',
      field: 'type',
      title: '类型',
      options: [
        { label: '标准', value: '标准' },
        { label: '其他', value: '其他' },
      ],
    })
    expect(wrapper.findAll('.el-radio').length).toBe(2)
    expect(wrapper.text()).toContain('标准')
    expect(wrapper.text()).toContain('其他')
  })

  it('选项未配置时给出可视化提示而非空白', () => {
    const wrapper = mountPreview({
      type: 'checkbox',
      key: 'c',
      field: 'x',
      title: 'X',
      options: [],
    })
    expect(wrapper.text()).toContain('请在右侧「选项」中配置')
  })

  it('说明文字以文本块呈现内容', () => {
    const wrapper = mountPreview({
      type: 'text',
      key: 'd',
      title: '填写须知',
      props: { content: '请如实填写' },
    })
    expect(wrapper.text()).toContain('填写须知')
    expect(wrapper.text()).toContain('请如实填写')
  })

  it('数字字段渲染步进器控件', () => {
    const wrapper = mountPreview({
      type: 'number',
      key: 'e',
      field: 'num',
      title: '数量',
      props: { precision: 0, step: 2 },
    })
    expect(wrapper.find('.el-input-number').exists()).toBe(true)
    expect(wrapper.find('.el-input-number__increase').exists()).toBe(true)
  })
})

describe('字段面板三分组 (6.1)', () => {
  function mountPalette() {
    return mount(FieldPalette, {
      global: {
        plugins: [ElementPlus],
        provide: { fieldFactory: (type: FieldType) => createNode(type, []) },
      },
    })
  }

  it('展示常用/高级/布局三分组，子表单归于高级', () => {
    const wrapper = mountPalette()
    const titles = wrapper.findAll('.field-palette__title').map((t) => t.text())
    expect(titles).toEqual(['常用', '高级', '布局'])
    expect(wrapper.text()).toContain('子表单')
  })

  it('从高级字段拖入子表单形成空容器（不预置子字段）', () => {
    const node = createNode('subform', [])
    expect(isSubFormField(node)).toBe(true)
    if (isSubFormField(node)) {
      expect(node.subFields).toHaveLength(0)
    }
  })
})

describe('属性面板控件类型标识', () => {
  function mountPanel(node: FieldNode | null) {
    return mount(PropertyPanel, {
      props: { node, dataFields: [] },
      global: { plugins: [ElementPlus] },
    })
  }

  it('最顶部标明当前控件类型（中文名 + 类型标识 + 分组）', () => {
    const wrapper = mountPanel(inputNode)
    const header = wrapper.find('.property-panel__header')
    expect(header.exists()).toBe(true)
    expect(header.text()).toContain(fieldTypeLabel('input'))
    expect(header.text()).toContain('input')
    expect(header.text()).toContain('数据字段')
  })

  it('布局字段标注为布局字段', () => {
    const wrapper = mountPanel({ type: 'divider', key: 'f', title: '分割线' })
    expect(wrapper.find('.property-panel__header').text()).toContain('布局字段')
  })

  it('未选中字段时不渲染类型头部', () => {
    const wrapper = mountPanel(null)
    expect(wrapper.find('.property-panel__header').exists()).toBe(false)
  })
})

describe('子表单画布预览 (6.4)', () => {
  function subFormNode() {
    return {
      type: 'subform',
      key: 'sf',
      field: 'items',
      title: '采购明细',
      required: true,
      subFields: [
        { type: 'input', key: 'sf_name', field: 'name', title: '产品名称', required: true },
        { type: 'number', key: 'sf_qty', field: 'qty', title: '数量' },
      ],
      props: { minRows: 1, maxRows: 200 },
    }
  }

  function mountList(fields: FieldNode[]) {
    return mount(FieldList, {
      props: { fields, selectedKey: '', ...LABEL_PROPS },
      global: { plugins: [ElementPlus] },
    })
  }

  it('卡片不再展示类型名，改以标签块合并呈现标题与字段标识', () => {
    const wrapper = mountList([subFormNode() as unknown as FieldNode])
    expect(wrapper.find('.field-card__type').exists()).toBe(false)
    const label = wrapper.find('.field-card__field-label')
    expect(label.text()).toContain('采购明细')
    expect(label.text()).toContain('items')
  })

  it('以明细表格呈现，列头来自子字段标题', () => {
    const wrapper = mountList([subFormNode() as unknown as FieldNode])
    const titles = wrapper.findAll('.subform-col__title').map((t) => t.text())
    expect(titles).toEqual(['产品名称', '数量'])
  })

  it('必填子字段列头带必填标识', () => {
    const wrapper = mountList([subFormNode() as unknown as FieldNode])
    const cols = wrapper.findAll('.subform-col')
    expect(cols[0].find('.subform-col__star').exists()).toBe(true)
    expect(cols[1].find('.subform-col__star').exists()).toBe(false)
  })

  it('点击子字段列选中该子字段而非产生填报数据', async () => {
    const wrapper = mountList([subFormNode() as unknown as FieldNode])
    const cols = wrapper.findAll('.subform-col')
    await cols[1].trigger('click')
    const sel = wrapper.emitted('select')
    expect(sel).toBeTruthy()
    expect(sel![sel!.length - 1]).toEqual(['sf_qty'])
    // 预览单元格屏蔽交互（不产生填报数据）
    expect(wrapper.find('.subform-col__cell').exists()).toBe(true)
  })

  it('删除子字段后预览立即移除对应列', async () => {
    const fields = reactive<unknown[]>([subFormNode()]) as unknown as FieldNode[]
    const wrapper = mount(FieldList, {
      props: { fields, selectedKey: '', ...LABEL_PROPS },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.findAll('.subform-col')).toHaveLength(2)
    ;(fields[0] as any).subFields.splice(1, 1)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.subform-col')).toHaveLength(1)
    expect(wrapper.find('.subform-col__title').text()).toBe('产品名称')
  })
})

/* ---------------- 画布字段宽度栅格与标签对齐 ---------------- */

describe('画布字段宽度与标签对齐', () => {
  function mountList(
    fields: FieldNode[],
    labelPosition: 'top' | 'left' | 'right' = LABEL_PROPS.labelPosition,
    labelWidth = LABEL_PROPS.labelWidth,
  ) {
    return mount(FieldList, {
      props: { fields, selectedKey: '', labelPosition, labelWidth },
      global: { plugins: [ElementPlus] },
    })
  }

  it('常用字段按宽度换算 24 栅格 span（1/2 -> span 12）', () => {
    const wrapper = mountList([
      { type: 'input', key: 'a', field: 'a', title: 'A', width: 50 } as FieldNode,
    ])
    expect(wrapper.find('.field-card').attributes('style')).toContain('span 12')
  })

  it('未设置宽度的字段默认整行 span 24', () => {
    const wrapper = mountList([{ type: 'input', key: 'a', field: 'a', title: 'A' } as FieldNode])
    expect(wrapper.find('.field-card').attributes('style')).toContain('span 24')
  })

  it('布局字段卡片恒整行 span 24', () => {
    const wrapper = mountList([{ type: 'divider', key: 'd', title: 'D' } as FieldNode])
    expect(wrapper.find('.field-card').attributes('style')).toContain('span 24')
  })

  it('标签对齐随 labelPosition 呈现为对应类名', () => {
    const fields = [{ type: 'input', key: 'a', field: 'a', title: 'A' } as FieldNode]
    expect(mountList(fields, 'top').find('.field-card__body').classes()).toContain('is-label-top')
    expect(mountList(fields, 'left').find('.field-card__body').classes()).toContain('is-label-left')
    expect(mountList(fields, 'right').find('.field-card__body').classes()).toContain(
      'is-label-right',
    )
  })

  it('必填星号位置随标签对齐联动（仅左对齐把星号移到标签右侧）', async () => {
    // 星号移位由 CSS order 实现（jsdom 不注入 SFC 样式），故断言样式规则本身
    const src = await readFile(resolve(process.cwd(), 'src/designer/FieldList.vue'), 'utf-8')
    expect(src).toMatch(/\.is-label-left\s+\.field-card__required\s*\{[^}]*order:\s*1/)
    // 右对齐与顶部对齐不施加移位规则，星号维持在标签左侧（保持现状）
    expect(src).not.toMatch(/\.is-label-(?:right|top)\s+\.field-card__required/)
  })

  it('标签块上行标题、下行字段标识', () => {
    const wrapper = mountList([
      { type: 'input', key: 'a', field: 'user_name', title: '用户名', required: true } as FieldNode,
    ])
    const label = wrapper.find('.field-card__field-label')
    expect(label.find('.field-card__label-title').text()).toContain('用户名')
    expect(label.find('.field-card__label-code').text()).toBe('user_name')
    expect(label.find('.field-card__required').exists()).toBe(true)
  })
})

/* -------- 画布与填报态的缺省标签宽度同源（design.md D6） -------- */

describe('画布与填报态所见一致（缺省标签宽度同源）', () => {
  /** 一份未声明 labelWidth 的文档：新建表单与导入的既有文档都可能是这种形态 */
  function schemaWithoutLabelWidth(): FormSchema {
    return {
      id: 'lw',
      name: '缺省宽度',
      version: SCHEMA_VERSION,
      fields: [{ type: 'input', key: 'a', field: 'a', title: 'A' }],
      formConfig: { labelPosition: 'right', size: 'default' },
    } as unknown as FormSchema
  }

  function mountWith(schema: FormSchema) {
    return mount(FormDesigner, {
      props: { modelValue: schema },
      global: { plugins: [ElementPlus, formCreate] },
      attachTo: document.body,
    })
  }

  /** 「表单属性」面板中标签宽度输入框的显示值 */
  function panelWidthValue(wrapper: ReturnType<typeof mount>) {
    const el = wrapper.findComponent(FormPropertyPanel).find('.el-input-number input').element
    return (el as HTMLInputElement).value
  }

  it('未声明 labelWidth 时画布卡片、表单属性面板与填报态 rule 均为 125', async () => {
    const schema = schemaWithoutLabelWidth()
    const wrapper = mountWith(schema)
    await flushPromises()
    // 画布侧：FieldList 的必填 prop 由 resolveFormConfig 解析而来（组件自身已无兜底值）
    const list = wrapper.findComponent(FieldList)
    expect(list.props('labelWidth')).toBe(FORM_CONFIG_DEFAULTS.labelWidth)
    expect(list.props('labelWidth')).toBe(125)
    expect(list.props('labelPosition')).toBe('right')
    // 面板侧：同一解析值作为标签宽度输入框的显示值
    expect(panelWidthValue(wrapper)).toBe('125')
    // 填报态侧：同一份文档经适配层输出的标签宽度与上两者同源
    expect(schemaToOption(schema).form.labelWidth).toBe('125px')
    // 解析只作用于读取：画布渲染后文档仍不含 labelWidth（未被回填）
    expect(Object.keys(schema.formConfig ?? {})).not.toContain('labelWidth')
    wrapper.unmount()
  })

  it('显式声明的标签宽度优先于缺省值（画布、面板与填报态一致）', async () => {
    const schema = schemaWithoutLabelWidth()
    schema.formConfig = { ...schema.formConfig, labelWidth: 200 }
    const wrapper = mountWith(schema)
    await flushPromises()
    expect(wrapper.findComponent(FieldList).props('labelWidth')).toBe(200)
    expect(panelWidthValue(wrapper)).toBe('200')
    expect(schemaToOption(schema).form.labelWidth).toBe('200px')
    wrapper.unmount()
  })
})

/* ---------------- 字段宽度离散档位（属性面板） ---------------- */

describe('属性面板字段宽度离散档位', () => {
  function mountPanel(node: FieldNode) {
    return mount(PropertyPanel, {
      props: { node, dataFields: [] },
      global: { plugins: [ElementPlus] },
    })
  }
  function itemByLabel(wrapper: ReturnType<typeof mountPanel>, label: string) {
    return wrapper
      .findAll('.el-form-item')
      .find(
        (it) =>
          it.find('.el-form-item__label').exists() &&
          it.find('.el-form-item__label').text().includes(label),
      )!
  }

  it('提供离散宽度选项且选中档位写回百分比', async () => {
    const wrapper = mountPanel({ type: 'input', key: 'a', field: 'a', title: 'A', width: 50 })
    const item = itemByLabel(wrapper, '字段宽度')
    expect(item.find('.el-form-item__label').text()).toContain('字段宽度')
    item.findComponent(ElRadioGroup).vm.$emit('update:modelValue', 25)
    await flushPromises()
    const patches = wrapper.emitted('patch') as unknown[][]
    const last = patches[patches.length - 1][0] as Record<string, unknown>
    expect(last).toEqual({ width: 25 })
  })

  it('布局字段不展示字段宽度控件', () => {
    const wrapper = mountPanel({ type: 'divider', key: 'd', title: 'D' } as FieldNode)
    const has = wrapper
      .findAll('.el-form-item')
      .some((it) => it.find('.el-form-item__label').text().includes('字段宽度'))
    expect(has).toBe(false)
  })
})

describe('子表单属性配置 (6.6)', () => {
  /** 按 el-form-item 标签定位其内的数字输入器（不依赖组件出现顺序） */
  function numberByLabel(wrapper: ReturnType<typeof mount>, label: string) {
    const item = wrapper
      .findAll('.el-form-item')
      .find(
        (it) =>
          it.find('.el-form-item__label').exists() &&
          it.find('.el-form-item__label').text().includes(label),
      )
    return item ? item.findComponent(ElInputNumber) : undefined
  }

  function subFormPanel(rowProps: Record<string, unknown> = {}) {
    return mount(PropertyPanel, {
      props: {
        node: {
          type: 'subform',
          key: 'sf',
          field: 'items',
          title: '明细',
          subFields: [{ type: 'input', key: 's1', field: 'f1', title: '产品名称' }],
          props: { minRows: 1, maxRows: 200, ...rowProps },
        },
        dataFields: [],
      },
      global: { plugins: [ElementPlus] },
    })
  }

  it('选中子表单标为数据字段并列出行数配置与子字段入口', () => {
    const wrapper = subFormPanel()
    expect(wrapper.find('.property-panel__header').text()).toContain('数据字段')
    expect(wrapper.text()).toContain('行数范围')
    expect(wrapper.text()).toContain('产品名称')
  })

  it('最多行数超硬上限 500 时按 500 落库并提示', async () => {
    const wrapper = subFormPanel()
    numberByLabel(wrapper, '最多行数')!.vm.$emit('update:modelValue', 600)
    await flushPromises()
    const patches = wrapper.emitted('patch') as unknown[][]
    const last = patches[patches.length - 1][0] as { props: Record<string, unknown> }
    expect(last.props.maxRows).toBe(500)
    expect(wrapper.find('.property-panel__warn').exists()).toBe(true)
    expect(wrapper.find('.property-panel__warn').text()).toContain('500')
  })

  it('最多行数在缺省 200 与硬上限 500 之间时原值落库且无钳制提示', async () => {
    const wrapper = subFormPanel()
    numberByLabel(wrapper, '最多行数')!.vm.$emit('update:modelValue', 300)
    await flushPromises()
    const patches = wrapper.emitted('patch') as unknown[][]
    const last = patches[patches.length - 1][0] as { props: Record<string, unknown> }
    expect(last.props.maxRows).toBe(300)
    expect(wrapper.find('.property-panel__warn').exists()).toBe(false)
  })

  it('未配置 maxRows 时属性面板按缺省 200 展示', () => {
    const wrapper = mount(PropertyPanel, {
      props: {
        node: {
          type: 'subform',
          key: 'sf',
          field: 'items',
          title: '明细',
          subFields: [],
          props: { minRows: 0 },
        },
        dataFields: [],
      },
      global: { plugins: [ElementPlus] },
    })
    expect(numberByLabel(wrapper, '最多行数')!.props('modelValue')).toBe(200)
  })

  it('初始行数大于最多行数时给出可见冲突提示', () => {
    const wrapper = subFormPanel({ minRows: 5, maxRows: 3 })
    expect(wrapper.find('.property-panel__error').exists()).toBe(true)
    expect(wrapper.find('.property-panel__error').text()).toContain('不能大于')
  })

  it('合法行数配置写入 minRows/maxRows', async () => {
    const wrapper = subFormPanel()
    numberByLabel(wrapper, '初始行数')!.vm.$emit('update:modelValue', 2)
    numberByLabel(wrapper, '最多行数')!.vm.$emit('update:modelValue', 5)
    await flushPromises()
    const patches = wrapper.emitted('patch') as unknown[][]
    const props = patches.map((p) => (p[0] as { props?: Record<string, unknown> }).props)
    expect(props.some((x) => x?.minRows === 2)).toBe(true)
    expect(props.some((x) => x?.maxRows === 5)).toBe(true)
  })
})

/* ---------------- 整表提交校验编辑器 (3.2) ---------------- */

describe('整表提交校验编辑器 (3.2)', () => {
  const dataFields = [{ type: 'input', key: 'a', field: 'a', title: 'A' }] as unknown as any[]
  function mountEditor(modelValue: unknown[] = []) {
    return mount(SubmitValidationEditor, {
      props: { modelValue: modelValue as never, dataFields: dataFields as never },
      global: { plugins: [ElementPlus] },
    })
  }
  function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
    return wrapper.findAll('button').find((b) => b.text().includes(text))
  }
  function lastPayload(wrapper: ReturnType<typeof mount>) {
    const emitted = wrapper.emitted('update:modelValue') as unknown[][]
    return emitted[emitted.length - 1][0] as any[]
  }

  it('添加规则上抛一条含单条件、空文案的规则', async () => {
    const wrapper = mountEditor([])
    await buttonByText(wrapper, '添加提交校验规则')!.trigger('click')
    const last = lastPayload(wrapper)
    expect(last).toHaveLength(1)
    expect(last[0].conditions).toHaveLength(1)
    expect(last[0].message).toBe('')
    expect(last[0].logic).toBe('and')
  })

  it('删除规则上抛空列表', async () => {
    const wrapper = mountEditor([
      { logic: 'and', conditions: [{ field: 'a', operator: 'eq', value: '' }], message: 'x' },
    ])
    await buttonByText(wrapper, '删除')!.trigger('click')
    expect(lastPayload(wrapper)).toHaveLength(0)
  })

  it('提示文案为空时展示可见校验提示', () => {
    const wrapper = mountEditor([
      { logic: 'and', conditions: [{ field: 'a', operator: 'eq', value: '' }], message: '' },
    ])
    expect(wrapper.text()).toContain('提示文案不可为空')
  })
})

/* ---------------- 表单属性面板 (3.3) ---------------- */

describe('表单属性面板 (3.3)', () => {
  const dataFields = [{ type: 'input', key: 'a', field: 'a', title: 'A' }] as unknown as any[]
  function mountPanel(config: Record<string, unknown> = {}) {
    return mount(FormPropertyPanel, {
      props: { config: config as never, dataFields: dataFields as never },
      global: { plugins: [ElementPlus] },
    })
  }
  function itemByLabel(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper
      .findAll('.el-form-item')
      .find(
        (it) =>
          it.find('.el-form-item__label').exists() &&
          it.find('.el-form-item__label').text().includes(label),
      )!
  }
  function lastPatch(wrapper: ReturnType<typeof mount>) {
    const patches = wrapper.emitted('patch') as unknown[][]
    return patches[patches.length - 1][0] as Record<string, unknown>
  }

  it('渲染表单布局/提交按钮两段（提交校验暂缓，不提供入口）', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('表单布局')
    expect(wrapper.text()).toContain('提交按钮')
    expect(wrapper.text()).not.toContain('提交校验')
    expect(wrapper.findComponent(SubmitValidationEditor).exists()).toBe(false)
  })

  it('标签对齐写回 labelPosition', async () => {
    const wrapper = mountPanel()
    itemByLabel(wrapper, '标签对齐')
      .findComponent(ElRadioGroup)
      .vm.$emit('update:modelValue', 'top')
    await flushPromises()
    expect(lastPatch(wrapper)).toEqual({ labelPosition: 'top' })
  })

  it('控件尺寸写回 size', async () => {
    const wrapper = mountPanel()
    itemByLabel(wrapper, '控件尺寸')
      .findComponent(ElRadioGroup)
      .vm.$emit('update:modelValue', 'large')
    await flushPromises()
    expect(lastPatch(wrapper)).toEqual({ size: 'large' })
  })

  it('提交按钮文字合并写回 submitButton', async () => {
    const wrapper = mountPanel({ submitButton: { hidden: true } })
    itemByLabel(wrapper, '提交按钮文字')
      .findComponent(ElInput)
      .vm.$emit('update:modelValue', '确认提交')
    await flushPromises()
    expect(lastPatch(wrapper).submitButton).toEqual({ hidden: true, text: '确认提交' })
  })

  it('提交校验暂缓：表单属性面板不再上抛 submitValidation', () => {
    const wrapper = mountPanel()
    // 面板不再渲染提交校验编辑器，也不会因编辑器变更上抛 submitValidation
    expect(wrapper.findComponent(SubmitValidationEditor).exists()).toBe(false)
    const patches = wrapper.emitted('patch') as unknown[][] | undefined
    expect(
      (patches ?? []).every(
        (p) => (p[0] as Record<string, unknown>)?.submitValidation === undefined,
      ),
    ).toBe(true)
  })
})

/* ---------------- 设计器属性面板双 tab 与选中上下文联动 (4.1/4.2/4.3) ---------------- */

describe('设计器属性面板双 tab (4.1/4.2/4.3)', () => {
  function mountDesigner(fields: unknown[]) {
    return mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'd',
          name: '设计',
          version: SCHEMA_VERSION,
          fields,
        } as never,
      },
      global: { plugins: [ElementPlus, formCreate] },
      attachTo: document.body,
    })
  }
  function activeTab(wrapper: ReturnType<typeof mount>) {
    return wrapper.find('.form-designer__right .el-tabs__item.is-active').text()
  }

  it('初始无选中激活「表单属性」并展示表单级配置', async () => {
    const wrapper = mountDesigner([{ type: 'input', key: 'a', field: 'a', title: 'A' }])
    await flushPromises()
    expect(activeTab(wrapper)).toBe('表单属性')
    expect(wrapper.text()).toContain('表单布局')
    wrapper.unmount()
  })

  it('选中字段切换到「字段属性」tab', async () => {
    const wrapper = mountDesigner([{ type: 'input', key: 'a', field: 'a', title: 'A' }])
    await flushPromises()
    await wrapper.find('.field-card').trigger('click')
    await flushPromises()
    expect(activeTab(wrapper)).toBe('字段属性')
    wrapper.unmount()
  })

  it('点击画布空白回到「表单属性」tab', async () => {
    const wrapper = mountDesigner([{ type: 'input', key: 'a', field: 'a', title: 'A' }])
    await flushPromises()
    await wrapper.find('.field-card').trigger('click')
    await flushPromises()
    await wrapper.find('.form-designer__canvas').trigger('click')
    await flushPromises()
    expect(activeTab(wrapper)).toBe('表单属性')
    wrapper.unmount()
  })

  it('点击字段列表下方空白同样清空选中（空白由列表容器承载，非外层画布）', async () => {
    const wrapper = mountDesigner([
      { type: 'input', key: 'a', field: 'a', title: 'A' },
      { type: 'input', key: 'b', field: 'b', title: 'B' },
    ])
    await flushPromises()
    await wrapper.findAll('.field-card')[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.field-card.is-selected').attributes('data-field-key')).toBe('b')
    expect(activeTab(wrapper)).toBe('字段属性')
    // 字段少时列表容器（FieldList 根，min-height 撑满画布）下方留有大片空白：点它而非外层画布
    const list = wrapper.find('.form-designer__list')
    expect(list.exists()).toBe(true)
    await list.trigger('click')
    await flushPromises()
    expect(wrapper.find('.field-card.is-selected').exists()).toBe(false)
    expect(activeTab(wrapper)).toBe('表单属性')
    wrapper.unmount()
  })

  it('点击字段卡片本体（含其预览控件区）选中该卡片，选中态不被清空', async () => {
    const wrapper = mountDesigner([
      { type: 'input', key: 'a', field: 'a', title: 'A' },
      { type: 'input', key: 'b', field: 'b', title: 'B' },
    ])
    await flushPromises()
    await wrapper.findAll('.field-card')[0].trigger('click')
    await flushPromises()
    expect(wrapper.find('.field-card.is-selected').attributes('data-field-key')).toBe('a')
    expect(activeTab(wrapper)).toBe('字段属性')
    // 卡片内部的控件区同属选中语义：事件冒泡到画布后由 closest 守卫拦下，不误清选中
    await wrapper.findAll('.field-card')[0].find('.field-card__control').trigger('click')
    await flushPromises()
    expect(wrapper.find('.field-card.is-selected').attributes('data-field-key')).toBe('a')
    expect(activeTab(wrapper)).toBe('字段属性')
    wrapper.unmount()
  })

  it('无选中字段时字段属性面板展示空态不报错', async () => {
    const wrapper = mountDesigner([])
    await flushPromises()
    expect(wrapper.text()).toContain('请选择一个字段')
    wrapper.unmount()
  })
})

/* ---------------- 多标签页页签新增与删除入口 ---------------- */

describe('多标签页页签新增与删除入口', () => {
  function mountList(fields: FieldNode[]) {
    return mount(FieldList, {
      props: { fields, ...LABEL_PROPS },
      global: { plugins: [ElementPlus] },
    })
  }
  const newTabs = () => createNode('tabs', []) as TabsFieldNode

  it('页签栏提供「+」新增入口并冒泡 add-tab', async () => {
    const node = newTabs()
    const wrapper = mountList([node])
    const addBtn = wrapper.find('.el-tabs__new-tab')
    expect(addBtn.exists()).toBe(true)
    await addBtn.trigger('click')
    expect(wrapper.emitted('add-tab')).toEqual([[node.key]])
  })

  it('多个页签时展示删除入口并携带页签 key 冒泡', async () => {
    const node = newTabs()
    const wrapper = mountList([node])
    const closeBtns = wrapper.findAll('.is-icon-close')
    expect(closeBtns).toHaveLength(node.tabs.length)
    await closeBtns[1].trigger('click')
    expect(wrapper.emitted('remove-tab')).toEqual([[node.key, node.tabs[1].key]])
  })

  it('仅剩一个页签时不再提供删除入口（但仍可新增）', () => {
    const node = newTabs()
    node.tabs.splice(1)
    const wrapper = mountList([node])
    expect(wrapper.find('.el-tabs__new-tab').exists()).toBe(true)
    expect(wrapper.find('.is-icon-close').exists()).toBe(false)
  })

  it('嵌套页签容器的 add-tab 可逐层冒泡到根列表', async () => {
    const outer = newTabs()
    const inner = newTabs()
    outer.tabs[0].fields.push(inner)
    const wrapper = mountList([outer])
    await flushPromises()
    // findAll 为文档序：[0] 外层卡片、[1] 嵌套在页签内的内层卡片
    const cards = wrapper.findAll('.field-card__tabs')
    expect(cards).toHaveLength(2)
    await cards[1].find('.el-tabs__new-tab').trigger('click')
    expect(wrapper.emitted('add-tab')).toEqual([[inner.key]])
  })

  it('设计器集成：点击「+」真实追加页签并写回 schema', async () => {
    const node = newTabs()
    const wrapper = mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'd',
          name: '设计',
          version: SCHEMA_VERSION,
          fields: [node],
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus, formCreate] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(node.tabs).toHaveLength(2)
    await wrapper.find('.el-tabs__new-tab').trigger('click')
    await flushPromises()
    expect(node.tabs).toHaveLength(3)
    expect(node.tabs[2].fields).toEqual([])
    // 新页签面板已渲染，可继续往里拖字段
    expect(wrapper.findAll('.el-tabs__item').map((i) => i.text())).toContain('标签页3')
    wrapper.unmount()
  })

  it('设计器集成：删除页签连同其字段一并移除', async () => {
    const node = newTabs()
    const input = createNode('input', []) as DataFieldNode
    node.tabs[1].fields.push(input)
    const wrapper = mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'd',
          name: '设计',
          version: SCHEMA_VERSION,
          fields: [node],
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus, formCreate] },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.findAll('.is-icon-close')[1].trigger('click')
    await flushPromises()
    expect(node.tabs).toHaveLength(1)
    expect(node.tabs[0].fields).toHaveLength(0)
    wrapper.unmount()
  })
})

/* ---------------- 页签名称在属性面板修改 ---------------- */

describe('页签名称在字段属性面板修改', () => {
  function itemByLabel(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper
      .findAll('.el-form-item')
      .find(
        (it) =>
          it.find('.el-form-item__label').exists() &&
          it.find('.el-form-item__label').text().includes(label),
      )!
  }
  const newTabs = () => createNode('tabs', []) as TabsFieldNode
  function mountPanel(node: FieldNode) {
    return mount(PropertyPanel, {
      props: { node, dataFields: [] },
      global: { plugins: [ElementPlus] },
    })
  }

  it('选中 tabs 时直接列出各页签名称输入框，不单设分组标题', () => {
    const node = newTabs()
    const wrapper = mountPanel(node)
    const labels = wrapper.findAll('.el-form-item__label').map((l) => l.text())
    expect(labels.filter((t) => t.includes('标签页'))).toHaveLength(node.tabs.length)
    expect(itemByLabel(wrapper, '标签页 1').find('input').element.value).toBe('标签页1')
    expect(itemByLabel(wrapper, '标签页 2').exists()).toBe(true)
    // 名称项直接落在「字段属性」下，不再额外插入分组小标题
    expect(wrapper.findAll('.property-panel__section').map((s) => s.text())).not.toContain('标签页')
  })

  it('多标签页不展示无作用的「标题」项，数据字段仍展示', () => {
    const tabsLabels = mountPanel(newTabs())
      .findAll('.el-form-item__label')
      .map((l) => l.text())
    expect(tabsLabels.some((t) => t.startsWith('标题'))).toBe(false)
    const inputLabels = mountPanel(inputNode)
      .findAll('.el-form-item__label')
      .map((l) => l.text())
    expect(inputLabels.some((t) => t.startsWith('标题'))).toBe(true)
  })

  it('改名以新 tabs 数组写回，其他页签对象与 fields 引用不变', async () => {
    const node = newTabs()
    const kept = { type: 'input', key: 'f1', field: 'f1', title: 'F' } as FieldNode
    node.tabs[1].fields.push(kept)
    const wrapper = mountPanel(node)
    await itemByLabel(wrapper, '标签页 1').find('input').setValue('基本信息')
    const patches = wrapper.emitted('patch') as unknown[][]
    const last = patches[patches.length - 1][0] as { tabs: TabsTab[] }
    expect(last.tabs.map((t) => t.title)).toEqual(['基本信息', '标签页2'])
    // 未改名页签保持原对象引用（其 fields 数组同一性随之保留），已拖入字段不受扰动
    expect(toRaw(last.tabs[1])).toBe(node.tabs[1])
    expect(last.tabs[1].fields).toEqual([kept])
  })

  it('非 tabs 字段不展示页签名称项', () => {
    expect(mountPanel(inputNode).text()).not.toContain('标签页 1')
    expect(mountPanel({ type: 'text', key: 't', title: 'T' } as FieldNode).text()).not.toContain(
      '标签页 1',
    )
  })

  it('点击画布页签头可选中容器（提供改名入口）', async () => {
    const node = newTabs()
    const wrapper = mount(FieldList, {
      props: { fields: [node], ...LABEL_PROPS },
      global: { plugins: [ElementPlus] },
    })
    await wrapper.findAll('.el-tabs__item')[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[node.key]])
  })

  it('设计器集成：选中页签后在字段属性改名，写回 schema 并同步画布标题', async () => {
    const node = newTabs()
    const wrapper = mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'd',
          name: '设计',
          version: SCHEMA_VERSION,
          fields: [node],
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus, formCreate] },
      attachTo: document.body,
    })
    await flushPromises()
    await wrapper.findAll('.form-designer__canvas .el-tabs__item')[1].trigger('click')
    await flushPromises()
    await itemByLabel(wrapper, '标签页 2').find('input').setValue('付款信息')
    await flushPromises()
    expect(node.tabs[1].title).toBe('付款信息')
    expect(node.tabs[0].title).toBe('标签页1')
    expect(wrapper.findAll('.form-designer__canvas .el-tabs__item')[1].text()).toBe('付款信息')
    wrapper.unmount()
  })
})

/* ---------------- 画布多标签页默认选中首个页签 ---------------- */

describe('画布多标签页默认选中首个页签', () => {
  function mountList(fields: FieldNode[]) {
    return mount(FieldList, {
      props: { fields, ...LABEL_PROPS },
      global: { plugins: [ElementPlus] },
    })
  }
  const newTabs = () => createNode('tabs', []) as TabsFieldNode
  const activeItems = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('.el-tabs__item.is-active')

  it('挂载即选中首个页签（避开 el-tabs 内部缺省名 "0" 导致的无页签选中）', () => {
    const node = newTabs()
    const wrapper = mountList([node])
    expect(activeItems(wrapper)).toHaveLength(1)
    expect(activeItems(wrapper)[0].text()).toBe(node.tabs[0].title)
  })

  it('点击其他页签后选中项随之切换', async () => {
    const node = newTabs()
    const wrapper = mountList([node])
    await wrapper.findAll('.el-tabs__item')[1].trigger('click')
    expect(activeItems(wrapper)).toHaveLength(1)
    expect(activeItems(wrapper)[0].text()).toBe(node.tabs[1].title)
  })

  it('嵌套容器由各自的子列表托管，内外层均默认选中首个页签', async () => {
    const outer = newTabs()
    const inner = newTabs()
    inner.tabs[0].title = '内层首页'
    outer.tabs[0].fields.push(inner)
    const wrapper = mountList([outer])
    await flushPromises()
    expect(wrapper.findAll('.field-card__tabs')).toHaveLength(2)
    // el-tabs 的 DOM 序为「内容在前、页签头在后」，故文档序上内层页签头先于外层页签头出现
    const actives = wrapper.findAll('.el-tabs__item.is-active').map((i) => i.text())
    expect(actives).toEqual(['内层首页', outer.tabs[0].title])
  })

  it('删除当前激活页签后回落到首个可用页签', async () => {
    const node = newTabs()
    node.tabs[0].title = '基本信息'
    node.tabs[1].title = '付款信息'
    const wrapper = mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'd',
          name: '设计',
          version: SCHEMA_VERSION,
          fields: [node],
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus, formCreate] },
      attachTo: document.body,
    })
    await flushPromises()
    const canvasItems = () => wrapper.findAll('.form-designer__canvas .el-tabs__item')
    await canvasItems()[1].trigger('click')
    await flushPromises()
    expect(canvasItems()[1].classes()).toContain('is-active')
    await wrapper.findAll('.form-designer__canvas .is-icon-close')[1].trigger('click')
    await flushPromises()
    expect(node.tabs).toHaveLength(1)
    expect(canvasItems()).toHaveLength(1)
    expect(canvasItems()[0].classes()).toContain('is-active')
    expect(canvasItems()[0].text()).toBe('基本信息')
    wrapper.unmount()
  })
})

/* ---------------- 应用外壳：不再提供设计器/渲染器模式切换 ---------------- */

describe('应用外壳单一视图', () => {
  const APP_COMPONENT = 'src/App.vue'

  it('不再渲染「表单设计器 / 表单填报渲染器」底部模式切换页签', async () => {
    const src = await readFile(resolve(process.cwd(), APP_COMPONENT), 'utf-8')
    expect(src).not.toContain('表单设计器')
    expect(src).not.toContain('表单填报渲染器')
    // 填报态仍由设计器工具栏「预览」进入，外壳不再自行挂渲染器
    expect(src).not.toContain('FormRenderer')
    expect(src).toContain('FormDesigner')
  })
})

/* -------- 选项类字段：默认选中与顺序调整（属性面板「类型配置 → 选项」） -------- */

describe('选项编辑器的默认选中与顺序调整', () => {
  function optionList(count = 3): FieldOption[] {
    return Array.from({ length: count }, (_, i) => ({
      label: `选项${i + 1}`,
      value: `选项${i + 1}`,
    }))
  }

  function mountEditor(props: { multiple?: boolean; defaultValue?: unknown } = {}) {
    return mount(OptionsEditor, {
      props: { modelValue: optionList(), ...props },
      global: { plugins: [ElementPlus] },
    })
  }

  type EditorWrapper = ReturnType<typeof mountEditor>
  const rows = (w: EditorWrapper) => w.findAll('.options-editor__row')
  /** 默认列内的勾选控件（单选为 radio，多选为 checkbox） */
  const defaultBox = (w: EditorWrapper, index: number) =>
    rows(w)[index].find('.options-editor__default input')
  /** 行内操作按钮：[上移, 下移, 删除] */
  const opButtons = (w: EditorWrapper, index: number) =>
    rows(w)[index].findAll('.options-editor__ops button')
  const isChecked = (w: EditorWrapper, index: number) =>
    (defaultBox(w, index).element as HTMLInputElement).checked
  /** 末次写回的选项列表 / 默认值 */
  const lastOptions = (w: EditorWrapper) =>
    w.emitted('update:modelValue')!.at(-1)![0] as FieldOption[]
  const lastDefault = (w: EditorWrapper) => w.emitted('update:defaultValue')!.at(-1)![0]

  it('表头标明默认 / 名称 / 值 / 顺序四列', () => {
    const head = mountEditor().find('.options-editor__head')
    expect(head.exists()).toBe(true)
    expect(head.text()).toContain('默认')
    expect(head.text()).toContain('名称')
    expect(head.text()).toContain('顺序 / 操作')
  })

  it('单选形态用 radio、多选形态用 checkbox 呈现默认列', () => {
    const single = mountEditor()
    expect(single.findAll('.options-editor__row input[type="radio"]')).toHaveLength(3)
    expect(single.findAll('.options-editor__row input[type="checkbox"]')).toHaveLength(0)
    const multi = mountEditor({ multiple: true })
    expect(multi.findAll('.options-editor__row input[type="checkbox"]')).toHaveLength(3)
    expect(multi.findAll('.options-editor__row input[type="radio"]')).toHaveLength(0)
  })

  it('已有默认值呈现为选中态', () => {
    const single = mountEditor({ defaultValue: '选项2' })
    expect([isChecked(single, 0), isChecked(single, 1), isChecked(single, 2)]).toEqual([
      false,
      true,
      false,
    ])
    const multi = mountEditor({ multiple: true, defaultValue: ['选项1', '选项3'] })
    expect([isChecked(multi, 0), isChecked(multi, 1), isChecked(multi, 2)]).toEqual([
      true,
      false,
      true,
    ])
  })

  it('选中某项即写回默认值，单选不叠加', async () => {
    const wrapper = mountEditor()
    await defaultBox(wrapper, 1).trigger('change')
    expect(lastDefault(wrapper)).toBe('选项2')
    await defaultBox(wrapper, 0).trigger('change')
    expect(lastDefault(wrapper)).toBe('选项1')
  })

  it('选中默认项时不打出组件事件校验告警（model 不以 undefined 绑定）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mountEditor()
    await defaultBox(wrapper, 0).trigger('change')
    await flushPromises()
    const messages = warn.mock.calls.map((call) => String(call[0]))
    expect(messages.some((m) => m.includes('Invalid event arguments'))).toBe(false)
    warn.mockRestore()
  })

  it('多选在既有默认值上增删', async () => {
    const wrapper = mountEditor({ multiple: true, defaultValue: ['选项1'] })
    await defaultBox(wrapper, 1).trigger('change')
    expect(lastDefault(wrapper)).toEqual(['选项1', '选项2'])
    await defaultBox(wrapper, 0).trigger('change')
    expect(lastDefault(wrapper)).toEqual([])
  })

  it('已设默认时提供「清除默认」，未设时不提供', async () => {
    expect(mountEditor().text()).not.toContain('清除默认')
    const wrapper = mountEditor({ defaultValue: '选项2' })
    const clear = wrapper
      .findAll('.options-editor__footer button')
      .find((b) => b.text() === '清除默认')
    expect(clear).toBeTruthy()
    await clear!.trigger('click')
    expect(lastDefault(wrapper)).toBeUndefined()
  })

  it('多选清除默认归一为空数组', async () => {
    const wrapper = mountEditor({ multiple: true, defaultValue: ['选项1'] })
    const clear = wrapper
      .findAll('.options-editor__footer button')
      .find((b) => b.text() === '清除默认')
    await clear!.trigger('click')
    expect(lastDefault(wrapper)).toEqual([])
  })

  it('上移/下移调整选项顺序，首行不可上移、末行不可下移', async () => {
    const wrapper = mountEditor()
    expect(opButtons(wrapper, 0)[0].attributes('disabled')).toBeDefined()
    expect(opButtons(wrapper, 2)[1].attributes('disabled')).toBeDefined()
    expect(opButtons(wrapper, 1)[0].attributes('disabled')).toBeUndefined()

    await opButtons(wrapper, 1)[0].trigger('click')
    expect(lastOptions(wrapper).map((o) => o.label)).toEqual(['选项2', '选项1', '选项3'])

    await opButtons(wrapper, 1)[1].trigger('click')
    expect(lastOptions(wrapper).map((o) => o.label)).toEqual(['选项1', '选项3', '选项2'])
  })

  it('排序不影响默认选中（默认值按选项值而非下标绑定）', async () => {
    const wrapper = mountEditor({ defaultValue: '选项2' })
    await opButtons(wrapper, 1)[0].trigger('click')
    expect(lastOptions(wrapper).map((o) => o.value)).toEqual(['选项2', '选项1', '选项3'])
    // 仅写回选项顺序，SHALL NOT 因排序而改动默认值
    expect(wrapper.emitted('update:defaultValue')).toBeUndefined()
  })

  it('改选项值时同步默认值，不留悬空引用', async () => {
    const wrapper = mountEditor({ defaultValue: '选项2' })
    await rows(wrapper)[1].find('input[placeholder="值"]').setValue('加急')
    expect(lastOptions(wrapper)[1]).toEqual({ label: '选项2', value: '加急' })
    expect(lastDefault(wrapper)).toBe('加急')
  })

  it('删除已选默认的选项后，默认值不再引用它', async () => {
    const wrapper = mountEditor({ defaultValue: '选项2' })
    await opButtons(wrapper, 1)[2].trigger('click')
    expect(lastOptions(wrapper)).toHaveLength(2)
    expect(lastDefault(wrapper)).toBeUndefined()
  })

  it('删除未选默认的选项不影响默认值', async () => {
    const wrapper = mountEditor({ defaultValue: '选项2' })
    await opButtons(wrapper, 0)[2].trigger('click')
    expect(lastOptions(wrapper)).toHaveLength(2)
    expect(lastDefault(wrapper)).toBe('选项2')
  })
})

describe('属性面板将默认选中与顺序写回字段节点', () => {
  const OPTION_TYPES = ['radio', 'select', 'checkbox', 'selectMultiple'] as const

  function optionNode(type: (typeof OPTION_TYPES)[number], value?: unknown): DataFieldNode {
    return {
      type,
      key: 'o',
      field: 'order_type',
      title: '订单类型',
      options: [
        { label: '标准', value: '标准' },
        { label: '加急', value: '加急' },
      ],
      value,
    } as DataFieldNode
  }

  function mountPanel(node: DataFieldNode) {
    return mount(PropertyPanel, {
      props: { node, dataFields: [] },
      global: { plugins: [ElementPlus] },
    })
  }

  const lastPatch = (w: ReturnType<typeof mountPanel>) =>
    w.emitted('patch')!.at(-1)![0] as Record<string, unknown>

  it('默认值项指向选项的「默认」列而非文本输入', () => {
    const wrapper = mountPanel(optionNode('radio'))
    expect(wrapper.text()).toContain('在下方「选项」的「默认」列中勾选')
  })

  it('四个选项类字段均提供默认列，多选类为 checkbox、单选类为 radio', () => {
    const controlOf = (type: (typeof OPTION_TYPES)[number]) => {
      const w = mountPanel(optionNode(type))
      return w.findAll('.options-editor__row input[type="checkbox"]').length ? 'checkbox' : 'radio'
    }
    expect(OPTION_TYPES.map(controlOf)).toEqual(['radio', 'radio', 'checkbox', 'checkbox'])
  })

  it('勾选默认后以 patch 写回节点 value', async () => {
    const wrapper = mountPanel(optionNode('radio'))
    await wrapper.findAll('.options-editor__row input[type="radio"]')[1].trigger('change')
    expect(lastPatch(wrapper)).toEqual({ value: '加急' })
  })

  it('调整顺序后以 patch 写回节点 options', async () => {
    const wrapper = mountPanel(optionNode('radio'))
    await wrapper.findAll('.options-editor__row .options-editor__ops button')[1].trigger('click')
    const options = lastPatch(wrapper).options as FieldOption[]
    expect(options.map((o) => o.label)).toEqual(['加急', '标准'])
  })

  it('画布预览呈现默认选中（所见即所得）', () => {
    const wrapper = mountPreview(optionNode('radio', '加急') as unknown as FieldNode)
    const radios = wrapper.findAll('.el-radio input')
    expect(radios).toHaveLength(2)
    expect((radios[0].element as HTMLInputElement).checked).toBe(false)
    expect((radios[1].element as HTMLInputElement).checked).toBe(true)
  })
})
