/**
 * 校验规则映射（design.md 决策 5）：
 * 将 form-schema 的 ValidationRule[] 映射为 form-create 使用的
 * async-validator 规则数组，复用其校验与错误提示能力。
 *
 * 对应 specs/form-renderer「执行校验规则」、specs/form-schema「校验规则数据表达」。
 */

import type { DataFieldNode, PatternPreset, ValidationRule } from '@/schema/types'

/** async-validator 规则（宽松类型） */
export type AsyncValidatorRule = Record<string, any>

/** 正则格式预设表 */
export const PATTERN_PRESETS: Record<Exclude<PatternPreset, 'custom'>, RegExp> = {
  phone: /^1[3-9]\d{9}$/,
  email: /^[\w.-]+@[\w-]+(\.[\w-]+)+$/,
  url: /^https?:\/\/[^\s]+$/,
  idcard: /(^\d{15}$)|(^\d{17}(\d|X|x)$)/,
}

/** 预设格式的默认提示文案 */
const PRESET_MESSAGES: Record<Exclude<PatternPreset, 'custom'>, string> = {
  phone: '请输入正确的手机号',
  email: '请输入正确的邮箱',
  url: '请输入正确的网址',
  idcard: '请输入正确的身份证号',
}

/**
 * 解析单条 schema 校验规则为 async-validator 规则；无法识别时返回 null。
 */
function mapRule(rule: ValidationRule): AsyncValidatorRule | null {
  const message = rule.message
  const trigger = rule.trigger ?? 'blur'

  switch (rule.type) {
    case 'required':
      // 同 buildValidate：必填只判是否有值，不连带判定类型
      return { required: true, type: 'required', message: message ?? '此项为必填项', trigger }
    case 'maxLength':
      return typeof rule.value === 'number'
        ? { max: rule.value, message: message ?? `长度不能超过 ${rule.value} 个字符`, trigger }
        : null
    case 'minLength':
      return typeof rule.value === 'number'
        ? { min: rule.value, message: message ?? `长度不能少于 ${rule.value} 个字符`, trigger }
        : null
    case 'max':
      return typeof rule.value === 'number'
        ? { type: 'number', max: rule.value, message: message ?? `不能大于 ${rule.value}`, trigger }
        : null
    case 'min':
      return typeof rule.value === 'number'
        ? { type: 'number', min: rule.value, message: message ?? `不能小于 ${rule.value}`, trigger }
        : null
    case 'pattern': {
      const preset = rule.preset ?? 'custom'
      if (preset !== 'custom') {
        return {
          pattern: PATTERN_PRESETS[preset],
          message: message ?? PRESET_MESSAGES[preset],
          trigger,
        }
      }
      if (typeof rule.value === 'string' && rule.value.length > 0) {
        try {
          return {
            pattern: new RegExp(rule.value),
            message: message ?? '格式不正确',
            trigger,
          }
        } catch {
          return null
        }
      }
      return null
    }
    case 'custom':
      // 自定义规则以正则字符串表达（无脚本执行，保证纯数据契约）
      if (typeof rule.value === 'string' && rule.value.length > 0) {
        try {
          return { pattern: new RegExp(rule.value), message: message ?? '格式不正确', trigger }
        } catch {
          return null
        }
      }
      return null
    default:
      return null
  }
}

/**
 * 依据字段节点构建 form-create 的 validate 规则数组。
 * 节点的 `required` 标记会转换为一条必填规则（避免与 validate 中的 required 重复）。
 *
 * 必填规则 MUST 只判定「是否有值」而 SHALL NOT 连带判定值的类型：async-validator 仅在规则对象
 * 除 message 外只剩 `required` 一个键时才走与类型无关的必填校验器，一旦带上 `trigger` 便回落到
 * 缺省的 string 校验器，于是数字（如 ElInputNumber 产出的 number）会被判为类型不符，
 * 并被本规则的 message 覆盖成「此项为必填项」—— 表现为填了数字仍提示必填。
 * 故显式把 `type` 指向 async-validator 的必填校验器本身（`validators.required`），
 * 既保留 trigger 又消除类型判定；多选的值形态恒为数组，沿用 `type: 'array'`（同样能识别空数组）。
 *
 * @param node 数据字段节点
 * @param isMultiple 是否为多选字段（多选必填需校验数组非空，async-validator 用 type:'array'）
 */
export function buildValidate(node: DataFieldNode, isMultiple = false): AsyncValidatorRule[] {
  const result: AsyncValidatorRule[] = []

  if (node.required) {
    result.push(
      isMultiple
        ? {
            required: true,
            type: 'array',
            message: '请至少选择一项',
            trigger: 'change',
          }
        : {
            required: true,
            type: 'required',
            message: '此项为必填项',
            trigger: 'blur',
          },
    )
  }

  const extra = node.validate ?? []
  for (const rule of extra) {
    // required 已由 node.required 统一处理，跳过重复声明
    if (rule.type === 'required') continue
    const mapped = mapRule(rule)
    if (mapped) result.push(mapped)
  }

  return result
}
