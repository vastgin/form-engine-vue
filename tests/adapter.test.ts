import { describe, expect, it } from 'vitest'
import { createContext, schemaToOption, schemaToRules } from '@/adapter/toRule'
import { buildValidate, PATTERN_PRESETS } from '@/adapter/validation'
import { SCHEMA_VERSION, type DataFieldNode, type FormSchema } from '@/schema/types'

function schemaWith(fields: FormSchema['fields']): FormSchema {
  return { id: 'f', name: 'n', version: SCHEMA_VERSION, fields }
}

function dataNode(partial: Partial<DataFieldNode>): DataFieldNode {
  return { type: 'input', key: 'k', field: 'f', title: 'T', ...partial } as DataFieldNode
}

describe('适配层 schema -> rule (4.1)', () => {
  it('映射单行文本为 form-create input rule', () => {
    const rules = schemaToRules(schemaWith([dataNode({ field: 'name', title: '姓名' })]))
    expect(rules).toHaveLength(1)
    expect(rules[0].type).toBe('input')
    expect(rules[0].field).toBe('name')
    expect(rules[0].title).toBe('姓名')
  })

  it('多行文本映射为 input + textarea', () => {
    const rules = schemaToRules(schemaWith([dataNode({ type: 'textarea', props: { rows: 4 } })]))
    expect(rules[0].type).toBe('input')
    expect(rules[0].props.type).toBe('textarea')
    expect(rules[0].props.rows).toBe(4)
  })

  it('字段宽度百分比转换为栅格 span', () => {
    const rules = schemaToRules(schemaWith([dataNode({ width: 50 })]))
    expect(rules[0].col.span).toBe(12)
  })

  it('布局字段映射为 native 自定义组件', () => {
    const rules = schemaToRules(
      schemaWith([
        { type: 'divider', key: 'd', title: '分割' },
        { type: 'text', key: 't', props: { content: '说明' } },
      ]),
    )
    expect(rules[0].type).toBe('engine-divider')
    expect(rules[0].native).toBe(true)
    expect(rules[0].field).toBeUndefined()
    expect(rules[1].type).toBe('engine-text')
    expect(rules[1].props.content).toBe('说明')
  })

  it('多标签页容器递归展开子字段', () => {
    const rules = schemaToRules(
      schemaWith([
        {
          type: 'tabs',
          key: 'tabs',
          tabs: [
            { key: 'tb1', title: '页1', fields: [dataNode({ field: 'inner', title: '内嵌' })] },
          ],
        },
      ]),
    )
    expect(rules[0].type).toBe('engine-tabs')
    // 默认选中首个页签：把首个页签的 name 透传给容器（el-tabs 内部缺省名 "0" 与 tab.key 不匹配）
    expect(rules[0].props.activeName).toBe('tb1')
    const pane = rules[0].children[0]
    expect(pane.type).toBe('engine-tab-pane')
    expect(pane.props.name).toBe('tb1')
    expect(pane.children[0].field).toBe('inner')
  })

  it('未知字段类型生成占位 rule', () => {
    const rules = schemaToRules(schemaWith([{ type: 'weird', key: 'w' } as unknown as any]))
    expect(rules[0].type).toBe('engine-unknown')
  })

  it('schemaToOption 映射 formConfig', () => {
    const option = schemaToOption(
      schemaWith([]) && {
        id: 'f',
        name: 'n',
        version: SCHEMA_VERSION,
        fields: [],
        formConfig: { labelPosition: 'top', labelWidth: 100 },
      },
    )
    expect(option.form.labelPosition).toBe('top')
    // labelWidth 统一由 resolveFormConfig 解析后换算为 px 字符串（不再透传裸数字）
    expect(option.form.labelWidth).toBe('100px')
    expect(option.submitBtn).toBe(false)
  })

  it('schemaToOption 的标签宽度缺省值来自 resolveFormConfig（缺省 125px）', () => {
    // 未提供 formConfig 时输出唯一缺省宽度
    expect(schemaToOption(schemaWith([])).form.labelWidth).toBe('125px')
    // 显式声明时按声明值换算
    expect(
      schemaToOption({ ...schemaWith([]), formConfig: { labelWidth: 90 } }).form.labelWidth,
    ).toBe('90px')
  })

  it('schemaToOption 透传标签左对齐（left 不被折叠为 right）', () => {
    const option = schemaToOption({
      id: 'f',
      name: 'n',
      version: SCHEMA_VERSION,
      fields: [],
      formConfig: { labelPosition: 'left', labelWidth: 120 },
    })
    expect(option.form.labelPosition).toBe('left')
  })

  it('必填星号位置随标签对齐联动（左对齐时星号在标签右侧）', () => {
    const asteriskOf = (labelPosition?: 'left' | 'right' | 'top') =>
      schemaToOption({
        id: 'f',
        name: 'n',
        version: SCHEMA_VERSION,
        fields: [],
        formConfig: labelPosition ? { labelPosition } : {},
      }).form.requireAsteriskPosition
    // 左对齐：标签靠左，星号移到标签文字右侧（el-form-item 的 asterisk-right）
    expect(asteriskOf('left')).toBe('right')
    // 右对齐与顶部对齐：保持现状（星号在标签左侧）
    expect(asteriskOf('right')).toBe('left')
    expect(asteriskOf('top')).toBe('left')
    // 未配置标签对齐（缺省右对齐）同样星号在左
    expect(asteriskOf(undefined)).toBe('left')
  })
})

describe('字段渲染细化 (6.1/6.2/6.3)', () => {
  it('数字字段映射为 inputNumber 且带精度', () => {
    const rules = schemaToRules(schemaWith([dataNode({ type: 'number', props: { precision: 2 } })]))
    expect(rules[0].type).toBe('inputNumber')
    expect(rules[0].props.precision).toBe(2)
  })

  it('日期字段按类型输出格式', () => {
    const dateRules = schemaToRules(
      schemaWith([dataNode({ type: 'date', props: { dateType: 'date' } })]),
    )
    expect(dateRules[0].type).toBe('datePicker')
    expect(dateRules[0].props.valueFormat).toBe('YYYY-MM-DD')
    const dtRules = schemaToRules(
      schemaWith([dataNode({ type: 'date', props: { dateType: 'datetime' } })]),
    )
    expect(dtRules[0].props.valueFormat).toBe('YYYY-MM-DD HH:mm:ss')
  })

  it('下拉框单选与下拉复选框多选', () => {
    const single = schemaToRules(
      schemaWith([dataNode({ type: 'select', options: [{ label: 'A', value: 'a' }] })]),
    )
    expect(single[0].type).toBe('select')
    expect(single[0].props.multiple).toBeFalsy()
    expect(single[0].options).toHaveLength(1)

    const multi = schemaToRules(schemaWith([dataNode({ type: 'selectMultiple', options: [] })]))
    expect(multi[0].type).toBe('select')
    expect(multi[0].props.multiple).toBe(true)
  })

  it('成员/部门字段从注入数据源构建可搜索 select', () => {
    const ctx = createContext({
      dataSources: {
        members: [{ label: '张三', value: 'u1' }],
        departments: [{ label: '销售部', value: 'd1' }],
      },
    })
    const memberRules = schemaToRules(schemaWith([dataNode({ type: 'member' })]), ctx)
    expect(memberRules[0].type).toBe('select')
    expect(memberRules[0].options).toEqual([{ label: '张三', value: 'u1' }])
    expect(memberRules[0].props.filterable).toBe(true)

    const deptMulti = schemaToRules(schemaWith([dataNode({ type: 'departmentMultiple' })]), ctx)
    expect(deptMulti[0].props.multiple).toBe(true)
    expect(deptMulti[0].options).toEqual([{ label: '销售部', value: 'd1' }])
  })

  it('只读上下文使字段禁用', () => {
    const ctx = createContext({ readonly: true })
    const rules = schemaToRules(schemaWith([dataNode({})]), ctx)
    expect(rules[0].props.disabled).toBe(true)
  })
})

describe('校验规则映射 (5.1)', () => {
  it('required 生成必填规则', () => {
    const v = buildValidate(dataNode({ required: true }))
    expect(v[0]).toMatchObject({ required: true })
  })

  it('多选必填使用 array 类型', () => {
    const v = buildValidate(dataNode({ type: 'checkbox', required: true }), true)
    expect(v[0]).toMatchObject({ required: true, type: 'array' })
  })

  it('必填规则不连带类型判定（否则数字值会被判为未填而报必填）', () => {
    const v = buildValidate(dataNode({ type: 'number', required: true }))
    // type: 'required' 为 async-validator 中与值类型无关的「是否有值」校验器
    expect(v[0]).toMatchObject({ required: true, type: 'required' })
  })

  it('maxLength/min 映射为对应规则', () => {
    const v = buildValidate(
      dataNode({
        validate: [
          { type: 'maxLength', value: 20 },
          { type: 'min', value: 0 },
        ],
      }),
    )
    expect(v.some((r) => r.max === 20)).toBe(true)
    expect(v.some((r) => r.type === 'number' && r.min === 0)).toBe(true)
  })

  it('pattern 预设映射为正则', () => {
    const v = buildValidate(dataNode({ validate: [{ type: 'pattern', preset: 'phone' }] }))
    expect(v[0].pattern).toBe(PATTERN_PRESETS.phone)
  })

  it('自定义非法正则被忽略而不抛错', () => {
    const v = buildValidate(
      dataNode({ validate: [{ type: 'pattern', preset: 'custom', value: '(' }] }),
    )
    expect(v).toHaveLength(0)
  })

  it('rule 中的 required 不与 node.required 重复', () => {
    const v = buildValidate(
      dataNode({ required: true, validate: [{ type: 'required', message: 'x' }] }),
    )
    expect(v.filter((r) => r.required)).toHaveLength(1)
  })
})
