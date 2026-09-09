/**
 * 高级字段定义 —— （当前仅子表单，为地址/图片/附件预留位置）。
 * 子表单既是数据字段（值为对象数组），又是子字段容器；其 toRule 产出 `engine-subform`
 * 规则并注入子字段列配置与成员/部门数据源，供自研明细表格渲染。
 * 对应 specs/form-fields「子表单字段定义」、design D1/D4、task 2.2。
 */

import { Grid } from '@element-plus/icons-vue'
import { SUBFORM_DEFAULT_MAX_ROWS, type SubFormNode } from '@/schema/types'
import type { FormCreateRule, RuleContext, SubFormFieldDefinition } from '../types'

export const advancedFieldDefinitions: SubFormFieldDefinition[] = [
  {
    type: 'subform',
    label: '子表单',
    group: 'advanced',
    isData: true,
    icon: Grid,
    // 不声明 control：子表单的形态由专属组件 EngineSubForm 承载（design D1），
    // 其内部单元格再复用 FieldControl 渲染子字段控件（design D3）。
    createDefault: (key: string, field: string): SubFormNode => ({
      type: 'subform',
      key,
      field,
      title: '子表单',
      required: false,
      // 默认仅一个空容器：不预置子字段，由用户在子表单画布内自行添加
      subFields: [],
      // minRows 仅表示新建时的初始空行数（默认 0，不预置行）；不再作为删除下限
      // maxRows 拖入时按缺省上限 200 写入（硬上限 500，可在属性面板上调）
      // allowBatchRemove 默认关闭：序号列保持为序号，不提供批量删除入口
      props: { minRows: 0, maxRows: SUBFORM_DEFAULT_MAX_ROWS, allowBatchRemove: false },
    }),
    propEditors: [
      { key: 'minRows', label: '初始行数', editor: 'number', default: 0 },
      { key: 'maxRows', label: '最多行数', editor: 'number', default: SUBFORM_DEFAULT_MAX_ROWS },
      // 子表单的类型配置由属性面板专用区呈现（含行数钳制与冲突提示），此处仅作为配置元信息登记
      { key: 'allowBatchRemove', label: '允许批量删除', editor: 'switch', default: false },
    ],
    toRule: (node: SubFormNode, ctx: RuleContext): FormCreateRule => ({
      type: 'engine-subform',
      field: node.field,
      native: true,
      // 静态隐藏：整块明细不渲染，但值仍随表单输出（不用 `ignore`，故数据保留）
      ...(node.hidden === true ? { hidden: true } : {}),
      // 子表单值以数组承载，交由 form-create 的 modelValue/update:modelValue 协议绑定
      value: [],
      props: {
        title: node.title ?? '',
        // 供 EngineSubForm 在注入的 subFormErrors 中定位自身错误（design D2，task 5.2）
        field: node.field,
        // 隐藏优先：隐藏的整块子表单不标注必填（其行校验已在渲染层跳过）
        required: node.required === true && node.hidden !== true,
        readonly: node.readonly === true || ctx.readonly === true,
        // 行数钳制统一在渲染层发生（design D7），此处透传原始配置
        minRows: node.props?.minRows,
        maxRows: node.props?.maxRows,
        // 固定左/右列数透传原始值，超列数与非法值钳制在渲染层发生（design D9）
        fixedLeftColumns: node.props?.fixedLeftColumns,
        fixedRightColumns: node.props?.fixedRightColumns,
        // 批量删除开关：仅显式开启时为 true（只读态的入口收敛在渲染层）
        allowBatchRemove: node.props?.allowBatchRemove === true,
        subFields: node.subFields ?? [],
        dataSources: ctx.dataSources ?? { members: [], departments: [] },
      },
      col: { span: 24 },
    }),
  },
]
