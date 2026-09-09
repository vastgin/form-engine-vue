import { describe, expect, it } from 'vitest'
import { evaluateCondition, evaluateVisibility, isEmptyValue } from '@/renderer/visibility'
import { buildInitialData, collectDataFields } from '@/schema/traverse'
import type { FieldNode, VisibilityRule } from '@/schema/types'

describe('显隐规则求值 (5.2)', () => {
  it('eq 条件命中', () => {
    expect(evaluateCondition({ field: 'a', operator: 'eq', value: '其他' }, { a: '其他' })).toBe(
      true,
    )
    expect(evaluateCondition({ field: 'a', operator: 'eq', value: '其他' }, { a: '标准' })).toBe(
      false,
    )
  })

  it('neq / contains / notContains', () => {
    expect(evaluateCondition({ field: 'a', operator: 'neq', value: 'x' }, { a: 'y' })).toBe(true)
    expect(
      evaluateCondition({ field: 'a', operator: 'contains', value: 'b' }, { a: ['a', 'b'] }),
    ).toBe(true)
    expect(
      evaluateCondition({ field: 'a', operator: 'notContains', value: 'c' }, { a: ['a'] }),
    ).toBe(true)
  })

  it('数值比较 gt/gte/lt/lte', () => {
    expect(evaluateCondition({ field: 'n', operator: 'gt', value: 10 }, { n: 20 })).toBe(true)
    expect(evaluateCondition({ field: 'n', operator: 'lte', value: 10 }, { n: 10 })).toBe(true)
    expect(evaluateCondition({ field: 'n', operator: 'lt', value: 10 }, { n: 'x' })).toBe(false)
  })

  it('empty / notEmpty', () => {
    expect(evaluateCondition({ field: 'a', operator: 'empty' }, { a: '' })).toBe(true)
    expect(evaluateCondition({ field: 'a', operator: 'notEmpty' }, { a: 'v' })).toBe(true)
    expect(isEmptyValue([])).toBe(true)
  })

  it('action=show：条件命中则显示，否则隐藏', () => {
    const rule: VisibilityRule = {
      logic: 'and',
      action: 'show',
      conditions: [{ field: 'a', operator: 'eq', value: '其他' }],
    }
    expect(evaluateVisibility(rule, { a: '其他' })).toBe(true)
    expect(evaluateVisibility(rule, { a: '标准' })).toBe(false)
  })

  it('action=hide：条件命中则隐藏', () => {
    const rule: VisibilityRule = {
      logic: 'and',
      action: 'hide',
      conditions: [{ field: 'a', operator: 'eq', value: 'x' }],
    }
    expect(evaluateVisibility(rule, { a: 'x' })).toBe(false)
    expect(evaluateVisibility(rule, { a: 'y' })).toBe(true)
  })

  it('多条件 and/or 组合', () => {
    const andRule: VisibilityRule = {
      logic: 'and',
      action: 'show',
      conditions: [
        { field: 'a', operator: 'eq', value: '1' },
        { field: 'b', operator: 'eq', value: '2' },
      ],
    }
    expect(evaluateVisibility(andRule, { a: '1', b: '2' })).toBe(true)
    expect(evaluateVisibility(andRule, { a: '1', b: '9' })).toBe(false)

    const orRule: VisibilityRule = { ...andRule, logic: 'or' }
    expect(evaluateVisibility(orRule, { a: '1', b: '9' })).toBe(true)
  })

  it('无规则或空条件默认可见', () => {
    expect(evaluateVisibility(undefined, {})).toBe(true)
    expect(evaluateVisibility({ logic: 'and', action: 'show', conditions: [] }, {})).toBe(true)
  })
})

describe('数据模型构建 (4.3)', () => {
  const fields: FieldNode[] = [
    { type: 'input', key: 'a', field: 'name', title: '姓名' },
    { type: 'checkbox', key: 'b', field: 'tags', title: '标签', value: ['x'] },
    { type: 'selectMultiple', key: 'c', field: 'multi', title: '多选' },
    { type: 'divider', key: 'd', title: '分割' },
    {
      type: 'tabs',
      key: 'tabs',
      tabs: [
        {
          key: 't1',
          title: '页',
          fields: [{ type: 'number', key: 'e', field: 'amount', title: '金额' }],
        },
      ],
    },
  ]

  it('收集数据字段（含容器内），排除布局字段', () => {
    const dataFields = collectDataFields(fields).map((f) => f.field)
    expect(dataFields).toEqual(expect.arrayContaining(['name', 'tags', 'multi', 'amount']))
    expect(dataFields).not.toContain('divider')
  })

  it('构建初始数据：多选默认数组，布局字段不参与', () => {
    const data = buildInitialData(fields)
    expect(data.name).toBeUndefined()
    expect(data.tags).toEqual(['x'])
    expect(data.multi).toEqual([])
    expect(data.amount).toBeUndefined()
    expect('divider' in data).toBe(false)
    expect(Object.keys(data)).not.toContain('tabs')
  })
})
