/**
 * 字段扩展成本护栏（统一渲染单轨）。
 *
 * 目的：证明「新增一类字段」不再需要同步改 FieldControl / fieldIcons —— 这两处曾是
 * 每加一类字段就要动的第 3、4 处（且漏改时静默降级为类型名文案）。
 *
 * 做法：在运行期向注册表登记一个新字段类型（评分），且**只**提供一份 `control` 定义
 * （`toRule` 由 `defineDataField` 自动派生），随后断言它自动获得：
 * 画布预览控件、子表单/画布共用的 FieldControl 渲染、图标、中文名、以及运行态 rule。
 *
 * 剩余的唯一一处改动是 schema 类型清单 `COMMON_FIELD_TYPES`（TypeScript 联合类型的来源，
 * 编译期强制）；子字段白名单与 schema 校验的已知类型集均由它派生，无需另行维护，
 * 一致性由 tests/registry.test.ts「字段类型清单单一化」锁定。
 *
 * 注：vitest 默认按文件隔离模块实例，此处的登记不会污染其它测试文件。
 */
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElRate } from 'element-plus'
import { Star } from '@element-plus/icons-vue'
import FieldControl from '@/components/FieldControl.vue'
import FieldPreview from '@/designer/FieldPreview.vue'
import { fieldIcon, fieldTypeLabel } from '@/designer/fieldIcons'
import { defineDataField, fieldRegistry } from '@/registry'
import { createContext, mapNode } from '@/adapter/toRule'
import { isCommonFieldType, type DataFieldNode, type FieldType } from '@/schema/types'
import type { ControlValueKind, FormCreateRule } from '@/registry/types'

/** 新字段类型标识（尚未登记进 schema 类型清单，故此处以 FieldType 断言模拟） */
const RATING = 'rating' as FieldType

/**
 * 扩展方需要写的全部内容：一份字段定义 + 一份 control。
 * 没有 toRule、没有 FieldControl 分支、没有图标映射表条目。
 */
const ratingDefinition = defineDataField({
  type: RATING as DataFieldNode['type'],
  label: '评分',
  group: 'common',
  isData: true,
  icon: Star,
  createDefault: (key: string, field: string): DataFieldNode =>
    ({
      type: RATING,
      key,
      field,
      title: '评分',
      required: false,
      placeholder: undefined,
      props: { maxStars: 5 },
    }) as DataFieldNode,
  propEditors: [{ key: 'maxStars', label: '总分', editor: 'number', default: 5 }],
  control: {
    component: ElRate,
    formCreateType: 'rate',
    valueKind: 'number',
    props: (node) => ({
      max: (node.props?.maxStars as number) ?? 5,
      allowHalf: true,
      placeholder: node.placeholder || '请评分',
    }),
  },
})

fieldRegistry.register(ratingDefinition)

const ratingNode = ratingDefinition.createDefault('k_rating', 'score') as DataFieldNode

/* -------------------------------------------------------------------------- */
/* 值形态归一化探针                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 回声组件：把收到的 modelValue 原样写入 DOM 属性，用于直接观察 FieldControl 的归一化结果。
 * 显式声明 prop（type: null 不做类型校验）以避开 Vue 对未声明属性保留 kebab-case 键的行为。
 */
const Echo = defineComponent({
  props: { modelValue: { type: null, default: undefined } },
  setup: (props) => () => h('div', { class: 'echo', 'data-raw': String(props.modelValue) }),
})

const VALUE_KINDS: ControlValueKind[] = ['text', 'scalar', 'number', 'dateString', 'array']

/** 为每种值形态登记一个探针字段，直接观察归一化结果（不经 Element Plus 控件默认值干扰） */
VALUE_KINDS.forEach((kind) => {
  const probeType = `probe_${kind}`
  fieldRegistry.register(
    defineDataField({
      type: probeType as DataFieldNode['type'],
      label: `探针-${kind}`,
      group: 'common',
      isData: true,
      createDefault: (key: string, field: string): DataFieldNode =>
        ({ type: probeType, key, field, title: '探针' }) as DataFieldNode,
      control: {
        component: Echo,
        formCreateType: 'probe',
        valueKind: kind,
        props: () => ({}),
      },
    }),
  )
})

/** 构造探针节点 */
function probeNode(kind: ControlValueKind): DataFieldNode {
  return { type: `probe_${kind}`, key: 'k', field: 'f', title: '探针' } as unknown as DataFieldNode
}

describe('新增字段类型：消费侧零改动', () => {
  it('FieldControl 无需新增分支即渲染出注册表声明的控件', () => {
    const wrapper = mount(FieldControl, {
      props: { node: ratingNode, modelValue: 3 },
      global: { plugins: [ElementPlus] },
    })
    // 落到 .field-control__empty 兜底文案即代表「漏改 FieldControl」的旧故障
    expect(wrapper.find('.field-control__empty').exists()).toBe(false)
    expect(wrapper.findComponent(ElRate).exists()).toBe(true)
    wrapper.unmount()
  })

  it('控件属性与值形态由 control 驱动（max 来自节点 props，number 形态归一化）', () => {
    const wrapper = mount(FieldControl, {
      props: { node: ratingNode, modelValue: 3 },
      global: { plugins: [ElementPlus] },
    })
    const rate = wrapper.findComponent(ElRate)
    expect(rate.props('max')).toBe(5)
    expect(rate.props('allowHalf')).toBe(true)
    expect(rate.props('modelValue')).toBe(3)
    wrapper.unmount()
  })

  it('valueKind 决定归一化：number 形态下非法值不会抵达控件', () => {
    // 字符串 '3' 对 number 形态为非法值，归一化为 undefined 后由控件自身默认值兜底
    //（ElRate 的 modelValue 默认为 0）；若误用 text 形态则 '3' 会直接透传给控件
    const wrapper = mount(FieldControl, {
      props: { node: ratingNode, modelValue: '3' },
      global: { plugins: [ElementPlus] },
    })
    const rate = wrapper.findComponent(ElRate)
    expect(rate.props('modelValue')).not.toBe('3')
    expect(rate.props('modelValue')).toBe(0)
    wrapper.unmount()
  })

  it('控件可回写值（v-model 契约不因注册表驱动而改变）', async () => {
    const wrapper = mount(FieldControl, {
      props: { node: ratingNode, modelValue: 1 },
      global: { plugins: [ElementPlus] },
    })
    wrapper.findComponent(ElRate).vm.$emit('update:modelValue', 4)
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4])
    wrapper.unmount()
  })

  it('设计器画布预览自动呈现新控件（FieldPreview 亦零改动）', () => {
    const wrapper = mount(FieldPreview, {
      props: { node: ratingNode },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find('.field-preview__empty').exists()).toBe(false)
    expect(wrapper.findComponent(FieldControl).exists()).toBe(true)
    wrapper.unmount()
  })

  it('fieldIcons 无需新增映射条目即取得图标与中文名', () => {
    expect(fieldIcon(RATING)).toBe(Star)
    expect(fieldTypeLabel(RATING)).toBe('评分')
  })
})

describe('新增字段类型：运行态 rule 与设计态控件同源', () => {
  const ctx = createContext()

  it('toRule 由 defineDataField 自动派生，扩展方无需手写映射', () => {
    const rule = mapNode(ratingNode, ctx)[0] as FormCreateRule
    expect(rule.type).toBe('rate')
    expect(rule.field).toBe('score')
    expect(rule.title).toBe('评分')
  })

  it('rule.props 与控件属性逐项一致（两轨不会走形）', () => {
    const rule = mapNode(ratingNode, ctx)[0] as FormCreateRule
    const shared = ratingDefinition.control.props(ratingNode, ctx)
    expect(shared.max).toBe(5)
    Object.entries(shared).forEach(([key, value]) => {
      expect(rule.props[key], `rule.props.${key} 与控件属性漂移`).toBe(value)
    })
    // 只读禁用仍由适配层叠加，控件定义不掺入宿主上下文
    expect(rule.props.disabled).toBe(false)
  })

  it('整表只读时 rule 禁用，而预览态控件不加 disabled（design D3 取舍保持）', () => {
    const readonlyRule = mapNode(ratingNode, createContext({ readonly: true }))[0]
    expect(readonlyRule.props.disabled).toBe(true)

    const wrapper = mount(FieldControl, {
      props: { node: ratingNode, preview: true },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.findComponent(ElRate).props('disabled')).toBeFalsy()
    wrapper.unmount()
  })
})

describe('值形态归一化契约（valueKind -> modelValue）', () => {
  // 第三列为归一化后经 String() 写入 data-raw 的预期值
  const cases: [ControlValueKind, unknown, string][] = [
    ['text', null, ''],
    ['text', undefined, ''],
    ['text', 7, '7'],
    ['scalar', 5, '5'],
    ['scalar', 'y', 'y'],
    // 选项值可能为数字，强转字符串会导致勾选不中，故 scalar 必须保留原型
    ['scalar', ['a'], ''],
    ['number', 3, '3'],
    ['number', '3', 'undefined'],
    ['dateString', '2024-01-02', '2024-01-02'],
    ['dateString', '', 'undefined'],
    ['array', ['a', 'b'], 'a,b'],
    ['array', 'a', ''],
  ]

  it.each(cases)('%s 形态下 %j 归一化为 %s', (kind, raw, expected) => {
    const wrapper = mount(FieldControl, {
      props: { node: probeNode(kind), modelValue: raw },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find('.echo').attributes('data-raw')).toBe(expected)
    wrapper.unmount()
  })
})

describe('剩余的唯一一处改动：schema 类型清单', () => {
  it('未登记进 COMMON_FIELD_TYPES 前，类型守卫与白名单不认它（编译期锚点）', () => {
    // 这正是扩展方必须改的那一处：清单是 TypeScript 联合类型的来源，
    // 子字段白名单 SUBFIELD_ALLOWED_TYPES 与校验用 KNOWN_FIELD_TYPES 均由它派生。
    expect(isCommonFieldType(RATING)).toBe(false)
  })

  it('登记后注册表与清单的一致性由护栏测试强制（不允许只做一半）', () => {
    // fieldRegistry 现已含 rating，而清单未含 —— 该漂移会被
    // tests/registry.test.ts「注册表登记的类型与 schema 契约清单完全一致」捕获。
    expect(fieldRegistry.has(RATING)).toBe(true)
    expect(fieldRegistry.listByGroup('common').map((d) => d.type)).toContain(RATING)
  })
})
