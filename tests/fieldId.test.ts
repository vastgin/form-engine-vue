import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import PropertyPanel from '@/designer/PropertyPanel.vue'
import FormDesigner from '@/designer/FormDesigner.vue'
import { exportSchema, importSchema } from '@/designer/schemaIO'
import { validateSchema } from '@/schema/validate'
import {
  FIELD_ID_PATTERN,
  SQL_RESERVED_WORDS,
  checkFieldId,
  fieldIdErrorMessage,
  isReservedFieldId,
} from '@/schema/fieldId'
import { SCHEMA_VERSION, type FieldNode, type FormSchema } from '@/schema/types'
import { sampleSchema } from '@/demo/sampleSchema'

/**
 * 字段标识命名契约：仅字母/数字/下划线 + 禁止系统保留字与注入关键词（防注入与转义问题）。
 * - 纯函数：正则、保留字判定（整体匹配、忽略大小写）、错误文案；
 * - 结构校验：主表字段、标签页内字段、子表单自身与子字段均受约束（error 级）；
 * - 设计器：属性面板即时提示 + 保存/发布前置拦截。
 * 对应 specs/form-schema「字段标识命名合法性」、form-designer「字段属性配置」。
 */

/** 构造仅含若干数据字段的最小 schema */
function schemaWith(fields: FieldNode[]): FormSchema {
  return { id: 'f1', name: '命名校验', version: SCHEMA_VERSION, fields }
}

/** 结构校验中的 error 级问题 */
function errorsOf(schema: FormSchema): string[] {
  return validateSchema(schema)
    .issues.filter((i) => i.severity === 'error')
    .map((i) => i.message)
}

describe('字段标识正则与保留字判定', () => {
  it('字母、数字与下划线组合均合法', () => {
    for (const id of ['name', 'order_no', 'user_name', 'qty2', 'A_b_1', 'x']) {
      expect(FIELD_ID_PATTERN.test(id)).toBe(true)
      expect(checkFieldId(id)).toBeNull()
    }
  })

  it('空格、标点、中划线与 SQL 片段被拒绝', () => {
    for (const id of ['order no', 'order-no', 'a;drop table x', "' or 1=1 --", '名称', 'a.b']) {
      expect(checkFieldId(id)).toContain('仅允许字母、数字与下划线')
    }
  })

  it('空值与非字符串判为不能为空', () => {
    expect(checkFieldId('')).toBe('不能为空')
    expect(checkFieldId(undefined)).toBe('不能为空')
    expect(checkFieldId(123)).toBe('不能为空')
  })

  it('保留字命中忽略大小写', () => {
    for (const id of ['insert', 'INSERT', 'Insert', 'user', 'in', 'null']) {
      expect(isReservedFieldId(id)).toBe(true)
      expect(checkFieldId(id)).toContain('系统保留字')
    }
  })

  it('框架保留列（主键/租户/审计/流程）不可用作字段标识', () => {
    for (const id of ['id', 'parent_id', 'tenant_id', 'creator', 'update_time', 'deleted']) {
      expect(isReservedFieldId(id)).toBe(true)
      expect(fieldIdErrorMessage(id)).toContain('系统保留字')
    }
  })

  it('保留字判定容忍首尾空格，但带空格的标识本身已不合法（优先报格式问题）', () => {
    expect(isReservedFieldId(' insert ')).toBe(true)
    expect(checkFieldId(' insert ')).toContain('仅允许字母、数字与下划线')
  })

  it('仅整体匹配：含保留字字根的正常命名不被误伤', () => {
    for (const id of [
      'user_name',
      'is_deleted',
      'insert_count',
      'delete_flag',
      'exec_time',
      'version_no',
      'id_card',
      'product_sn',
      'selection',
      'amount',
    ]) {
      expect(isReservedFieldId(id)).toBe(false)
      expect(checkFieldId(id)).toBeNull()
    }
  })

  it('黑名单未收录的常用业务词仍可用作标识', () => {
    for (const id of ['value', 'name', 'type', 'status', 'comment', 'year', 'month', 'count']) {
      expect(checkFieldId(id)).toBeNull()
    }
  })

  it('黑名单自身规范：无重复、已小写归一且形如标识（清单是手工维护的策略数据）', () => {
    const lowered = SQL_RESERVED_WORDS.map((w) => w.toLowerCase())
    expect(new Set(lowered).size).toBe(lowered.length)
    expect(SQL_RESERVED_WORDS.filter((w) => w !== w.trim().toLowerCase())).toEqual([])
    expect(SQL_RESERVED_WORDS.filter((w) => !FIELD_ID_PATTERN.test(w))).toEqual([])
  })

  it('错误文案带上标识本身，便于在多个字段间定位', () => {
    expect(fieldIdErrorMessage('insert')).toBe(
      '字段标识 "insert" 命名不合法："INSERT" 是系统保留字/关键词，请改用其他名称',
    )
    expect(fieldIdErrorMessage('a b')).toContain('字段标识 "a b" 命名不合法')
    expect(fieldIdErrorMessage('')).toBe('字段标识不能为空')
    expect(fieldIdErrorMessage('dept')).toBeNull()
  })
})

describe('结构校验拒绝非法字段标识', () => {
  it('主表字段标识为保留字时报 error 并指向该路径', () => {
    const schema = schemaWith([
      { type: 'input', key: 'a', field: 'insert', title: 'A' },
    ] as unknown as FieldNode[])
    expect(validateSchema(schema).valid).toBe(false)
    const issue = validateSchema(schema).issues.find((i) => i.severity === 'error')!
    expect(issue.path).toBe('fields[0]')
    expect(issue.message).toContain('命名不合法')
  })

  it('含空格与 SQL 片段的标识同样被拒绝', () => {
    const schema = schemaWith([
      { type: 'input', key: 'a', field: 'a; drop table x', title: 'A' },
    ] as unknown as FieldNode[])
    expect(errorsOf(schema).join('|')).toContain('仅允许字母、数字与下划线')
  })

  it('多标签页内字段、子表单自身与子字段均在校验范围内', () => {
    const schema = schemaWith([
      {
        type: 'tabs',
        key: 'tb',
        title: '分组',
        tabs: [
          {
            key: 't1',
            title: '页1',
            fields: [{ type: 'input', key: 'i', field: 'delete', title: '页内' }],
          },
        ],
      },
      {
        type: 'subform',
        key: 'sf',
        field: 'items',
        title: '明细',
        subFields: [{ type: 'input', key: 's1', field: 'update', title: '子字段' }],
      },
    ] as unknown as FieldNode[])
    const messages = errorsOf(schema).join('|')
    expect(messages).toContain('字段标识 "delete"')
    expect(messages).toContain('字段标识 "update"')
    const paths = validateSchema(schema)
      .issues.filter((i) => i.severity === 'error')
      .map((i) => i.path)
    expect(paths).toContain('fields[0].tabs[0].fields[0]')
    expect(paths).toContain('fields[1].subFields[0]')
  })

  it('子表单自身标识非法时报错指向子表单路径', () => {
    const schema = schemaWith([
      { type: 'subform', key: 'sf', field: 'exec', title: '明细', subFields: [] },
    ] as unknown as FieldNode[])
    const issue = validateSchema(schema).issues.find((i) => i.severity === 'error')!
    expect(issue.path).toBe('fields[0]')
    expect(issue.message).toContain('"exec"')
  })

  it('合法命名不产生任何问题；示例表单仍通过校验（防误伤回归）', () => {
    expect(
      errorsOf(schemaWith([{ type: 'input', key: 'a', field: 'dept', title: '部门' }])),
    ).toEqual([])
    expect(validateSchema(sampleSchema).issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('命名非法与标识重复可同时报出（不互相吞掉）', () => {
    const schema = schemaWith([
      { type: 'input', key: 'a', field: 'insert', title: 'A' },
      { type: 'input', key: 'b', field: 'insert', title: 'B' },
    ] as unknown as FieldNode[])
    const messages = errorsOf(schema)
    expect(messages.filter((m) => m.includes('命名不合法'))).toHaveLength(2)
    expect(messages.some((m) => m.includes('字段标识冲突'))).toBe(true)
  })

  it('含非法标识的 schema 无法通过导入（导出再导入即被拒）', () => {
    const schema = schemaWith([
      { type: 'input', key: 'a', field: 'user', title: 'A' },
    ] as unknown as FieldNode[])
    expect(() => importSchema(exportSchema(schema))).toThrow(/命名不合法/)
  })
})

/* ----------------------------- 设计器可见反馈 ----------------------------- */

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

/** 挂载属性面板（选一个带指定字段标识的普通文本字段） */
function mountField(field: string, extra: Record<string, unknown> = {}) {
  return mount(PropertyPanel, {
    props: {
      node: { type: 'input', key: 'a', field, title: 'A', ...extra } as unknown as FieldNode,
      dataFields: [],
    },
    global: { plugins: [ElementPlus] },
  })
}

describe('属性面板的字段标识即时提示', () => {
  it('保留字标识以错误文案提示，并指明改用其他名称', () => {
    const wrapper = mountField('insert')
    const error = wrapper.find('.property-panel__error')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('系统保留字')
  })

  it('非法字符标识同样即时提示', () => {
    const wrapper = mountField('order no')
    expect(wrapper.find('.property-panel__error').text()).toContain('仅允许字母、数字与下划线')
  })

  it('合法标识不出现错误提示，标识输入框带命名规则说明', () => {
    const wrapper = mountField('user_name')
    expect(wrapper.find('.property-panel__error').exists()).toBe(false)
    // 仅「字段标识」输入框带 title 说明
    const titled = wrapper.findAll('input').filter((i) => i.attributes('title') !== undefined)
    expect(titled).toHaveLength(1)
    expect(titled[0].attributes('title')).toContain('仅允许字母、数字与下划线')
  })

  it('命名非法提示优先于「已发布锁定」说明（两者不同时抢占）', () => {
    const wrapper = mountField('insert', { published: true })
    expect(wrapper.find('.property-panel__error').exists()).toBe(true)
    expect(wrapper.find('.property-panel__hint--tight').exists()).toBe(false)
  })

  it('布局字段无字段标识，不参与命名校验', () => {
    const wrapper = mount(PropertyPanel, {
      props: {
        node: { type: 'divider', key: 'd', title: '分隔' } as unknown as FieldNode,
        dataFields: [],
      },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find('.property-panel__error').exists()).toBe(false)
  })
})

describe('保存与发布被非法命名拦截', () => {
  function mountDesigner(fields: FieldNode[]) {
    return mount(FormDesigner, {
      props: {
        modelValue: {
          id: 'badname',
          name: '命名拦截',
          version: SCHEMA_VERSION,
          fields,
          formConfig: {},
        } as unknown as FormSchema,
      },
      global: { plugins: [ElementPlus] },
    })
  }

  /** 按文案定位设计器工具栏按钮 */
  function toolbarBtn(wrapper: ReturnType<typeof mount>, text: string) {
    return wrapper.findAll('.form-designer__toolbar button').find((b) => b.text() === text)
  }

  it('保存被拦截并给出可定位的命名提示，不写本地存储', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error')
    const wrapper = mountDesigner([
      { type: 'input', key: 'a', field: 'insert', title: 'A' },
    ] as unknown as FieldNode[])
    await toolbarBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    expect(localStorage.getItem('form-engine:schema:badname')).toBeNull()
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('字段标识命名不合法，无法保存')
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('"insert"')
    wrapper.unmount()
  })

  it('发布同样被拦截：不打标记也不置发布态', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error')
    const fields = [
      { type: 'input', key: 'a', field: 'update', title: 'A' },
    ] as unknown as FieldNode[]
    const wrapper = mountDesigner(fields)
    await toolbarBtn(wrapper, '发布')!.trigger('click')
    await flushPromises()
    const s = (wrapper.vm as unknown as { schema: FormSchema }).schema
    expect(s.formConfig?.published).toBeUndefined()
    expect(fields[0].published).toBeUndefined()
    expect(String(errSpy.mock.calls.at(-1)![0])).toContain('字段标识命名不合法，无法发布')
    wrapper.unmount()
  })
})
