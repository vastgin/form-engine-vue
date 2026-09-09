import { describe, expect, it } from 'vitest'
import { evaluateSubmitValidation } from '@/renderer/submitValidation'
import type { SubmitValidationRule } from '@/schema/types'

describe('整表提交校验求值 (2.1)', () => {
  const rule: SubmitValidationRule = {
    logic: 'and',
    conditions: [{ field: 'end', operator: 'lt', value: 10 }],
    message: '结束不能小于10',
  }

  it('无规则或空数组放行', () => {
    expect(evaluateSubmitValidation(undefined, {})).toBeNull()
    expect(evaluateSubmitValidation([], { end: 1 })).toBeNull()
  })

  it('条件命中返回首个失败提示', () => {
    expect(evaluateSubmitValidation([rule], { end: 5 })).toBe('结束不能小于10')
  })

  it('条件不命中返回 null', () => {
    expect(evaluateSubmitValidation([rule], { end: 20 })).toBeNull()
  })

  it('and 组合须全部条件命中才算不通过', () => {
    const and: SubmitValidationRule = {
      logic: 'and',
      conditions: [
        { field: 'a', operator: 'eq', value: '1' },
        { field: 'b', operator: 'eq', value: '2' },
      ],
      message: 'and-hit',
    }
    expect(evaluateSubmitValidation([and], { a: '1', b: '9' })).toBeNull()
    expect(evaluateSubmitValidation([and], { a: '1', b: '2' })).toBe('and-hit')
  })

  it('or 组合任一条件命中即不通过', () => {
    const or: SubmitValidationRule = {
      logic: 'or',
      conditions: [
        { field: 'a', operator: 'eq', value: '1' },
        { field: 'b', operator: 'eq', value: '2' },
      ],
      message: 'or-hit',
    }
    expect(evaluateSubmitValidation([or], { a: '1', b: '9' })).toBe('or-hit')
    expect(evaluateSubmitValidation([or], { a: '0', b: '9' })).toBeNull()
  })

  it('多条规则返回首个命中项', () => {
    const r1: SubmitValidationRule = {
      logic: 'and',
      conditions: [{ field: 'x', operator: 'eq', value: '1' }],
      message: 'first',
    }
    const r2: SubmitValidationRule = { ...r1, message: 'second' }
    expect(evaluateSubmitValidation([r1, r2], { x: '1' })).toBe('first')
  })

  it('空条件组的规则视为不命中', () => {
    const empty: SubmitValidationRule = { logic: 'and', conditions: [], message: 'never' }
    expect(evaluateSubmitValidation([empty], { x: 1 })).toBeNull()
  })
})
