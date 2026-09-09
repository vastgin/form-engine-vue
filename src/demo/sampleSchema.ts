/**
 * 示例表单 schema：覆盖常用字段 + 高级字段（子表单）+ 布局字段 + 校验规则 + 显隐规则 + 静态隐藏。
 * 用于演示、端到端联调与验收（task 7.2）。
 */

import { SCHEMA_VERSION, type FormSchema } from '@/schema/types'

export const sampleSchema: FormSchema = {
  id: 'demo-order',
  name: '订单登记表',
  version: SCHEMA_VERSION,
  formConfig: {
    labelPosition: 'right',
    labelWidth: 120,
    size: 'default',
  },
  fields: [
    {
      type: 'text',
      key: 'l_intro',
      title: '填写说明',
      props: { content: '请如实填写订单信息，带 * 为必填项。' },
    },
    {
      type: 'input',
      key: 'f_source',
      field: 'sys_source',
      title: '数据来源',
      // 静态隐藏：填报时不展示该字段，但默认值仍随表单提交（区别于显隐规则隐藏会剔除值）
      hidden: true,
      value: 'web',
    },
    {
      type: 'input',
      key: 'f_customer',
      field: 'customer_name',
      title: '客户名称',
      required: true,
      placeholder: '请输入客户名称',
      validate: [{ type: 'maxLength', value: 20, message: '客户名称不超过 20 字' }],
    },
    {
      type: 'input',
      key: 'f_phone',
      field: 'phone',
      title: '联系电话',
      required: true,
      placeholder: '请输入手机号',
      validate: [{ type: 'pattern', preset: 'phone', message: '请输入正确的手机号' }],
    },
    {
      type: 'number',
      key: 'f_amount',
      field: 'amount',
      title: '订单金额',
      placeholder: '请输入金额',
      props: { precision: 2, min: 0 },
      validate: [{ type: 'min', value: 0, message: '金额不能为负' }],
    },
    {
      type: 'date',
      key: 'f_date',
      field: 'order_date',
      title: '下单日期',
      placeholder: '请选择日期',
      props: { dateType: 'date' },
    },
    { type: 'divider', key: 'l_div1', title: '订单信息' },
    {
      type: 'radio',
      key: 'f_order_type',
      field: 'order_type',
      title: '订单类型',
      required: true,
      options: [
        { label: '标准', value: '标准' },
        { label: '加急', value: '加急' },
        { label: '其他', value: '其他' },
      ],
      // 默认选中：单选类字段至多一项（在属性面板「选项」的「默认」列勾选）
      value: '标准',
    },
    {
      type: 'textarea',
      key: 'f_remark',
      field: 'remark',
      title: '其他说明',
      placeholder: '请补充说明',
      props: { rows: 3 },
      visibleRule: {
        logic: 'and',
        action: 'show',
        conditions: [{ field: 'order_type', operator: 'eq', value: '其他' }],
      },
    },
    {
      type: 'selectMultiple',
      key: 'f_tags',
      field: 'tags',
      title: '订单标签',
      placeholder: '请选择标签',
      options: [
        { label: '重点客户', value: 'vip' },
        { label: '首次下单', value: 'first' },
        { label: '需开票', value: 'invoice' },
      ],
      // 默认选中：多选类字段可勾多项
      value: ['vip'],
    },
    {
      type: 'subform',
      key: 'f_items',
      field: 'order_items',
      title: '订单明细',
      required: true,
      subFields: [
        {
          type: 'input',
          key: 'sf_product',
          field: 'product_name',
          title: '产品名称',
          required: true,
          placeholder: '请输入产品名称',
        },
        {
          type: 'number',
          key: 'sf_qty',
          field: 'qty',
          title: '数量',
          placeholder: '请输入数量',
          props: { precision: 0, min: 1 },
          validate: [{ type: 'min', value: 1, message: '数量至少为 1' }],
        },
        {
          type: 'input',
          key: 'sf_code',
          field: 'internal_code',
          title: '内部编码',
          // 隐藏的列：填报态不呈现该列，已注入的值仍随行数据输出
          hidden: true,
        },
      ],
      // 已有字段池：曾配置为子字段、后从明细移除但保留定义，可在设计器「已有字段」中原样加回
      fieldPool: [
        {
          type: 'number',
          key: 'sf_price',
          field: 'unit_price',
          title: '单价',
          placeholder: '请输入单价',
          props: { precision: 2, min: 0 },
        },
        {
          type: 'input',
          key: 'sf_remark',
          field: 'remark',
          title: '备注',
          placeholder: '选填',
        },
      ],
      props: { minRows: 1, maxRows: 5, allowBatchRemove: true },
    },
    {
      type: 'tabs',
      key: 'l_tabs',
      title: '更多信息',
      tabs: [
        {
          key: 'tab_contact',
          title: '联系人',
          fields: [
            {
              type: 'member',
              key: 'f_owner',
              field: 'owner',
              title: '负责人',
              placeholder: '请选择负责人',
            },
          ],
        },
        {
          key: 'tab_dept',
          title: '归属部门',
          fields: [
            {
              type: 'department',
              key: 'f_dept',
              field: 'dept',
              title: '部门',
              placeholder: '请选择部门',
            },
          ],
        },
      ],
    },
  ],
}

/** 演示用成员/部门候选数据源 */
export const sampleDataSources = {
  members: [
    { label: '张三', value: 'u_001' },
    { label: '李四', value: 'u_002' },
    { label: '王五', value: 'u_003' },
  ],
  departments: [
    { label: '销售部', value: 'd_001' },
    { label: '技术部', value: 'd_002' },
    { label: '财务部', value: 'd_003' },
  ],
}
