import { describe, expect, it } from 'vitest'
import { importSchema } from '@/designer/schemaIO'
import { FORM_CONFIG_DEFAULTS, resolveFormConfig } from '@/schema/defaults'
import { SCHEMA_ISSUE_CODES, validateSchema } from '@/schema/validate'
import {
  buildInitialData,
  collectAllFields,
  collectDataFields,
  findDataField,
} from '@/schema/traverse'
import {
  isCommonFieldType,
  isDataField,
  isSubFormField,
  SCHEMA_VERSION,
  SUBFORM_DEFAULT_MAX_ROWS,
  SUBFORM_MAX_ROWS,
  SUBFIELD_ALLOWED_TYPES,
  type FormSchema,
  type SubFormNode,
  type VisibilityRule,
} from '@/schema/types'

function base(fields: FormSchema['fields']): FormSchema {
  return { id: 'f1', name: '测试表单', version: SCHEMA_VERSION, fields }
}

describe('validateSchema - 表单定义文档结构', () => {
  it('接受包含全部必需顶层字段的有效文档', () => {
    const result = validateSchema(base([]))
    expect(result.valid).toBe(true)
  })

  it('缺少 fields 时判定无效', () => {
    const result = validateSchema({ id: 'f1', name: 'n', version: SCHEMA_VERSION })
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.path === 'fields')).toBe(true)
  })

  it('缺少 version 时判定无效', () => {
    const result = validateSchema({ id: 'f1', name: 'n', fields: [] })
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.path === 'version')).toBe(true)
  })
})

describe('validateSchema - 字段标识唯一性', () => {
  it('重复 field 标识报错', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'dup', title: 'A' },
        { type: 'input', key: 'b', field: 'dup', title: 'B' },
      ]),
    )
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.message.includes('冲突'))).toBe(true)
  })

  it('数据字段缺少 field 标识报错', () => {
    const result = validateSchema(base([{ type: 'input', key: 'a', title: 'A' } as unknown as any]))
    expect(result.valid).toBe(false)
  })
})

describe('validateSchema - 布局字段结构', () => {
  it('布局字段无需 field 标识且有效', () => {
    const result = validateSchema(
      base([
        { type: 'divider', key: 'd' },
        { type: 'text', key: 't', props: { content: 'hi' } },
      ]),
    )
    expect(result.valid).toBe(true)
  })

  it('多标签页容器嵌套字段的唯一性跨容器检测', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'x', title: 'A' },
        {
          type: 'tabs',
          key: 'tabs',
          tabs: [
            {
              key: 'tb',
              title: 'T',
              fields: [{ type: 'input', key: 'b', field: 'x', title: 'B' }],
            },
          ],
        },
      ]),
    )
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.message.includes('冲突'))).toBe(true)
  })

  it('多标签页缺少 tabs 数组报错', () => {
    const result = validateSchema(base([{ type: 'tabs', key: 'tabs' } as unknown as any]))
    expect(result.valid).toBe(false)
  })
})

describe('validateSchema - 版本与未知字段类型', () => {
  it('未知字段类型以 warning 容错，不阻断有效性', () => {
    const result = validateSchema(
      base([
        { type: 'unknownXyz', key: 'u' } as unknown as any,
        { type: 'input', key: 'a', field: 'ok', title: 'A' },
      ]),
    )
    expect(result.valid).toBe(true)
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true)
  })
})

/* ------------------------- 子表单（add-subform-field） ------------------------ */

function validSubForm(): SubFormNode {
  return {
    type: 'subform',
    key: 'sf',
    field: 'order_items',
    title: '订单明细',
    props: { minRows: 1, maxRows: 5 },
    subFields: [
      { type: 'input', key: 's1', field: 'product', title: '产品名称' },
      { type: 'number', key: 's2', field: 'qty', title: '数量' },
    ],
  }
}

describe('form-schema 子表单契约 (1.1/1.2)', () => {
  it('SCHEMA_VERSION 升至 1.1 且导出硬上限 500 / 缺省 200 两个行数常量', () => {
    expect(SCHEMA_VERSION).toBe('1.1')
    expect(SUBFORM_MAX_ROWS).toBe(500)
    expect(SUBFORM_DEFAULT_MAX_ROWS).toBe(200)
    expect(SUBFORM_DEFAULT_MAX_ROWS).toBeLessThan(SUBFORM_MAX_ROWS)
  })

  it('子字段白名单仅含 12 类常用字段，排除布局与子表单', () => {
    const allowed = SUBFIELD_ALLOWED_TYPES as string[]
    expect(allowed).toHaveLength(12)
    expect(allowed).toContain('input')
    ;['divider', 'text', 'tabs', 'subform'].forEach((t) => expect(allowed).not.toContain(t))
  })

  it('isSubFormField 守卫识别子表单，且子表单不算常用数据字段', () => {
    const sf = validSubForm()
    expect(isSubFormField(sf)).toBe(true)
    expect(isDataField(sf)).toBe(false)
    expect(isCommonFieldType('subform')).toBe(false)
    expect(isCommonFieldType('input')).toBe(true)
    const sub = sf.subFields[0]
    expect(isSubFormField(sub)).toBe(false)
    expect(isDataField(sub)).toBe(true)
  })
})

describe('validateSchema - 子表单结构 (1.3)', () => {
  it('接受含 input/number 子字段的有效子表单', () => {
    expect(validateSchema(base([validSubForm()])).valid).toBe(true)
  })

  it('缺少 subFields 报结构错误并带节点路径', () => {
    const noSub: any = { type: 'subform', key: 'sf', field: 'items', title: '明细' }
    const result = validateSchema(base([noSub]))
    expect(result.valid).toBe(false)
    expect(
      result.issues.some((i) => i.path.endsWith('.subFields') && i.message.includes('数组')),
    ).toBe(true)
  })

  it('subFields 非数组时报错', () => {
    const node: any = { ...validSubForm(), subFields: 'oops' }
    expect(validateSchema(base([node])).valid).toBe(false)
  })

  it('布局字段作为子字段被拒绝', () => {
    for (const layoutType of ['divider', 'text', 'tabs']) {
      const node: any = { ...validSubForm(), subFields: [{ type: layoutType, key: 'x' }] }
      const result = validateSchema(base([node]))
      expect(result.valid).toBe(false)
      expect(result.issues.some((i) => i.message.includes('不可作为子表单的子字段'))).toBe(true)
    }
  })

  it('子表单嵌套被拒绝', () => {
    const node: any = {
      ...validSubForm(),
      subFields: [{ type: 'subform', key: 'in', field: 'in', title: '内', subFields: [] }],
    }
    const result = validateSchema(base([node]))
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.message.includes('不可嵌套'))).toBe(true)
  })
})

describe('validateSchema - 子字段标识的子表单内作用域 (1.4)', () => {
  it('同一子表单内子字段标识重复报错并指出两个路径', () => {
    const result = validateSchema(
      base([
        {
          ...validSubForm(),
          subFields: [
            { type: 'input', key: 's1', field: 'name', title: '名称' },
            { type: 'input', key: 's2', field: 'name', title: '名称副本' },
          ],
        },
      ]),
    )
    expect(result.valid).toBe(false)
    const conflict = result.issues.find((i) => i.message.includes('冲突'))
    expect(conflict).toBeTruthy()
    expect(conflict!.message).toContain('subFields[0]')
    expect(conflict!.message).toContain('subFields[1]')
  })

  it('子字段与主表字段同名不构成冲突（行数据为独立对象，作用域隔离）', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'dup', title: 'A' },
        { ...validSubForm(), subFields: [{ type: 'input', key: 's', field: 'dup', title: '子' }] },
      ]),
    )
    expect(result.valid).toBe(true)
    expect(result.issues.some((i) => i.message.includes('冲突'))).toBe(false)
  })

  it('不同子表单之间的子字段同名不构成冲突', () => {
    const sf1: any = {
      ...validSubForm(),
      key: 'sf1',
      field: 'items1',
      subFields: [{ type: 'input', key: 'a', field: 'name', title: '名' }],
    }
    const sf2: any = {
      ...validSubForm(),
      key: 'sf2',
      field: 'items2',
      subFields: [{ type: 'input', key: 'b', field: 'name', title: '名' }],
    }
    const result = validateSchema(base([sf1, sf2]))
    expect(result.valid).toBe(true)
    expect(result.issues.some((i) => i.message.includes('冲突'))).toBe(false)
  })

  it('子表单自身仍属表单作用域：与主表字段或另一子表单同名均报错', () => {
    // validSubForm() 自身的 field 为 order_items
    const withMain = validateSchema(
      base([{ type: 'input', key: 'a', field: 'order_items', title: 'A' }, validSubForm()]),
    )
    expect(withMain.valid).toBe(false)
    expect(withMain.issues.some((i) => i.message.includes('冲突'))).toBe(true)

    const sf2: any = { ...validSubForm(), key: 'sf2', field: 'order_items' }
    const withPeer = validateSchema(base([validSubForm(), sf2]))
    expect(withPeer.valid).toBe(false)
    expect(withPeer.issues.some((i) => i.message.includes('冲突'))).toBe(true)
  })

  it('子表单自身与子字段标识合法不冲突时有效', () => {
    const result = validateSchema(
      base([{ type: 'input', key: 'a', field: 'main', title: 'A' }, validSubForm()]),
    )
    expect(result.valid).toBe(true)
  })

  it('子字段标识仍计入已知标识集合，但不得作为条件引用目标（提交校验引用子字段被拒）', () => {
    const schema = base([validSubForm()])
    schema.formConfig = {
      submitValidation: [
        {
          logic: 'and',
          conditions: [{ field: 'product', operator: 'eq', value: 'x' }],
          message: '子字段引用',
        },
      ],
    } as unknown as FormSchema['formConfig']
    const result = validateSchema(schema)
    // 收紧后口径：product 是子表单子字段，运行态整表求值上下文只有主表数据模型，
    // 取不到其值，条件会恒为假——标识合法存在但引用无效
    expect(result.valid).toBe(false)
    const dangling = result.issues.find((i) => i.code === 'SUBMIT_VALIDATION_REF_DANGLING')
    expect(dangling).toBeTruthy()
    expect(dangling!.path).toBe('formConfig.submitValidation[0].conditions[0]')
    // 文案给出可操作的修复方向：明确指出是子表单子字段而非笼统的「不存在」
    expect(dangling!.message).toContain('子表单子字段')
  })
})

describe('traverse - 子表单数据形态 (1.5)', () => {
  it('collectDataFields 含子表单本身但不含其子字段', () => {
    expect(collectDataFields([validSubForm()]).map((f) => f.field)).toEqual(['order_items'])
  })

  it('buildInitialData 为子表单产出空数组，子字段不进入顶层键', () => {
    const data = buildInitialData([validSubForm()])
    expect(data.order_items).toEqual([])
    expect(Object.keys(data)).not.toContain('product')
    expect(Object.keys(data)).not.toContain('qty')
  })

  it('collectAllFields 递归进入 subFields', () => {
    expect(collectAllFields([validSubForm()]).map((n) => n.key)).toEqual(
      expect.arrayContaining(['sf', 's1', 's2']),
    )
  })

  it('findDataField 可定位子表单自身与其子字段', () => {
    const nodes = [validSubForm()]
    expect(findDataField(nodes, 'order_items')?.type).toBe('subform')
    expect(findDataField(nodes, 'product')?.type).toBe('input')
  })
})

/* ---------------- 表单级提交校验（add-designer-property-tabs 1.2） ---------------- */

describe('validateSchema - 表单级提交校验结构 (1.2)', () => {
  function withSubmitValidation(submitValidation: unknown): FormSchema {
    return {
      id: 'f1',
      name: '测试表单',
      version: SCHEMA_VERSION,
      formConfig: { submitValidation } as unknown as FormSchema['formConfig'],
      fields: [
        { type: 'date', key: 's', field: 'start_date', title: '开始' },
        { type: 'date', key: 'e', field: 'end_date', title: '结束' },
      ],
    }
  }

  it('合法提交校验规则不报错', () => {
    const result = validateSchema(
      withSubmitValidation([
        {
          logic: 'and',
          conditions: [{ field: 'end_date', operator: 'lt', value: 'start_date' }],
          message: '结束时间不能早于开始时间',
        },
      ]),
    )
    expect(result.valid).toBe(true)
  })

  it('提示文案为空报结构错误', () => {
    const result = validateSchema(
      withSubmitValidation([
        {
          logic: 'and',
          conditions: [{ field: 'end_date', operator: 'lt', value: '1' }],
          message: '',
        },
      ]),
    )
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.path.endsWith('.message'))).toBe(true)
  })

  it('条件引用不存在的数据字段报结构错误', () => {
    const result = validateSchema(
      withSubmitValidation([
        {
          logic: 'and',
          conditions: [{ field: 'ghost', operator: 'eq', value: 'x' }],
          message: '无效引用',
        },
      ]),
    )
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.message.includes('不存在的数据字段'))).toBe(true)
  })

  it('条件组为空报结构错误', () => {
    const result = validateSchema(
      withSubmitValidation([{ logic: 'and', conditions: [], message: '空条件' }]),
    )
    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.path.endsWith('.conditions'))).toBe(true)
  })

  it('缺省无 submitValidation 时有效', () => {
    expect(validateSchema(base([])).valid).toBe(true)
  })
})

/* ---------------- 已有字段池与发布标记的契约护栏 ---------------- */

describe('form-schema 已有字段池 fieldPool', () => {
  function pooledSubForm(): SubFormNode {
    return {
      ...validSubForm(),
      fieldPool: [
        { type: 'number', key: 'p1', field: 'unit_price', title: '单价' },
        { type: 'textarea', key: 'p2', field: 'remark', title: '备注' },
      ],
    }
  }

  it('池内字段不参与递归遍历（collectAllFields / collectDataFields）', () => {
    const nodes = [pooledSubForm()]
    expect(collectAllFields(nodes).map((n) => n.key)).not.toContain('p1')
    expect(collectAllFields(nodes).map((n) => n.key)).not.toContain('p2')
    expect(collectDataFields(nodes).map((f) => f.field)).toEqual(['order_items'])
  })

  it('池内字段不进入初始数据模型（不产生顶层数据键）', () => {
    const data = buildInitialData([pooledSubForm()])
    expect(Object.keys(data)).not.toContain('unit_price')
    expect(Object.keys(data)).not.toContain('remark')
  })

  it('池内字段不参与 field 唯一性校验（与现有字段同名也不报错）', () => {
    const node = pooledSubForm()
    // 池内 unit_price 与子字段清单中的 product 换成同名，仍应有效（池不在校验范围内）
    node.fieldPool = [{ type: 'number', key: 'p1', field: 'product', title: '单价' }]
    expect(validateSchema(base([node])).valid).toBe(true)
  })

  it('缺省无 fieldPool 时仍为合法子表单（向后兼容）', () => {
    expect((validSubForm() as { fieldPool?: unknown }).fieldPool).toBeUndefined()
    expect(validateSchema(base([validSubForm()])).valid).toBe(true)
  })
})

describe('form-schema 发布标记 published', () => {
  it('字段级与表单级发布标记不影响结构校验有效性', () => {
    const schema = base([
      { type: 'input', key: 'a', field: 'a', title: 'A', published: true },
      {
        ...validSubForm(),
        published: true,
        subFields: [
          { type: 'input', key: 's1', field: 'product', title: '产品名称', published: true },
        ],
      },
    ])
    schema.formConfig = {
      published: true,
      publishedAt: '2026-09-05T00:00:00.000Z',
      // 清单与标记保持一致：发布不变量需有可比对的基线。
      // （有标记而无清单属两者不一致，会被拒并报 PUBLISHED_CATALOG_MISSING）
      publishedFields: [
        { type: 'input', key: 'a', field: 'a', title: 'A', published: true },
        {
          type: 'subform',
          key: 'sf',
          field: 'order_items',
          title: '订单明细',
          published: true,
          subFields: [
            { type: 'input', key: 's1', field: 'product', title: '产品名称', published: true },
          ],
        },
      ],
    } as unknown as FormSchema['formConfig']
    expect(validateSchema(schema).valid).toBe(true)
  })

  it('缺省无发布标记时按未发布处理且文档有效', () => {
    const schema = base([{ type: 'input', key: 'a', field: 'a', title: 'A' }])
    expect((schema.fields[0] as { published?: unknown }).published).toBeUndefined()
    expect(schema.formConfig?.published).toBeUndefined()
    expect(validateSchema(schema).valid).toBe(true)
  })

  it('发布后子字段标识重复仍报错（锁定不豁免唯一性）', () => {
    const node: SubFormNode = {
      ...validSubForm(),
      published: true,
      subFields: [
        { type: 'input', key: 's1', field: 'product', title: 'A', published: true },
        { type: 'input', key: 's2', field: 'product', title: 'B', published: true },
      ],
    }
    expect(validateSchema(base([node])).valid).toBe(false)
  })

  it('已发布字段清单不参与字段标识唯一性校验（清单不是字段树）', () => {
    const schema = base([{ type: 'input', key: 'a', field: 'name', title: 'A' }])
    schema.formConfig = {
      published: true,
      publishedFields: [
        // 与画布字段同标识的条目（清单不参与比对，故不构成冲突）与一个仅存于清单的字段
        { type: 'input', key: 'old', field: 'name', title: 'A', published: true },
        { type: 'number', key: 'old2', field: 'qty', title: '数量', published: true },
      ],
    } as unknown as FormSchema['formConfig']
    const result = validateSchema(schema)
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(result.valid).toBe(true)
  })
})

/* --------------- 表单级配置缺省值的单一来源（harden-designer-contracts） --------------- */

describe('resolveFormConfig - 表单级配置缺省值的单一来源', () => {
  it('缺省标签宽度为 125，其余布局项亦取唯一缺省值', () => {
    expect(FORM_CONFIG_DEFAULTS).toEqual({
      labelPosition: 'right',
      labelWidth: 125,
      size: 'default',
    })
    const resolved = resolveFormConfig(undefined)
    expect(resolved.labelWidth).toBe(125)
    expect(resolved.labelPosition).toBe('right')
    expect(resolved.size).toBe('default')
  })

  it('显式声明的布局项覆盖缺省值', () => {
    expect(resolveFormConfig({ labelWidth: 200 }).labelWidth).toBe(200)
    expect(resolveFormConfig({ labelPosition: 'top' }).labelPosition).toBe('top')
    expect(resolveFormConfig({ size: 'small' }).size).toBe('small')
  })

  it('只读入参：解析不回填文档（往返后仍不含 labelWidth 键）', () => {
    const config = {}
    resolveFormConfig(config)
    expect(Object.keys(config)).not.toContain('labelWidth')
    expect(Object.keys(config)).toHaveLength(0)
  })
})

/* --------------- 结构校验问题的机器可读分类（harden-designer-contracts） --------------- */

/** 同时含字段标识冲突、非法命名与缺少 name 三类问题的文档 */
function dirtySchema(): FormSchema {
  return {
    id: 'f1',
    // 故意缺失 name
    version: SCHEMA_VERSION,
    fields: [
      { type: 'input', key: 'a', field: 'dup', title: 'A' },
      { type: 'input', key: 'b', field: 'dup', title: 'B' },
      { type: 'input', key: 'c', field: 'a-b', title: 'C' },
    ],
  } as unknown as FormSchema
}

describe('validateSchema - 结构校验问题的机器可读分类', () => {
  it('每条问题都带封闭集合内的分类码，且冲突与非法命名各出现一次', () => {
    const result = validateSchema(dirtySchema())
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThanOrEqual(3)
    // 每条 code 均属于封闭取值集合（不在集合内即说明产出点归类遗漏或码值漂移）
    for (const issue of result.issues) {
      expect(SCHEMA_ISSUE_CODES).toContain(issue.code)
    }
    const codes = result.issues.map((i) => i.code)
    expect(codes.filter((c) => c === 'FIELD_ID_CONFLICT')).toHaveLength(1)
    expect(codes.filter((c) => c === 'INVALID_FIELD_NAME')).toHaveLength(1)
    expect(codes).toContain('MISSING_NAME')
    // path 仍被保留（不得因新增 code 而丢弃定位信息）
    const conflict = result.issues.find((i) => i.code === 'FIELD_ID_CONFLICT')
    expect(conflict?.path).toBeTruthy()
  })

  it('字段级问题带 fieldKey，表单级问题不带（无对应卡片）', () => {
    const result = validateSchema(dirtySchema())
    // 冲突在后出现的那一方上报，其 key 可直接用于画布定位
    expect(result.issues.find((i) => i.code === 'FIELD_ID_CONFLICT')?.fieldKey).toBe('b')
    expect(result.issues.find((i) => i.code === 'INVALID_FIELD_NAME')?.fieldKey).toBe('c')
    expect(result.issues.find((i) => i.code === 'MISSING_NAME')?.fieldKey).toBeUndefined()
  })

  it('分类码与文案解耦：同一文档两次校验的 code 序列一致且 message 不含码值', () => {
    const first = validateSchema(dirtySchema())
    const second = validateSchema(dirtySchema())
    expect(second.issues.map((i) => i.code)).toEqual(first.issues.map((i) => i.code))
    // message 中不含任何分类码字面量：消费方无法从文案反推 code，只能读 code 字段
    for (const issue of first.issues) {
      expect(issue.message).not.toContain(issue.code)
    }
  })
})

/* --------------- 条件引用完整性（harden-designer-contracts） --------------- */

/** 构造一条「当 field 等于 'x' 时显示」的显隐规则 */
function showWhen(field: string): VisibilityRule {
  return { logic: 'and', action: 'show', conditions: [{ field, operator: 'eq', value: 'x' }] }
}

describe('validateSchema - 显隐规则的条件引用完整性', () => {
  it('主表字段的悬空引用被拒，并定位到条件项与所属卡片', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'a', title: 'A' },
        { type: 'input', key: 'b', field: 'b', title: 'B', visibleRule: showWhen('ghost') },
      ]),
    )
    expect(result.valid).toBe(false)
    const dangling = result.issues.find((i) => i.code === 'VISIBILITY_REF_DANGLING')
    expect(dangling).toBeTruthy()
    // path 定位到具体条件项下标，fieldKey 指向所属节点（供 UI 点击定位）
    expect(dangling!.path).toBe('fields[1].visibleRule.conditions[0]')
    expect(dangling!.fieldKey).toBe('b')
  })

  it('多标签页内字段的悬空引用被拒，path 含页签层级', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'a', title: 'A' },
        {
          type: 'tabs',
          key: 'tabs',
          tabs: [
            {
              key: 't1',
              title: '页1',
              fields: [
                {
                  type: 'input',
                  key: 'inner',
                  field: 'inner',
                  title: 'I',
                  visibleRule: showWhen('ghost'),
                },
              ],
            },
          ],
        },
      ]),
    )
    const dangling = result.issues.find((i) => i.code === 'VISIBILITY_REF_DANGLING')
    expect(dangling!.path).toBe('fields[1].tabs[0].fields[0].visibleRule.conditions[0]')
    expect(dangling!.fieldKey).toBe('inner')
  })

  it('子表单自身的悬空引用被拒', () => {
    const node = { ...validSubForm(), visibleRule: showWhen('ghost') }
    const result = validateSchema(base([node]))
    const dangling = result.issues.find((i) => i.code === 'VISIBILITY_REF_DANGLING')
    expect(dangling!.path).toBe('fields[0].visibleRule.conditions[0]')
    expect(dangling!.fieldKey).toBe('sf')
  })

  it('子字段的悬空引用被拒，path 含子字段层级', () => {
    const node: SubFormNode = {
      ...validSubForm(),
      subFields: [
        {
          type: 'input',
          key: 's1',
          field: 'product',
          title: '产品',
          visibleRule: showWhen('ghost'),
        },
      ],
    }
    const result = validateSchema(base([node]))
    const dangling = result.issues.find((i) => i.code === 'VISIBILITY_REF_DANGLING')
    expect(dangling!.path).toBe('fields[0].subFields[0].visibleRule.conditions[0]')
    expect(dangling!.fieldKey).toBe('s1')
  })

  it('前向引用合法：A 的规则引用后文定义的 B 不报错', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'a', title: 'A', visibleRule: showWhen('b') },
        { type: 'input', key: 'b', field: 'b', title: 'B' },
      ]),
    )
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('自引用报 VISIBILITY_REF_SELF 且每条条件至多一条问题', () => {
    const result = validateSchema(
      base([{ type: 'input', key: 'a', field: 'a', title: 'A', visibleRule: showWhen('a') }]),
    )
    expect(result.valid).toBe(false)
    expect(result.issues.filter((i) => i.code === 'VISIBILITY_REF_SELF')).toHaveLength(1)
    // 不得因「自引用同时也不在集合内」而重复上报
    expect(result.issues.filter((i) => i.code === 'VISIBILITY_REF_DANGLING')).toHaveLength(0)
  })

  it('子字段自引用优先报为自引用（语义更准确）', () => {
    const node: SubFormNode = {
      ...validSubForm(),
      subFields: [
        {
          type: 'input',
          key: 's1',
          field: 'product',
          title: '产品',
          visibleRule: showWhen('product'),
        },
      ],
    }
    const result = validateSchema(base([node]))
    expect(result.issues.filter((i) => i.code === 'VISIBILITY_REF_SELF')).toHaveLength(1)
    expect(result.issues.filter((i) => i.code === 'VISIBILITY_REF_DANGLING')).toHaveLength(0)
  })

  it('field 为空字符串按悬空处理', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'a', title: 'A' },
        { type: 'input', key: 'b', field: 'b', title: 'B', visibleRule: showWhen('') },
      ]),
    )
    expect(result.issues.filter((i) => i.code === 'VISIBILITY_REF_DANGLING')).toHaveLength(1)
  })

  it('主表字段、页签内字段与子表单自身均为合法目标', () => {
    const result = validateSchema(
      base([
        { type: 'input', key: 'a', field: 'a', title: 'A' },
        {
          type: 'tabs',
          key: 'tabs',
          tabs: [
            {
              key: 't1',
              title: '页1',
              fields: [{ type: 'input', key: 'inner', field: 'inner', title: 'I' }],
            },
          ],
        },
        validSubForm(),
        {
          type: 'input',
          key: 'z',
          field: 'z',
          title: 'Z',
          // 页签内字段与子表单自身的 field 同属主表作用域，均可作为目标
          visibleRule: {
            logic: 'or',
            action: 'show',
            conditions: [
              { field: 'inner', operator: 'eq', value: 'x' },
              { field: 'order_items', operator: 'eq', value: 'x' },
            ],
          },
        },
      ]),
    )
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('显隐规则与提交校验共用同一口径：同一子字段标识两处均被拒', () => {
    const schema = base([
      {
        ...validSubForm(),
        subFields: [{ type: 'input', key: 's1', field: 'product', title: '产品' }],
      },
      { type: 'input', key: 'a', field: 'a', title: 'A', visibleRule: showWhen('product') },
    ])
    schema.formConfig = {
      submitValidation: [
        {
          logic: 'and',
          conditions: [{ field: 'product', operator: 'eq', value: 'x' }],
          message: '提示',
        },
      ],
    } as unknown as FormSchema['formConfig']
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    const refIssues = result.issues.filter(
      (i) => i.code === 'VISIBILITY_REF_DANGLING' || i.code === 'SUBMIT_VALIDATION_REF_DANGLING',
    )
    // 两处引用各报一条，且各自归入引用完整性族
    expect(refIssues).toHaveLength(2)
    expect(refIssues.map((i) => i.code).sort()).toEqual([
      'SUBMIT_VALIDATION_REF_DANGLING',
      'VISIBILITY_REF_DANGLING',
    ])
    // 同一判定口径：两处文案均指出是子表单子字段，不因来源而分叉
    for (const issue of refIssues) expect(issue.message).toContain('子表单子字段')
  })
})

describe('importSchema - 悬空显隐引用阻断导入', () => {
  it('含悬空引用的文档被拒，抛错信息带可定位的条件路径', () => {
    const doc = base([
      { type: 'input', key: 'a', field: 'a', title: 'A' },
      { type: 'input', key: 'b', field: 'b', title: 'B', visibleRule: showWhen('ghost') },
    ])
    // importSchema 在返回前抛出，故调用方「成功后再替换状态」的写法不会改变当前编辑内容
    expect(() => importSchema(JSON.stringify(doc))).toThrow(/校验失败/)
    expect(() => importSchema(JSON.stringify(doc))).toThrow(
      /fields\[1\]\.visibleRule\.conditions\[0\]/,
    )
  })
})
