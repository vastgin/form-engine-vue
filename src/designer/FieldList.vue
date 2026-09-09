<template>
  <draggable
    :list="fields"
    group="fields"
    item-key="key"
    class="field-list"
    filter=".field-card__no-drag"
    :prevent-on-filter="false"
    :animation="150"
  >
    <template #item="{ element }">
      <div
        class="field-card"
        :data-field-key="element.key"
        :class="{
          'is-selected': element.key === selectedKey,
          'is-layout': !isData(element) && !isSubFormField(element),
          'is-hidden': isHidden(element),
        }"
        :style="{ gridColumn: `span ${fieldSpan(element)}` }"
        @click="emit('select', element.key)"
      >
        <!-- 卡片工具条：拖动/类型图标 + 状态标记（已发布/显隐/隐藏）+ 删除（不再展示类型名与字段标识）。
             整卡可拖拽，仅交互子区域以 __no-drag 排除（见下方 filter） -->
        <div class="field-card__bar">
          <el-icon class="field-card__handle" title="拖动排序">
            <Rank />
          </el-icon>
          <el-icon class="field-card__type-icon">
            <component :is="fieldIcon(element.type)" />
          </el-icon>
          <el-tag v-if="element.published" size="small" type="success" effect="plain">
            已发布
          </el-tag>
          <el-tag v-if="element.visibleRule" size="small" type="warning" effect="plain">
            显隐
          </el-tag>
          <el-tag v-if="isHidden(element)" size="small" type="info" effect="plain">隐藏</el-tag>
          <span class="field-card__spacer" />
          <el-button
            link
            type="danger"
            size="small"
            class="field-card__no-drag"
            @click.stop="emit('remove', element.key)"
          >
            删除
          </el-button>
        </div>

        <!-- 多标签页容器：嵌套渲染每个标签页的子字段列表（保持可交互），沿用整表标签对齐；
             页签本身可新增（addable）与删除（closable，仅剩一个时不再展示删除入口），
             默认选中首个页签，点击页签头则选中该容器，名称到右侧「字段属性」修改 -->
        <div
          v-if="element.type === 'tabs'"
          class="field-card__tabs field-card__no-drag"
          @click.stop
        >
          <el-tabs
            v-model="activeTabKeys[element.key]"
            type="border-card"
            addable
            :closable="element.tabs.length > 1"
            @tab-click="emit('select', element.key)"
            @tab-add="emit('add-tab', element.key)"
            @tab-remove="(name: string | number) => emit('remove-tab', element.key, String(name))"
          >
            <el-tab-pane
              v-for="tab in element.tabs"
              :key="tab.key"
              :label="tab.title"
              :name="tab.key"
            >
              <FieldList
                :fields="tab.fields"
                :selected-key="selectedKey"
                :label-position="labelPosition"
                :label-width="labelWidth"
                @select="emit('select', $event)"
                @remove="emit('remove', $event)"
                @add-subfield="(k, t) => emit('add-subfield', k, t)"
                @copy-subfield="(k, s) => emit('copy-subfield', k, s)"
                @restore-subfield="(k, p) => emit('restore-subfield', k, p)"
                @add-tab="(k) => emit('add-tab', k)"
                @remove-tab="(k, t) => emit('remove-tab', k, t)"
              />
            </el-tab-pane>
          </el-tabs>
          <p class="field-card__tabs-hint">
            点页签栏「+」新增、「×」删除（仅剩一个时不可删）；选中页签后在右侧「字段属性」改名称
          </p>
        </div>

        <!-- 子表单：整表级标签（标题 + 字段标识）+ 明细表格式所见即所得预览 -->
        <template v-else-if="isSubFormField(element)">
          <div class="field-card__field-label">
            <div class="field-card__label-title">
              <span v-if="element.required" class="field-card__required">*</span>
              <span class="field-card__title">{{ element.title }}</span>
            </div>
            <div class="field-card__label-code">{{ element.field }}</div>
          </div>
          <div class="field-card__subform field-card__no-drag">
            <SubFormBody
              :node="element"
              :selected-key="selectedKey"
              @select="emit('select', $event)"
              @add="(t) => emit('add-subfield', element.key, t)"
              @copy="(k) => emit('copy-subfield', element.key, k)"
              @restore="(k) => emit('restore-subfield', element.key, k)"
              @remove="emit('remove', $event)"
            />
          </div>
        </template>

        <!-- 其余字段：按标签对齐方式呈现「标签（标题 + 字段标识）+ 所见即所得控件预览」 -->
        <div
          v-else
          class="field-card__body"
          :class="`is-label-${labelPosition}`"
          :style="{ '--lbl-w': labelWidth + 'px' }"
        >
          <div class="field-card__field">
            <div v-if="isData(element)" class="field-card__field-label">
              <div class="field-card__label-title">
                <span v-if="element.required" class="field-card__required">*</span>
                <span class="field-card__title">{{ element.title }}</span>
              </div>
              <div class="field-card__label-code">{{ element.field }}</div>
            </div>
            <div class="field-card__control">
              <FieldPreview :node="element" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </draggable>
</template>

<script setup lang="ts">
/**
 * 画布字段列表（递归）：支持拖拽排序、从字段面板拖入（clone）、选中、删除，
 * 多标签页容器内嵌套渲染子列表。
 * - 整张卡片都是拖拽热区（不设 handle），卡片内的交互子区域（删除按钮、
 *   多标签页容器、子表单主体）以 `.field-card__no-drag` 声明为 Sortable filter，
 *   并关闭 preventOnFilter 以保留其点击与聚焦能力；
 * - 每个字段卡片按「字段宽度」在 24 栅格中占位（布局/容器/子表单恒整行），
 *   使设计器与预览的并排布局一致；
 * - 卡片标签区把「标题（标签名）」在上、「字段标识（字段名）」在下合并展示，
 *   并按整表 labelPosition（top/left/right）与 labelWidth 呈现，对齐预览所见；
 *   两者均为**必填** prop：缺省值只存于契约层 `src/schema/defaults.ts`，本层不持有兜底值；
 * - 卡片工具条以「已发布」「显隐」「隐藏」标记呈现字段状态（已发布字段的字段标识在属性面板锁定；
 *   静态隐藏的字段在画布仍可见可编辑，仅弱化呈现以提示填报时不展示）；
 * - 卡片带 `data-field-key` 供左侧「字段」清单点击定位时查找并滚动到对应卡片；
 * - 多标签页容器页签可新增/删除（el-tabs 页签栏入口）且默认选中首个页签，页签名称由属性面板改；
 *   子表单的「已有字段」加回经 restore-subfield 上抛；
 *   具体变更由上层（FormDesigner）走 schemaOps 或 patch 落库。
 * 对应 specs/form-designer「画布所见即所得展示」「字段宽度布局」「标签对齐适配」「多标签页容器页签管理」、task 7.3 / 11。
 */
import { reactive, watch } from 'vue'
import draggable from 'vuedraggable'
import { Rank } from '@element-plus/icons-vue'
import {
  isDataField,
  isSubFormField,
  isTabsField,
  type FieldNode,
  type LabelPosition,
} from '@/schema/types'
import { widthToSpan } from '@/schema/width'
import FieldPreview from './FieldPreview.vue'
import SubFormBody from './SubFormBody.vue'
import { fieldIcon } from './fieldIcons'

defineOptions({ name: 'FieldList' })

// labelPosition / labelWidth 为必填（不设 withDefaults 兜底）：缺省值由调用方读
// `resolveFormConfig` 后传入，使全项目只有一处兜底点（design.md D6）
const props = defineProps<{
  fields: FieldNode[]
  selectedKey?: string
  /** 整表标签对齐方式（由设计器传入解析后的值，画布所见即所得） */
  labelPosition: LabelPosition
  /** 整表标签宽度（px），left/right 对齐时标签列占位宽度 */
  labelWidth: number
}>()

const emit = defineEmits<{
  (e: 'select', key: string): void
  (e: 'remove', key: string): void
  (e: 'add-subfield', subFormKey: string, type: string): void
  (e: 'copy-subfield', subFormKey: string, subKey: string): void
  /** 从子表单「已有字段」池加回一个字段 */
  (e: 'restore-subfield', subFormKey: string, pooledKey: string): void
  (e: 'add-tab', tabsKey: string): void
  (e: 'remove-tab', tabsKey: string, tabKey: string): void
}>()

function isData(node: FieldNode): boolean {
  return isDataField(node)
}

/**
 * 字段是否被静态隐藏（仅数据字段与子表单可配，布局字段恒为否）。
 * 隐藏只影响填报态与预览，设计画布仍保留该卡片供编辑。
 */
function isHidden(node: FieldNode): boolean {
  if (isDataField(node) || isSubFormField(node)) return node.hidden === true
  return false
}

/** 卡片在 24 栅格中的占位列数：常用数据字段按宽度换算，布局/容器/子表单恒整行 */
function fieldSpan(node: FieldNode): number {
  return isDataField(node) ? widthToSpan(node.width) : 24
}

/**
 * 本层各多标签页容器当前激活的页签 key（容器 key -> 页签 key）。
 * el-tabs 未绑定时其内部缺省名为 "0"，与页签实际的 name（tab.key）不匹配会导致
 * 没有任何页签被选中，故在此显式托管：默认选中首个页签，当前页签被删除或列表
 * 变化后自动回落到首个可用页签（嵌套容器由各自的子 FieldList 实例自行托管）。
 */
const activeTabKeys = reactive<Record<string, string>>({})

watch(
  () =>
    props.fields.filter(isTabsField).map((n) => ({ key: n.key, tabs: n.tabs.map((t) => t.key) })),
  (list) => {
    for (const { key, tabs } of list) {
      const current = activeTabKeys[key]
      activeTabKeys[key] = current && tabs.includes(current) ? current : (tabs[0] ?? '')
    }
  },
  { immediate: true, deep: true },
)
</script>

<style scoped>
.field-list {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 10px;
  min-height: 40px;
}
.field-card {
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  padding: 6px 10px 10px;
  background: var(--el-bg-color);
  /* 整卡可拖拽（点击仍选中），交互子区域另行恢复光标 */
  cursor: move;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    background 0.2s;
}
.field-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.field-card:hover .field-card__bar {
  opacity: 1;
}
.field-card.is-selected {
  border: 1px solid var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
}
.field-card.is-layout {
  background: var(--el-fill-color-light);
}
/* 静态隐藏的字段：换底色并弱化控件区，提示「填报时不展示但值仍提交」 */
.field-card.is-hidden {
  background: var(--el-fill-color-lighter);
}
.field-card.is-hidden .field-card__control,
.field-card.is-hidden .field-card__subform {
  opacity: 0.5;
}

/* 工具条 */
.field-card__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.65;
  transition: opacity 0.2s;
}
.field-card__handle {
  cursor: move;
  color: var(--el-text-color-secondary);
}
.field-card__type-icon {
  color: var(--el-color-primary);
  font-size: 14px;
}
.field-card__spacer {
  flex: 1;
}

/* 预览主体 */
.field-card__body {
  margin-top: 6px;
}
.field-card__field {
  display: flex;
  gap: 8px;
}
/* 标签在上（top）：整体纵向排列 */
.is-label-top .field-card__field {
  flex-direction: column;
}
.is-label-top .field-card__field-label {
  width: 100%;
  text-align: left;
}
/* 标签在左（left/right）：标签列固定宽度，文字左/右对齐 */
.is-label-left .field-card__field,
.is-label-right .field-card__field {
  flex-direction: row;
  align-items: flex-start;
}
.is-label-left .field-card__field-label {
  width: var(--lbl-w);
  flex-shrink: 0;
  text-align: left;
}
.is-label-right .field-card__field-label {
  width: var(--lbl-w);
  flex-shrink: 0;
  text-align: right;
}

/* 合并标签：上行标题（标签名）、下行字段标识（字段名） */
.field-card__field-label {
  font-size: 13px;
  line-height: 20px;
}
.field-card__label-title {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--el-text-color-primary);
}
.is-label-left .field-card__label-title {
  justify-content: flex-start;
}
.is-label-right .field-card__label-title {
  justify-content: flex-end;
}
.field-card__required {
  color: var(--el-color-danger);
  font-weight: 600;
}
/* 必填星号位置随标签对齐联动（与运行态 el-form 的 asterisk-right / asterisk-left 一致）：
   标签左对齐时星号移到标签文字右侧；右对齐与顶部对齐维持在标签左侧。
   子表单卡片的标签恒置于明细上方（不受 labelPosition 影响），故不加移位规则 */
.is-label-left .field-card__required {
  order: 1;
}
.field-card__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-card__label-code {
  font-size: 11px;
  line-height: 16px;
  color: var(--el-text-color-placeholder);
  font-family: var(--el-font-family-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 设计态屏蔽控件交互，点击统一落到卡片上（选中 / 拖拽） */
.field-card__control {
  flex: 1;
  min-width: 0;
  pointer-events: none;
  user-select: none;
}

.field-card__tabs {
  margin-top: 8px;
  cursor: default;
}
/* 页签操作提示 */
.field-card__tabs-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-text-color-placeholder);
}
.field-card__subform {
  cursor: default;
}
</style>
