import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import FieldList from '@/designer/FieldList.vue'
import { FORM_CONFIG_DEFAULTS } from '@/schema/defaults'
import type { FieldNode } from '@/schema/types'

/**
 * 画布拖拽热区契约：整张字段卡片 / 整个子表单列都是拖拽热区，
 * 卡片内的交互子区域（删除、复制、页签、子表单主体）以 `__no-drag` 排除。
 * 对应 specs/form-designer「画布所见即所得展示」「子字段管理」。
 */

const FIELD_LIST = 'src/designer/FieldList.vue'
const SUBFORM_BODY = 'src/designer/SubFormBody.vue'

/** FieldList 的标签布局为必填 prop（组件不再持有兜底值），测试统一取契约层缺省值 */
const LABEL_PROPS = {
  labelPosition: FORM_CONFIG_DEFAULTS.labelPosition,
  labelWidth: FORM_CONFIG_DEFAULTS.labelWidth,
}

/** vitest 下 import.meta.url 非 file 协议，故由工程根目录（vitest root）解析源码路径 */
function source(relPath: string): Promise<string> {
  return readFile(resolve(process.cwd(), relPath), 'utf-8')
}

function mountList(fields: FieldNode[]) {
  return mount(FieldList, {
    props: { fields, selectedKey: '', ...LABEL_PROPS },
    global: { plugins: [ElementPlus] },
  })
}

function inputNode(): FieldNode {
  return { type: 'input', key: 'a', field: 'user_name', title: '用户名' } as FieldNode
}

function subFormNode(): FieldNode {
  return {
    type: 'subform',
    key: 'sf',
    field: 'items',
    title: '采购明细',
    subFields: [
      { type: 'input', key: 'sf_name', field: 'name', title: '产品名称' },
      { type: 'number', key: 'sf_qty', field: 'qty', title: '数量' },
    ],
    props: { minRows: 1, maxRows: 200 },
  } as unknown as FieldNode
}

function tabsNode(): FieldNode {
  return {
    type: 'tabs',
    key: 'tb',
    title: '分组',
    tabs: [
      { key: 't1', title: '标签页1', fields: [] },
      { key: 't2', title: '标签页2', fields: [] },
    ],
  } as unknown as FieldNode
}

describe('拖拽热区：整卡 / 整列可拖拽', () => {
  it('画布字段卡片不再以 handle 收窄拖拽热区，改用 filter 排除交互区', async () => {
    const src = await source(FIELD_LIST)
    expect(src).not.toMatch(/^\s+handle=/m)
    expect(src).toMatch(/filter="\.field-card__no-drag"/)
    // 关闭 preventOnFilter：被排除元素不 preventDefault，点击与聚焦能力保留
    expect(src).toMatch(/:prevent-on-filter="false"/)
  })

  it('子表单列同样整列可拖拽', async () => {
    const src = await source(SUBFORM_BODY)
    expect(src).not.toMatch(/^\s+handle=/m)
    expect(src).toMatch(/filter="\.subform-col__no-drag"/)
    expect(src).toMatch(/:prevent-on-filter="false"/)
  })

  it('卡片与列以 move 光标提示可拖拽', async () => {
    expect(await source(FIELD_LIST)).toMatch(/\.field-card\s*\{[^}]*cursor:\s*move/)
    expect(await source(SUBFORM_BODY)).toMatch(/\.subform-col\s*\{[^}]*cursor:\s*move/)
  })

  it('控件预览区不拦截指针事件（否则热区被预览控件吃掉）', async () => {
    expect(await source(FIELD_LIST)).toMatch(
      /\.field-card__control\s*\{[^}]*pointer-events:\s*none/,
    )
    expect(await source(SUBFORM_BODY)).toMatch(
      /\.subform-col__cell\s*\{[^}]*pointer-events:\s*none/,
    )
  })
})

describe('拖拽热区：交互子区域被排除', () => {
  it('卡片标签区、控件预览区属热区（不带 no-drag）', () => {
    const wrapper = mountList([inputNode()])
    for (const sel of ['.field-card__body', '.field-card__field-label', '.field-card__control']) {
      const el = wrapper.find(sel)
      expect(el.exists()).toBe(true)
      expect(el.classes()).not.toContain('field-card__no-drag')
    }
  })

  it('卡片删除按钮被排除，仍可点击删除', async () => {
    const wrapper = mountList([inputNode()])
    const remove = wrapper.find('.field-card__bar button')
    expect(remove.exists()).toBe(true)
    expect(remove.classes()).toContain('field-card__no-drag')
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['a']])
  })

  it('多标签页容器整体被排除（页签 +/× 与嵌套列表须保持可交互）', async () => {
    const node = tabsNode()
    const wrapper = mountList([node])
    expect(wrapper.find('.field-card__tabs').classes()).toContain('field-card__no-drag')
    // 排除后页签新增入口仍能冒泡事件
    await wrapper.find('.el-tabs__new-tab').trigger('click')
    expect(wrapper.emitted('add-tab')).toEqual([[node.key]])
  })

  it('子表单主体整体被排除，列内复制 / 删除按钮再各自排除', async () => {
    const wrapper = mountList([subFormNode()])
    expect(wrapper.find('.field-card__subform').classes()).toContain('field-card__no-drag')

    const col = wrapper.findAll('.subform-col')[0]
    expect(col.classes()).not.toContain('subform-col__no-drag')
    expect(col.find('.subform-col__title').classes()).not.toContain('subform-col__no-drag')

    const buttons = col.findAll('.subform-col__head button')
    expect(buttons.map((b) => b.text())).toEqual(['复制', '删除'])
    buttons.forEach((b) => expect(b.classes()).toContain('subform-col__no-drag'))

    await buttons[1].trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['sf_name']])
  })
})
