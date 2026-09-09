/**
 * 字段宽度布局工具：把「字段宽度」以 24 栅格语义呈现。
 * - schema 中 `width` 仍存百分比（1-100），保持向后兼容；
 * - 设计器提供离散档位（1/4、1/3、1/2、2/3、3/4、整行），缺省为整行；
 * - `widthToSpan` 供设计器网格与 form-create rule 的 `col.span` 共用，保证所见即所得一致。
 * 对应 specs/form-schema「字段宽度布局」、form-designer「画布所见即所得展示」。
 */

/** 字段宽度缺省值（整行，100%） */
export const DEFAULT_FIELD_WIDTH = 100

/** 单个宽度档位：label 展示文案，value 为写入 schema 的百分比 */
export interface FieldWidthOption {
  label: string
  /** 百分比宽度（写入 node.width）；1/3、2/3 为 24 栅格的精确等分（8/24、16/24） */
  value: number
}

/** 离散宽度档位（默认整行 = 最后一项） */
export const FIELD_WIDTH_OPTIONS: FieldWidthOption[] = [
  { label: '1/4', value: 25 },
  { label: '1/3', value: (8 / 24) * 100 },
  { label: '1/2', value: 50 },
  { label: '2/3', value: (16 / 24) * 100 },
  { label: '3/4', value: 75 },
  { label: '整行', value: 100 },
]

/** 字段宽度百分比 -> form-create 24 栅格 span（缺省/非法按整行 24） */
export function widthToSpan(width?: number): number {
  if (!width || width <= 0) return 24
  return Math.max(1, Math.min(24, Math.round((width / 100) * 24)))
}

/** 把任意宽度百分比归一到最近的离散档位值（用于设计器控件回显，兼容历史自定义宽度） */
export function snapWidthPercent(width?: number): number {
  const w = width ?? DEFAULT_FIELD_WIDTH
  let best = DEFAULT_FIELD_WIDTH
  let diff = Number.POSITIVE_INFINITY
  for (const opt of FIELD_WIDTH_OPTIONS) {
    const d = Math.abs(opt.value - w)
    if (d < diff) {
      diff = d
      best = opt.value
    }
  }
  return best
}
