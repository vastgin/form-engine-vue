/**
 * 布局字段定义 —— （分割线、说明文字、多标签页）。
 * 布局字段不参与数据收集；多标签页为容器，递归展开子字段。
 * 对应 specs/form-fields「布局字段渲染」、specs/form-schema「布局字段结构」、task 3.3。
 */

import { ChatLineSquare, Files, Minus } from '@element-plus/icons-vue'
import type {
  DividerFieldNode,
  LayoutFieldNode,
  TabsFieldNode,
  TextFieldNode,
} from '@/schema/types'
import type { FormCreateRule, LayoutFieldDefinition, RuleContext } from '../types'

/** 生成唯一 key 的简单工具（供默认标签页使用） */
function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

export const layoutFieldDefinitions: LayoutFieldDefinition[] = [
  {
    type: 'divider',
    label: '分割线',
    group: 'layout',
    isData: false,
    icon: Minus,
    createDefault: (key: string): DividerFieldNode => ({
      type: 'divider',
      key,
      title: '分割线',
    }),
    toRule: (node: LayoutFieldNode): FormCreateRule => ({
      type: 'engine-divider',
      native: true,
      props: { title: (node as DividerFieldNode).title ?? '' },
      col: { span: 24 },
    }),
  },
  {
    type: 'text',
    label: '说明文字',
    group: 'layout',
    isData: false,
    icon: ChatLineSquare,
    createDefault: (key: string): TextFieldNode => ({
      type: 'text',
      key,
      title: '说明文字',
      props: { content: '这是一段说明文字' },
    }),
    propEditors: [{ key: 'content', label: '说明内容', editor: 'textarea' }],
    toRule: (node: LayoutFieldNode): FormCreateRule => ({
      type: 'engine-text',
      native: true,
      props: {
        title: (node as TextFieldNode).title ?? '',
        content: ((node as TextFieldNode).props?.content as string) ?? '',
      },
      col: { span: 24 },
    }),
  },
  {
    type: 'tabs',
    label: '多标签页',
    group: 'layout',
    isData: false,
    icon: Files,
    createDefault: (key: string): TabsFieldNode => ({
      type: 'tabs',
      key,
      title: '多标签页',
      tabs: [
        { key: uid('tab'), title: '标签页1', fields: [] },
        { key: uid('tab'), title: '标签页2', fields: [] },
      ],
    }),
    toRule: (node: LayoutFieldNode, ctx: RuleContext): FormCreateRule => {
      const tabs = (node as TabsFieldNode).tabs ?? []
      const mapNodes = ctx.mapNodes ?? (() => [])
      const children: FormCreateRule[] = tabs.map((tab) => ({
        type: 'engine-tab-pane',
        native: true,
        props: { label: tab.title, name: tab.key },
        children: mapNodes(tab.fields),
      }))
      return {
        type: 'engine-tabs',
        native: true,
        // 默认选中首个页签（页签 name 为 tab.key，el-tabs 的内部缺省名与之不匹配）
        props: { activeName: tabs[0]?.key },
        children,
        col: { span: 24 },
      }
    },
  },
]
