/**
 * 子表单校验纯函数测试（task 5.1 / 5.3 输出 / 5.4 容错）。
 * 覆盖四类校验语义各至少一条：整体必填、逐行子字段规则、整行为空跳过、错误行列定位；
 * 以及空行剔除、键收敛、非数组容错。对应 specs/form-renderer「子表单校验 / 子表单数据输出」。
 */
import { describe, expect, it } from 'vitest'
import {
  isEmptyRow,
  isEmptyValue,
  stripEmptyRows,
  validateSubForm,
  type SubFormErrorItem,
} from '@/renderer/subformValidation'
import type { DataFieldNode, SubFormNode } from '@/schema/types'

function sub(overrides: Partial<DataFieldNode> & { field: string }): DataFieldNode {
  return {
    type: 'input',
    key: overrides.field,
    title: overrides.field,
    ...overrides,
  } as DataFieldNode
}

function subFormNode(
  subFields: DataFieldNode[],
  overrides: Partial<SubFormNode> = {},
): SubFormNode {
  return {
    type: 'subform',
    key: 'sf',
    field: 'items',
    title: '采购明细',
    subFields,
    ...overrides,
  }
}

describe('isEmptyValue / isEmptyRow', () => {
  it('空值判定：undefined/null/空白串/空数组为空，0 与 false 非空', () => {
    expect(isEmptyValue(undefined)).toBe(true)
    expect(isEmptyValue(null)).toBe(true)
    expect(isEmptyValue('   ')).toBe(true)
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue(0)).toBe(false)
    expect(isEmptyValue(false)).toBe(false)
    expect(isEmptyValue('a')).toBe(false)
  })

  it('整行为空：全部子字段值为空', () => {
    const sfs = [sub({ field: 'a' }), sub({ field: 'b' })]
    expect(isEmptyRow({ a: '', b: undefined }, sfs)).toBe(true)
    expect(isEmptyRow({ a: 'x', b: undefined }, sfs)).toBe(false)
  })
})

describe('validateSubForm 整体必填（语义一）', () => {
  it('必填且无任何有效行时报整体错误（rowIndex=-1）', async () => {
    const node = subFormNode([sub({ field: 'name', title: '名称' })], { required: true })
    const errors = await validateSubForm(node, [])
    expect(errors).toHaveLength(1)
    expect(errors[0].rowIndex).toBe(-1)
    expect(errors[0].message).toContain('采购明细')
  })

  it('必填且存在全空行时仍报整体错误', async () => {
    const node = subFormNode([sub({ field: 'name', title: '名称' })], { required: true })
    const errors = await validateSubForm(node, [{ name: '' }, {}])
    expect(errors.some((e) => e.rowIndex === -1)).toBe(true)
  })

  it('必填且存在有效行时不报整体错误', async () => {
    const node = subFormNode([sub({ field: 'name', title: '名称' })], { required: true })
    const errors = await validateSubForm(node, [{ name: 'A' }])
    expect(errors.filter((e) => e.rowIndex === -1)).toHaveLength(0)
  })

  it('非必填且无数据时不报错', async () => {
    const node = subFormNode([sub({ field: 'name', title: '名称' })], { required: false })
    expect(await validateSubForm(node, [])).toHaveLength(0)
  })
})

describe('validateSubForm 逐行子字段规则（语义二）', () => {
  it('非空行中必填子字段为空时报单元格错误', async () => {
    const node = subFormNode([
      sub({ field: 'name', title: '名称', required: true }),
      sub({ field: 'qty', title: '数量', type: 'number' }),
    ])
    // 该行 qty 有值（非空行），但必填的 name 为空
    const errors = await validateSubForm(node, [{ name: '', qty: 5 }])
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldKey).toBe('name')
    expect(errors[0].rowIndex).toBe(0)
  })

  it('必填数字子字段已填数字（含 0）时不得报必填：必填只判是否有值，不判类型', async () => {
    const node = subFormNode([sub({ field: 'qty', title: '数量', type: 'number', required: true })])
    expect(await validateSubForm(node, [{ qty: 12 }])).toHaveLength(0)
    expect(await validateSubForm(node, [{ qty: 0 }])).toHaveLength(0)
  })

  it('必填数字子字段未填时仍报必填', async () => {
    const node = subFormNode([
      sub({ field: 'qty', title: '数量', type: 'number', required: true }),
      sub({ field: 'name', title: '名称' }),
    ])
    // 该行因 name 有值而为非空行，必填的 qty 未填 -> 报该格必填
    const errors = await validateSubForm(node, [{ qty: undefined, name: 'A' }])
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldKey).toBe('qty')
    expect(errors[0].message).toContain('必填')
  })

  it('必填多选子字段以空数组判定为未填（仍走数组非空口径）', async () => {
    const node = subFormNode([
      sub({ field: 'tags', title: '标签', type: 'checkbox', required: true }),
      sub({ field: 'name', title: '名称' }),
    ])
    const errors = await validateSubForm(node, [{ tags: [], name: 'A' }])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('请至少选择一项')
  })

  it('格式校验逐行生效（手机号非法）', async () => {
    const node = subFormNode([
      sub({
        field: 'phone',
        title: '联系电话',
        validate: [{ type: 'pattern', preset: 'phone' }],
      }),
    ])
    const errors = await validateSubForm(node, [{ phone: '123' }])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('请输入正确的手机号')
  })

  it('多行分别校验，定位到各自行', async () => {
    const node = subFormNode([
      sub({ field: 'name', title: '名称', required: true }),
      sub({ field: 'qty', title: '数量', type: 'number' }),
    ])
    // 两行均非空（qty 有值），第 1 行 name 必填失败
    const errors = await validateSubForm(node, [
      { name: 'A', qty: 1 },
      { name: '', qty: 2 },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].rowIndex).toBe(1)
    expect(errors[0].fieldKey).toBe('name')
  })
})

describe('validateSubForm 整行为空跳过（语义三）', () => {
  it('全空行不触发子字段必填', async () => {
    const node = subFormNode([sub({ field: 'name', title: '名称', required: true })])
    // 一行有值、一行全空：仅校验有值行，全空行跳过
    const errors = await validateSubForm(node, [{ name: 'A' }, { name: '' }])
    expect(errors).toHaveLength(0)
  })
})

describe('validateSubForm 错误行列定位（语义四）', () => {
  it('错误信息携带 1-based 行序号与子字段标题', async () => {
    const node = subFormNode([sub({ field: 'name', title: '产品名称', required: true })])
    const errors = await validateSubForm(node, [{ name: 'A' }, { name: '' }])
    // 让第二行成为「非空但缺必填」：加一列数量使其非空
    const node2 = subFormNode([
      sub({ field: 'name', title: '产品名称', required: true }),
      sub({ field: 'qty', title: '数量', type: 'number' }),
    ])
    const errors2 = await validateSubForm(node2, [
      { name: '', qty: 1 },
      { name: '', qty: 2 },
    ])
    expect(errors).toHaveLength(0)
    expect(errors2).toHaveLength(2)
    expect(errors2[0].message).toContain('第 1 行')
    expect(errors2[0].message).toContain('产品名称')
    expect(errors2[1].message).toContain('第 2 行')
    expect(errors2[1].fieldTitle).toBe('产品名称')
  })
})

describe('validateSubForm 非数组容错（task 5.4）', () => {
  it('传入 null / 对象 / 字符串不抛异常，按空明细处理', async () => {
    const node = subFormNode([sub({ field: 'name', title: '名称' })])
    expect(await validateSubForm(node, null)).toHaveLength(0)
    expect(await validateSubForm(node, { foo: 1 })).toHaveLength(0)
    expect(await validateSubForm(node, 'oops')).toHaveLength(0)
  })

  it('必填时非数组值仍按「无有效行」报整体错误', async () => {
    const node = subFormNode([sub({ field: 'name', title: '名称' })], { required: true })
    const errors: SubFormErrorItem[] = await validateSubForm(node, null)
    expect(errors.some((e) => e.rowIndex === -1)).toBe(true)
  })
})

describe('stripEmptyRows 数据输出（task 5.3）', () => {
  const sfs = [sub({ field: 'name', title: '名称' }), sub({ field: 'qty', title: '数量' })]

  it('剔除完全空白行，仅保留有内容的行', () => {
    const out = stripEmptyRows([{ name: 'A', qty: 1 }, { name: '', qty: undefined }, {}], sfs)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ name: 'A', qty: 1 })
  })

  it('按键收敛为子字段 field，剥离 __rowKey 等内部键', () => {
    const out = stripEmptyRows([{ __rowKey: 9, name: 'A', qty: 2, extra: 'x' }], sfs)
    expect(out[0]).toEqual({ name: 'A', qty: 2 })
    expect('__rowKey' in out[0]).toBe(false)
    expect('extra' in out[0]).toBe(false)
  })

  it('非数组值容错为空数组', () => {
    expect(stripEmptyRows(null, sfs)).toEqual([])
    expect(stripEmptyRows({ a: 1 }, sfs)).toEqual([])
  })
})
