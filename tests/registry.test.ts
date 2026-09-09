import { describe, expect, it } from 'vitest'
import { fieldRegistry } from '@/registry'
import {
  addOption,
  createDefaultOptions,
  dropValueFromDefault,
  moveOption,
  normalizeDefaultValue,
  removeOption,
  renameValueInDefault,
  toggleDefaultValue,
  updateOption,
} from '@/registry/options'
import { createContext } from '@/adapter/toRule'
import type { FormCreateRule } from '@/registry/types'
import { fieldIcon, fieldTypeLabel } from '@/designer/fieldIcons'
import { Grid, InfoFilled } from '@element-plus/icons-vue'
import {
  KNOWN_FIELD_TYPES,
  SUBFIELD_ALLOWED_TYPES,
  SUBFORM_DEFAULT_MAX_ROWS,
  type DataFieldNode,
  type SubFormNode,
} from '@/schema/types'
import type { ControlValueKind } from '@/registry/types'

/** 组合控件类型（需逐个渲染候选项子组件） */
const COMPOSITE_TYPES = [
  'radio',
  'checkbox',
  'select',
  'selectMultiple',
  'member',
  'memberMultiple',
  'department',
  'departmentMultiple',
] as const

const VALUE_KINDS: ControlValueKind[] = ['text', 'scalar', 'number', 'dateString', 'array']

describe('字段注册表 - 目录与分组 (3.1/3.2/3.3)', () => {
  it('登记了 12 类常用字段', () => {
    const common = fieldRegistry.listByGroup('common')
    expect(common).toHaveLength(12)
    const types = common.map((d) => d.type)
    expect(types).toEqual(
      expect.arrayContaining([
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
      ]),
    )
  })

  it('登记了 3 类布局字段且标记为非数据字段', () => {
    const layout = fieldRegistry.listByGroup('layout')
    expect(layout.map((d) => d.type)).toEqual(expect.arrayContaining(['divider', 'text', 'tabs']))
    layout.forEach((d) => expect(d.isData).toBe(false))
  })

  it('常用字段均标记为数据字段', () => {
    fieldRegistry.listByGroup('common').forEach((d) => expect(d.isData).toBe(true))
  })

  it('按类型查询返回定义，未知类型返回 undefined', () => {
    expect(fieldRegistry.get('input')?.label).toBe('单行文本')
    expect(fieldRegistry.get('not-exist')).toBeUndefined()
    expect(fieldRegistry.has('tabs')).toBe(true)
  })

  it('每个字段定义可创建带默认值的节点', () => {
    fieldRegistry.list().forEach((def) => {
      const node = def.isData ? def.createDefault('k', 'f') : def.createDefault('k')
      expect(node.type).toBe(def.type)
      expect(node.key).toBe('k')
    })
  })
})

describe('选项配置工具 (3.4)', () => {
  it('创建默认选项', () => {
    const opts = createDefaultOptions(3)
    expect(opts).toHaveLength(3)
    expect(opts[0]).toEqual({ label: '选项1', value: '选项1' })
  })

  it('追加选项自动生成不重复值', () => {
    let opts = createDefaultOptions(2)
    opts = addOption(opts)
    expect(opts).toHaveLength(3)
    expect(opts[2].value).toBe('选项3')
  })

  it('删除/更新/移动选项', () => {
    let opts = createDefaultOptions(3)
    opts = removeOption(opts, 1)
    expect(opts).toHaveLength(2)
    opts = updateOption(opts, 0, { label: '改名' })
    expect(opts[0].label).toBe('改名')
    opts = moveOption(opts, 0, 1)
    expect(opts[1].label).toBe('改名')
  })

  it('越界操作返回原数组副本且不报错', () => {
    const opts = createDefaultOptions(2)
    expect(removeOption(opts, 9)).toHaveLength(2)
    expect(updateOption(opts, -1, { label: 'x' })).toHaveLength(2)
  })

  it('归一化默认值：多选为数组，单选取单值', () => {
    expect(normalizeDefaultValue(undefined, true)).toEqual([])
    expect(normalizeDefaultValue('a', true)).toEqual(['a'])
    expect(normalizeDefaultValue(['a', 'b'], false)).toBe('a')
    expect(normalizeDefaultValue('a', false)).toBe('a')
  })

  it('默认选中切换：单选取该值，多选在清单中增删该值', () => {
    expect(toggleDefaultValue(undefined, 'a', false)).toBe('a')
    // 单选再点同一项仍是该项（清空走「清除默认」）
    expect(toggleDefaultValue('a', 'a', false)).toBe('a')
    expect(toggleDefaultValue([], 'a', true)).toEqual(['a'])
    expect(toggleDefaultValue(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(toggleDefaultValue(['a', 'b'], 'a', true)).toEqual(['b'])
  })

  it('选项值改名后同步默认值，不留悬空引用', () => {
    expect(renameValueInDefault('a', 'a', 'A', false)).toBe('A')
    expect(renameValueInDefault('b', 'a', 'A', false)).toBe('b')
    expect(renameValueInDefault(['a', 'b'], 'a', 'A', true)).toEqual(['A', 'b'])
    // 默认值为非标量形态时按多选归一，不抛错
    expect(renameValueInDefault(undefined, 'a', 'A', true)).toEqual([])
  })

  it('删除选项后从默认值中剔除其值', () => {
    expect(dropValueFromDefault('a', 'a', false)).toBeUndefined()
    expect(dropValueFromDefault('b', 'a', false)).toBe('b')
    expect(dropValueFromDefault(['a', 'b'], 'a', true)).toEqual(['b'])
    expect(dropValueFromDefault(['a'], 'z', true)).toEqual(['a'])
  })
})

describe('高级字段分组与子表单定义 (2.1/2.2/2.3)', () => {
  it('三组查询列出常用 12 / 高级 1 / 布局 3', () => {
    expect(fieldRegistry.listByGroup('common')).toHaveLength(12)
    expect(fieldRegistry.listByGroup('advanced')).toHaveLength(1)
    expect(fieldRegistry.listByGroup('layout')).toHaveLength(3)
  })

  it('高级分组含且仅含子表单，标记为数据字段', () => {
    const advanced = fieldRegistry.listByGroup('advanced')
    expect(advanced[0].type).toBe('subform')
    expect(advanced[0].isData).toBe(true)
  })

  it('createDefault 生成空子字段列表（仅空容器，无预置子字段）', () => {
    const node = fieldRegistry.get('subform')!.createDefault('k1', 'subform_1') as SubFormNode
    expect(node.type).toBe('subform')
    expect(node.field).toBe('subform_1')
    expect(node.subFields).toHaveLength(0)
    expect(node.props?.minRows).toBe(0)
    // 拖入新子表单时按缺省上限 200 写入（硬上限 500，可在属性面板上调）
    expect(node.props?.maxRows).toBe(SUBFORM_DEFAULT_MAX_ROWS)
    // 批量删除缺省关闭（序号列与底部入口保持原形态）
    expect(node.props?.allowBatchRemove).toBe(false)
  })

  it('提供行数与批量删除属性编辑器', () => {
    const editors = fieldRegistry.get('subform')!.propEditors ?? []
    expect(editors.map((e) => e.key)).toEqual(
      expect.arrayContaining(['minRows', 'maxRows', 'allowBatchRemove']),
    )
    // 属性面板的 maxRows 缺省值与注册表默认值一致（同为 200）
    expect(editors.find((e) => e.key === 'maxRows')!.default).toBe(SUBFORM_DEFAULT_MAX_ROWS)
  })

  it('toRule 透传批量删除开关（仅显式 true 生效）', () => {
    const def = fieldRegistry.get('subform')!
    const node = def.createDefault('k', 'items') as SubFormNode
    const ctx = createContext()
    expect((def.toRule(node, ctx) as FormCreateRule).props.allowBatchRemove).toBe(false)
    node.props = { ...node.props, allowBatchRemove: true }
    expect((def.toRule(node, ctx) as FormCreateRule).props.allowBatchRemove).toBe(true)
    node.props = { ...node.props, allowBatchRemove: 'yes' as unknown as boolean }
    expect((def.toRule(node, ctx) as FormCreateRule).props.allowBatchRemove).toBe(false)
  })

  it('toRule 产出 engine-subform 规则并注入子字段列配置与数据源', () => {
    const def = fieldRegistry.get('subform')!
    const node = def.createDefault('k', 'items') as SubFormNode
    node.subFields.push({
      type: 'input',
      key: 'sf1',
      field: 'name',
      title: '名称',
    } as DataFieldNode)
    const ctx = createContext({
      dataSources: { members: [{ label: '张三', value: 'u1' }], departments: [] },
    })
    const rule = def.toRule(node, ctx) as FormCreateRule
    expect(rule.type).toBe('engine-subform')
    expect(rule.native).toBe(true)
    expect(rule.field).toBe('items')
    expect(Array.isArray(rule.value)).toBe(true)
    expect(rule.props.subFields).toHaveLength(1)
    expect(rule.props.dataSources.members).toEqual([{ label: '张三', value: 'u1' }])
  })

  it('fieldTypeLabel(subform) 返回「子表单」，subform 有专属图标且未注册类型回退 InfoFilled', () => {
    expect(fieldTypeLabel('subform')).toBe('子表单')
    expect(fieldIcon('subform')).toBe(Grid)
    expect(fieldIcon('not-exist')).toBe(InfoFilled)
  })
})

describe('统一渲染单轨：注册表为控件形态单一来源', () => {
  const ctx = createContext({
    dataSources: {
      members: [{ label: '张三', value: 'u1' }],
      departments: [{ label: '销售部', value: 'd1' }],
    },
  })

  it('每个常用数据字段都声明了完整控件定义（FieldControl 无需按类型分支）', () => {
    fieldRegistry.listByGroup('common').forEach((def) => {
      const control = def.control
      expect(control, `${def.type} 缺少 control 定义`).toBeTruthy()
      expect(control!.component, `${def.type} 缺少控件组件`).toBeTruthy()
      expect(control!.formCreateType, `${def.type} 缺少 formCreateType`).toBeTruthy()
      expect(VALUE_KINDS, `${def.type} 的 valueKind 非法`).toContain(control!.valueKind)
      expect(typeof control!.props).toBe('function')
    })
  })

  it('两轨同源：rule.type 与 rule.props 均由 control 派生', () => {
    fieldRegistry.listByGroup('common').forEach((def) => {
      const control = def.control!
      const node = def.createDefault('k', `f_${def.type}`) as DataFieldNode
      const rule = def.toRule(node, ctx) as FormCreateRule
      expect(rule.type, `${def.type} 的 rule.type 与 control 不一致`).toBe(control.formCreateType)
      // 控件属性逐项出现在 rule.props 中（rule 只额外叠加 disabled 与节点自定义属性透传）
      Object.entries(control.props(node, ctx)).forEach(([key, value]) => {
        expect(rule.props[key], `${def.type} 的 rule.props.${key} 与控件属性漂移`).toBe(value)
      })
    })
  })

  it('组合控件的 rule.options 与画布候选项取同一来源', () => {
    COMPOSITE_TYPES.forEach((type) => {
      const def = fieldRegistry.get(type)!
      const item = def.control!.item
      expect(item, `${type} 缺少子项定义`).toBeTruthy()
      const node = def.createDefault('k', `f_${type}`) as DataFieldNode
      const rule = def.toRule(node, ctx) as FormCreateRule
      expect(rule.options, `${type} 的候选项两轨不同源`).toEqual(item!.options(node, ctx))
    })
  })

  it('成员/部门候选取注入数据源，选项类取节点 options', () => {
    const member = fieldRegistry.get('member')!
    const memberNode = member.createDefault('k', 'owner') as DataFieldNode
    expect(member.control!.item!.options(memberNode, ctx)).toEqual([{ label: '张三', value: 'u1' }])

    const dept = fieldRegistry.get('departmentMultiple')!
    const deptNode = dept.createDefault('k', 'depts') as DataFieldNode
    expect(dept.control!.item!.options(deptNode, ctx)).toEqual([{ label: '销售部', value: 'd1' }])

    const radio = fieldRegistry.get('radio')!
    const radioNode = radio.createDefault('k', 'r') as DataFieldNode
    radioNode.options = [{ label: '是', value: 'y' }]
    expect(radio.control!.item!.options(radioNode, ctx)).toEqual([{ label: '是', value: 'y' }])
  })

  it('未注入数据源时成员/部门候选为空列表且不报错', () => {
    const bare = createContext()
    const node = fieldRegistry.get('member')!.createDefault('k', 'owner') as DataFieldNode
    expect(fieldRegistry.get('member')!.control!.item!.options(node, bare)).toEqual([])
  })

  it('每个字段都登记了专属图标，图标不再维护第二份目录', () => {
    fieldRegistry.list().forEach((def) => {
      expect(def.icon, `${def.type} 缺少 icon`).toBeTruthy()
      expect(fieldIcon(def.type)).toBe(def.icon)
    })
    // 子表单不声明 control（形态由 EngineSubForm 承载），但仍有图标与中文名
    expect(fieldRegistry.get('subform')!.control).toBeUndefined()
    expect(fieldIcon('not-exist')).toBe(InfoFilled)
  })
})

describe('字段类型清单单一化（新增字段只需改 types + registry）', () => {
  it('注册表登记的类型与 schema 契约清单完全一致', () => {
    const registered = fieldRegistry
      .list()
      .map((d) => d.type)
      .sort()
    expect(registered).toEqual([...KNOWN_FIELD_TYPES].sort())
  })

  it('子字段白名单等于注册表常用分组（不再各自硬编码）', () => {
    const common = fieldRegistry
      .listByGroup('common')
      .map((d) => d.type)
      .sort()
    expect([...SUBFIELD_ALLOWED_TYPES].sort()).toEqual(common)
  })

  it('联合类型由清单派生：清单每一项都是合法 FieldType', () => {
    KNOWN_FIELD_TYPES.forEach((type) => {
      expect(fieldRegistry.has(type), `${type} 在清单中但未注册`).toBe(true)
    })
  })
})
