/**
 * 拖放白名单纯函数全矩阵单测（task 6.2）。
 * 覆盖三类放置区 × 全部字段类型（12 常用 + 子表单 + 3 布局）：
 * - 画布根 / 多标签页容器接受全部；
 * - 子表单子字段区仅接受常用数据字段，拒绝子表单与全部布局字段。
 */
import { describe, expect, it } from 'vitest'
import { canDropInto, dropRejectMessage } from '@/designer/dropRules'

const COMMON_TYPES = [
  'input',
  'textarea',
  'number',
  'date',
  'radio',
  'checkbox',
  'select',
  'selectMultiple',
  'member',
  'memberMultiple',
  'department',
  'departmentMultiple',
]
const LAYOUT_TYPES = ['divider', 'text', 'tabs']
const ALL_TYPES = [...COMMON_TYPES, 'subform', ...LAYOUT_TYPES]

describe('canDropInto 全矩阵 (6.2)', () => {
  it('画布根区域接受全部字段类型', () => {
    for (const t of ALL_TYPES) expect(canDropInto('root', t)).toBe(true)
  })

  it('多标签页容器接受全部字段类型', () => {
    for (const t of ALL_TYPES) expect(canDropInto('tabs', t)).toBe(true)
  })

  it('子表单子字段区接受全部 12 类常用数据字段', () => {
    for (const t of COMMON_TYPES) expect(canDropInto('subform', t)).toBe(true)
  })

  it('子表单子字段区拒绝子表单（禁止嵌套）', () => {
    expect(canDropInto('subform', 'subform')).toBe(false)
  })

  it('子表单子字段区拒绝全部布局字段', () => {
    for (const t of LAYOUT_TYPES) expect(canDropInto('subform', t)).toBe(false)
  })

  it('拒绝提示指明该字段不可作为子表单子字段', () => {
    const msg = dropRejectMessage('divider', '分割线')
    expect(msg).toContain('分割线')
    expect(msg).toContain('子表单')
  })
})
