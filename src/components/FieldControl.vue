<template>
  <div class="field-control">
    <!--
      控件形态完全由注册表的 control 定义驱动（统一渲染单轨）：本组件不再按字段类型分支。
      component / props / 候选项来源与运行态 rule 共用注册表里的同一份声明，
      新增字段类型无需改动此处（design 决策 3）。
    -->
    <component
      v-if="control"
      :is="control.component"
      v-bind="controlProps"
      :class="control.class"
      :model-value="normalizedValue"
      @update:model-value="onUpdate"
    >
      <template v-if="item">
        <component
          :is="item.component"
          v-for="opt in resolvedOptions"
          :key="String(opt.value)"
          v-bind="itemProps(opt)"
        >
          <template v-if="item.labelAs === 'slot'">{{ opt.label }}</template>
        </component>
        <!-- 预览态且候选为空：仅内联展开的组控件给出可视化提示（下拉类的候选在弹出层内，提示不可见） -->
        <span
          v-if="control.itemsInline && preview && !resolvedOptions.length"
          class="field-control__empty"
        >
          请在右侧「选项」中配置
        </span>
      </template>
    </component>

    <!-- 兜底：注册表未声明 control（布局/容器字段由专属组件承载，不应到达此处） -->
    <span v-else class="field-control__empty">{{ fieldLabel }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * 共享字段控件：按注册表的控件定义渲染与运行态一致的 Element Plus 控件，支持 v-model。
 * 设计器画布预览（FieldPreview）与子表单填报单元格（EngineSubForm）复用它，
 * 避免「画布一套、填报一套」的漂移（design D3）。
 *
 * - 控件形态（组件、属性、候选项来源、值形态）单一来源于 `FieldDefinition.control`，
 *   运行态的 form-create rule 亦由同一份定义派生（见 registry/fields/common.ts `defineDataField()`），
 *   故本组件不含任何 `type === 'xxx'` 分支；
 * - 只读以控件的 `disabled` 承载（与主表轨道在适配层叠加 `rule.props.disabled` 同一口径），
 *   取「节点自身 readonly」与「宿主下发 readonly」的并集；
 * - 预览态（preview）由外层容器 `pointer-events: none` 屏蔽交互，此处不加 disabled 以免灰化失真（design D3）；
 * - 子字段的 width 不参与渲染（明细列宽由表格布局决定，spec form-fields「子字段宽度不影响明细布局」）。
 */
import { computed } from 'vue'
import { fieldRegistry } from '@/registry'
import type { ControlContext, ControlValueKind } from '@/registry/types'
import type { DataFieldNode, FieldOption } from '@/schema/types'

const props = withDefaults(
  defineProps<{
    /** 常用数据字段节点 */
    node: DataFieldNode
    /** 控件值（v-model） */
    modelValue?: unknown
    /** 预览态：仅展示，交互由外层 pointer-events 屏蔽 */
    preview?: boolean
    /**
     * 宿主下发的只读（如子表单整体只读、整表只读）：与节点自身的 `readonly` 取并集后
     * 以控件 disabled 呈现；预览态不生效（画布只读字段不灰化，design D3）。
     */
    readonly?: boolean
    /** 成员/部门候选数据源（运行期注入） */
    dataSources?: { members?: FieldOption[]; departments?: FieldOption[] }
  }>(),
  { modelValue: undefined, preview: false, readonly: false, dataSources: () => ({}) },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: unknown): void }>()

/** 控件定义：注册表为单一来源，未声明 control 的类型走兜底文案 */
const control = computed(() => fieldRegistry.get(props.node.type)?.control)
/** 组合控件的子项定义（单选/复选/下拉） */
const item = computed(() => control.value?.item)
/** 兜底文案：类型中文名以注册表为准 */
const fieldLabel = computed(() => fieldRegistry.get(props.node.type)?.label ?? props.node.type)

/** 控件渲染上下文（结构上是 RuleContext 的子集，两轨可共用） */
const ctx = computed<ControlContext>(() => ({
  dataSources: props.dataSources ?? {},
  preview: props.preview,
}))

/** 控件是否禁用：只读语义落在控件上（主表轨道由适配层写 rule.props.disabled，两轨同一表现） */
const controlDisabled = computed(
  () => !props.preview && (props.readonly === true || props.node.readonly === true),
)

/** 控件属性：与运行态 rule.props 共用注册表里的同一份映射，disabled 由宿主侧叠加 */
const controlProps = computed<Record<string, any>>(() =>
  control.value
    ? { ...control.value.props(props.node, ctx.value), disabled: controlDisabled.value }
    : {},
)

/** 候选项：与 rule.options 共用注册表里的同一份取数逻辑（选项类取节点 options，成员/部门取注入数据源） */
const resolvedOptions = computed<FieldOption[]>(() =>
  item.value ? item.value.options(props.node, ctx.value) : [],
)

/** 按注册表声明的值形态归一化 modelValue，避免控件收到非法值 */
const normalizedValue = computed(() => normalizeValue(control.value?.valueKind, props.modelValue))

/** 子项属性：下拉项以 label 属性承载文本，单选/复选以默认插槽承载 */
function itemProps(opt: FieldOption): Record<string, unknown> {
  return item.value?.labelAs === 'prop'
    ? { value: opt.value, label: opt.label }
    : { value: opt.value }
}

/**
 * 值归一化（形态由 `ControlDefinition.valueKind` 声明）：
 * `scalar` 保留 string|number 原型 —— 选项值可能是数字，强转字符串会导致勾选不中；
 * `dateString` 空串归一为 undefined —— 日期控件收到空串会呈现非法态。
 */
function normalizeValue(kind: ControlValueKind | undefined, raw: unknown): unknown {
  switch (kind) {
    case 'number':
      return typeof raw === 'number' ? raw : undefined
    case 'dateString':
      return typeof raw === 'string' && raw ? raw : undefined
    case 'array':
      return Array.isArray(raw) ? raw : []
    case 'scalar':
      return typeof raw === 'string' || typeof raw === 'number' ? raw : ''
    default:
      return raw == null ? '' : String(raw)
  }
}

function onUpdate(v: unknown): void {
  emit('update:modelValue', v)
}
</script>

<style scoped>
.field-control {
  width: 100%;
}
.field-control__full {
  width: 100%;
}
.field-control__group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  min-height: 24px;
}
.field-control__empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
