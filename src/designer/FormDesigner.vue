<template>
  <div class="form-designer">
    <!-- 顶部工具栏 -->
    <div class="form-designer__toolbar">
      <el-input v-model="schema.name" size="small" style="width: 200px" placeholder="表单名称" />
      <span class="form-designer__spacer" />
      <el-button size="small" @click="onPreview">预览</el-button>
      <el-button size="small" @click="onExport">导出</el-button>
      <el-button size="small" @click="importVisible = true">导入</el-button>
      <el-button size="small" type="primary" @click="onSave">保存</el-button>
      <!-- 发布：常驻入口，可反复发布（每次发布版本递增），已发布字段的标识自此不可改 -->
      <el-tag v-if="isPublished" size="small" type="success" effect="plain">
        已发布 v{{ publishedVersion }}
      </el-tag>
      <el-button size="small" type="success" @click="onPublish">发布</el-button>
    </div>

    <!-- 三区布局：字段面板 / 画布 / 属性面板 -->
    <div class="form-designer__body">
      <aside class="form-designer__left">
        <el-tabs v-model="leftTab" class="form-designer__tabs" stretch>
          <!-- 组件：可用控件目录（拖入即新建字段） -->
          <el-tab-pane label="组件" name="component">
            <FieldPalette />
          </el-tab-pane>
          <!-- 字段：发布时的字段清单（可拖回已删字段，已在画布的置灰可定位） -->
          <el-tab-pane label="字段" name="published">
            <PublishedFieldsPanel
              :entries="publishedCatalog"
              :fields="schema.fields"
              @locate="onLocateField"
            />
          </el-tab-pane>
        </el-tabs>
      </aside>

      <!-- 画布空白点击：判定用 closest 而非依赖 self 修饰符——空白高度由内层字段列表容器承载，
           self 依赖精确的 DOM 层级会漏判（design.md D8）；绑在画布外层以覆盖区内全部非卡片区域 -->
      <main class="form-designer__canvas" @click="onCanvasClick">
        <div class="form-designer__canvas-inner">
          <FieldList
            class="form-designer__list"
            :fields="schema.fields"
            :selected-key="selectedKey"
            :label-position="resolvedFormConfig.labelPosition"
            :label-width="resolvedFormConfig.labelWidth"
            @select="onSelect"
            @remove="onRemove"
            @add-subfield="onAddSubField"
            @copy-subfield="onCopySubField"
            @restore-subfield="onRestoreSubField"
            @add-tab="onAddTab"
            @remove-tab="onRemoveTab"
          />
          <p v-if="schema.fields.length === 0" class="form-designer__hint">
            从左侧拖拽字段到此处开始设计
          </p>
        </div>
      </main>

      <aside class="form-designer__right">
        <el-tabs v-model="panelTab" class="form-designer__tabs" stretch>
          <el-tab-pane label="字段属性" name="field">
            <PropertyPanel :node="selectedNode" :data-fields="dataFields" @patch="onPatch" />
          </el-tab-pane>
          <el-tab-pane label="表单属性" name="form">
            <FormPropertyPanel
              :config="schema.formConfig ?? {}"
              :data-fields="dataFields"
              @patch="onPatchFormConfig"
            />
          </el-tab-pane>
        </el-tabs>
      </aside>
    </div>

    <!-- 预览对话框：复用渲染器 -->
    <el-dialog v-model="previewVisible" title="表单预览" width="720px" destroy-on-close>
      <FormRenderer v-if="previewVisible" :schema="schema" :data-sources="dataSources" />
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog v-model="importVisible" title="导入 Schema" width="560px">
      <el-upload
        drag
        :auto-upload="false"
        :show-file-list="false"
        accept="application/json,.json"
        :on-change="onFileChange"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">将 JSON 文件拖到此处，或<em>点击选择</em></div>
      </el-upload>
      <el-input
        v-model="importText"
        type="textarea"
        :rows="6"
        placeholder="或直接粘贴 schema JSON"
        style="margin-top: 12px"
      />
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" @click="onImport">导入</el-button>
      </template>
    </el-dialog>

    <!-- 结构问题清单（design.md D7）：保存/发布被 error 级问题阻断时一次列出全部条目，
         避免「改一处 → 再点一次 → 才看到下一处」；带 fieldKey 的条目可点击定位到画布卡片 -->
    <el-dialog v-model="issuesVisible" title="结构问题清单" width="760px">
      <el-table :data="issueList" size="small" max-height="360" class="form-designer__issues">
        <el-table-column label="分类" width="150">
          <template #default="{ row }">{{ issueLabel(row.code) }}</template>
        </el-table-column>
        <el-table-column label="问题" prop="message" min-width="240" show-overflow-tooltip />
        <el-table-column label="位置" prop="path" width="180" />
        <el-table-column label="操作" width="72" align="center">
          <template #default="{ row }">
            <!-- 表单级问题（无 fieldKey）没有对应卡片，故不提供定位入口 -->
            <el-button
              v-if="row.fieldKey"
              link
              type="primary"
              size="small"
              class="form-designer__issue-locate"
              @click="onLocateIssue(row)"
            >
              定位
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button type="primary" @click="issuesVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 可视化表单设计器：组件面板 / 画布 / 属性面板三区布局，含表单级配置、
 * 预览、导入导出、保存与发布。对应 specs/form-designer 全部需求、task 7.1 / 7.6 / 7.7。
 * 左侧面板分「组件」（可拖入的控件目录）与「字段」（发布时的字段清单）两个 tab。
 * 保存与发布共用同一道前置校验（结构校验），不通过则阻断并一次呈现全部 error 级问题的
 * 问题清单（逐条可定位到画布字段）；提示措辞一律由问题的分类码决定，不匹配文案子串。
 * 发布：校验通过后给当前全部字段打上 published 标记，并快照主表字段定义到
 * formConfig.publishedFields；已标记字段的字段标识在属性面板中被锁定。
 * 不设「取消发布」（已发布字段的标识一经发布永久不可改），发布按钮常驻且可重复执行，
 * 每次发布使 formConfig.publishedVersion 递增。子表单的子字段被删除时留存到其「已有
 * 字段」池（fieldPool），可从画布原样加回（沿用字段标识）。
 */
import { computed, nextTick, provide, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import FieldPalette from './FieldPalette.vue'
import PublishedFieldsPanel from './PublishedFieldsPanel.vue'
import FieldList from './FieldList.vue'
import PropertyPanel from './PropertyPanel.vue'
import FormPropertyPanel from './FormPropertyPanel.vue'
import { FormRenderer } from '@/renderer'
import { fieldRegistry } from '@/registry'
import type { FieldDefinition } from '@/registry/types'
import { collectDataFields } from '@/schema/traverse'
import {
  isSubFormField,
  type FieldNode,
  type FieldType,
  type FormConfig,
  type FormSchema,
} from '@/schema/types'
import { validateSchema, type SchemaIssue, type SchemaIssueCode } from '@/schema/validate'
import { resolveFormConfig } from '@/schema/defaults'
import {
  createNode,
  findNodeByKey,
  removeNodeByKey,
  updateNodeByKey,
  addSubField,
  copySubField,
  markAllPublished,
  buildPublishedCatalog,
  findCanvasFieldByFieldId,
  removeSubFieldToPool,
  restorePooledSubField,
  addTab,
  removeTab,
} from './schemaOps'
import { createEmptySchema, downloadSchema, importSchema, saveSchema } from './schemaIO'
import { issueLabel } from './issueLabels'

const props = withDefaults(
  defineProps<{
    modelValue?: FormSchema
    dataSources?: { members?: any[]; departments?: any[] }
  }>(),
  { modelValue: undefined, dataSources: () => ({}) },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: FormSchema): void }>()

const schema = ref<FormSchema>(props.modelValue ?? createEmptySchema())
const selectedKey = ref<string>('')
/** 左侧面板当前 tab：「组件」控件目录 /「字段」已发布字段清单 */
const leftTab = ref<'component' | 'published'>('component')
/** 右侧面板当前 tab：无选中字段时为「表单属性」，选中字段时为「字段属性」（design D1） */
const panelTab = ref<'field' | 'form'>('form')
const previewVisible = ref(false)
const importVisible = ref(false)
const importText = ref('')
/** 结构问题清单弹窗可见性（保存/发布被 error 级问题阻断时打开） */
const issuesVisible = ref(false)
/** 清单条目：本次阻断的**全部** error 级问题（MUST NOT 只留第一条） */
const issueList = ref<SchemaIssue[]>([])

watch(
  () => props.modelValue,
  (val) => {
    if (val) schema.value = val
  },
)
watch(schema, (val) => emit('update:modelValue', val), { deep: true })

// 供字段面板拖拽 clone 时创建新节点（分配唯一 key/field）
provide(
  'fieldFactory',
  (type: FieldType): FieldDefinition & Record<string, unknown> =>
    createNode(type, schema.value.fields) as unknown as FieldDefinition & Record<string, unknown>,
)

const dataFields = computed(() => collectDataFields(schema.value.fields))
/**
 * 表单级布局配置的解析结果：画布与填报态共读同一份缺省值
 *（`src/schema/defaults.ts` 为全项目唯一出处），本层 MUST NOT 再内联第二份兜底值
 *（历史上标签对齐与标签宽度的回退值曾在本文件与 FieldList 各自持有一份），
 * 否则画布呈现的标签宽度会与填报态漂移。
 */
const resolvedFormConfig = computed(() => resolveFormConfig(schema.value.formConfig))
/** 表单是否已发布（工具栏状态标记与属性面板的标识锁定均据此） */
const isPublished = computed(() => schema.value.formConfig?.published === true)
/** 发布版本号（工具栏标记展示；缺省按 0，首次发布为 1） */
const publishedVersion = computed(() => schema.value.formConfig?.publishedVersion ?? 0)
/** 已发布字段清单（发布当时快照，缺省为空） */
const publishedCatalog = computed(() => schema.value.formConfig?.publishedFields ?? [])
const selectedNode = computed<FieldNode | null>(
  () => findNodeByKey(schema.value.fields, selectedKey.value)?.node ?? null,
)

// 选中上下文联动 tab：有选中→字段属性，清空→表单属性；手动切 tab 不改 selectedKey（design D1）
watch(selectedKey, (key) => {
  panelTab.value = key ? 'field' : 'form'
})

function onSelect(key: string): void {
  selectedKey.value = key
}
/**
 * 点击画布：落在字段卡片内（含其内部控件、子表单列与嵌套页签）时为选中语义，不清空；
 * 落在空白处（含撑开画布高度的字段列表容器与画布内边距）时清空选中，右侧随之回到「表单属性」。
 * 卡片内部的 `@click.stop`（页签容器、删除按钮）不会冒泡到此处，故不受影响。
 */
function onCanvasClick(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('[data-field-key]')) return
  selectedKey.value = ''
}
/**
 * 选中态一致性：当前选中节点已不在字段树中时清空选中（右侧随之切回「表单属性」）。
 * 删除容器时其后代一并消失，故判定口径是「选中节点是否仍在树中」而非「被删的是不是选中项」；
 * 删除字段、删除页签与删除子字段等全部移除路径共用本函数，避免面板残留指向已删节点的选中态。
 */
function clearSelectionIfStale(): void {
  if (selectedKey.value && !findNodeByKey(schema.value.fields, selectedKey.value)) {
    selectedKey.value = ''
  }
}
/**
 * 卡片是否位于**未展开**的页签面板内：`el-tab-pane` 用 v-show 隐藏非激活页（内联
 * `display: none`），卡片虽在 DOM 中却不可见，此时 scrollIntoView 不产生任何用户可感
 * 效果（页签也不会自动切换）。页签容器可嵌套，故逐级上溯而不只看最近一层。
 */
function isInCollapsedPane(card: HTMLElement): boolean {
  for (
    let pane = card.closest<HTMLElement>('.el-tab-pane');
    pane;
    pane = pane.parentElement?.closest<HTMLElement>('.el-tab-pane') ?? null
  ) {
    if (pane.style.display === 'none') return true
  }
  return false
}
/**
 * 定位到画布中的某个字段：选中它（右侧面板随之切到「字段属性」）并把画布滚动到该卡片。
 * 左侧「字段」清单与结构问题清单共用本函数（design.md D7），避免两处各持一份定位逻辑。
 * 字段位于未激活的多标签页内时滚动对其不可见，此时仍完成选中并给出可理解的反馈，
 * MUST NOT 静默无响应（delta spec「问题字段位于未激活页签内」）。
 */
function locateByKey(key: string): void {
  selectedKey.value = key
  void nextTick(() => {
    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-field-key]')).find(
      (el) => el.dataset.fieldKey === key,
    )
    if (!card) {
      // 防御分支：调用方传来的 key 均来自当前字段树，正常不会缺失卡片
      ElMessage.warning('该字段的卡片当前不在画布上，无法滚动定位')
      return
    }
    if (isInCollapsedPane(card)) {
      ElMessage.warning('该字段在尚未展开的标签页内，已选中它，请切到对应标签页查看')
      return
    }
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}
/**
 * 从「字段」清单点击一个已在画布中的条目：先把字段标识解析为节点 key，再走统一定位路径。
 */
function onLocateField(fieldId: string): void {
  const node = findCanvasFieldByFieldId(schema.value.fields, fieldId)
  if (!node) {
    ElMessage.warning(`字段标识 "${fieldId}" 已不在画布中，可从左侧「字段」面板拖回`)
    return
  }
  locateByKey(node.key)
}
/** 点击问题清单的定位入口：先关闭清单再跳到对应字段，使画布立即可见 */
function onLocateIssue(issue: SchemaIssue): void {
  if (!issue.fieldKey) return
  issuesVisible.value = false
  locateByKey(issue.fieldKey)
}
/**
 * 删除字段：子表单的子字段被删除时留存到该子表单的「已有字段」池（保留定义以便
 * 原样加回），其余节点直接从字段树移除。
 */
function onRemove(key: string): void {
  const ctx = findNodeByKey(schema.value.fields, key)
  if (ctx?.parent && isSubFormField(ctx.parent)) {
    removeSubFieldToPool(schema.value.fields, ctx.parent.key, key)
  } else {
    removeNodeByKey(schema.value.fields, key)
  }
  // 被删的可能是容器（多标签页/子表单），其内部字段正是当前选中项时同样需清空
  clearSelectionIfStale()
}
function onPatch(patch: Partial<FieldNode>): void {
  if (!selectedKey.value) return
  updateNodeByKey(schema.value.fields, selectedKey.value, patch)
}
/** 表单属性面板写回：浅合并进 schema.formConfig */
function onPatchFormConfig(patch: Partial<FormConfig>): void {
  schema.value.formConfig = { ...schema.value.formConfig, ...patch }
}
/** 在选中子表单内新增子字段（分配全表唯一标识），并选中新子字段 */
function onAddSubField(subFormKey: string, type: string): void {
  const node = addSubField(schema.value.fields, subFormKey, type)
  if (node) selectedKey.value = node.key
}
/** 复制子表单内某子字段（插入其后且标识唯一），并选中复制体 */
function onCopySubField(subFormKey: string, subKey: string): void {
  const node = copySubField(schema.value.fields, subFormKey, subKey)
  if (node) selectedKey.value = node.key
}
/** 从「已有字段」池把一个字段加回子表单（沿用原标识与配置），并选中它 */
function onRestoreSubField(subFormKey: string, pooledKey: string): void {
  const result = restorePooledSubField(schema.value.fields, subFormKey, pooledKey)
  if (result.ok) {
    selectedKey.value = result.node.key
    ElMessage.success(`已加回「${result.node.title || result.node.field}」`)
    return
  }
  if (result.reason === 'field-conflict') {
    ElMessage.warning(`字段标识 "${result.field}" 已被该子表单内的其他字段占用，请先处理冲突再加回`)
    return
  }
  ElMessage.warning('该字段已不在「已有字段」列表中')
}
/** 多标签页容器新增一个页签（新页签为空，可直接拖入字段） */
function onAddTab(tabsKey: string): void {
  addTab(schema.value.fields, tabsKey)
}
/** 删除某个页签（连同其内部字段）；仅剩一个页签时拒绝并提示 */
function onRemoveTab(tabsKey: string, tabKey: string): void {
  if (!removeTab(schema.value.fields, tabsKey, tabKey)) {
    ElMessage.warning('至少需要保留一个标签页')
    return
  }
  // 被删页签内的字段可能正是当前选中项，失效后回到「表单属性」避免面板残留已删节点
  clearSelectionIfStale()
}
function onPreview(): void {
  previewVisible.value = true
}
function onExport(): void {
  downloadSchema(schema.value)
  ElMessage.success('已导出 schema JSON')
}
/**
 * 汇总提示开头需单列措辞的两类问题：主 spec「保存被字段标识重复阻断」与「保存与发布被
 * 非法命名阻断」两条 Scenario 对「字段标识重复」/「字段标识命名不合法」开篇的文案有断言，
 * 故按分类码而非 message 子串选中它们（task 6.3）。
 */
const LEADING_ISSUE_CODES: SchemaIssueCode[] = ['FIELD_ID_CONFLICT', 'INVALID_FIELD_NAME']

/**
 * 保存与发布的共同前置校验：跑一次结构校验，存在 error 级问题时阻断后续动作，并一次呈现
 * **全部**问题——问题清单弹窗（逐条可定位）+ 一条含问题总数的汇总提示，使修复成本从
 * 「改一处 → 再点一次 → 才看到下一处」降为一轮。
 * 措辞一律由分类码决定，MUST NOT 匹配 message 子串（文案改写不得影响判定）。
 * 呈现清单不改变阻断语义：调用方拿到 false 后 SHALL NOT 写入保存、SHALL NOT 打发布标记。
 * @returns 是否可继续后续动作
 */
function checkBeforePersist(action: '保存' | '发布'): boolean {
  const errors = validateSchema(schema.value).issues.filter((i) => i.severity === 'error')
  if (errors.length === 0) return true
  issueList.value = errors
  issuesVisible.value = true
  const lead = errors.find((i) => LEADING_ISSUE_CODES.includes(i.code))
  const head = lead ? `${issueLabel(lead.code)}，无法${action}` : `无法${action}`
  const first = lead ?? errors[0]
  ElMessage.error(`${head}：表单共 ${errors.length} 处结构问题（已全部列出）——${first.message}`)
  return false
}

function onSave(): void {
  if (!checkBeforePersist('保存')) return
  saveSchema(schema.value)
  ElMessage.success('已保存')
}
/**
 * 发布表单：先过与保存同一道前置校验（存在 error 时不予发布，含字段标识重复），
 * 再给当前全部字段打上发布标记、记录发布状态与时间并把当时的主表字段定义
 * 重建为「已发布字段清单」（按字段标识去重）。发布可反复执行（无取消发布）：
 * 新增字段后再次发布即锁定其标识，同时 publishedVersion 递增。
 * 已打标记字段的标识不可再修改；本次发布时仍未在画布中的字段不带标记、也不进入清单。
 */
function onPublish(): void {
  if (!checkBeforePersist('发布')) return
  const count = markAllPublished(schema.value.fields)
  const version = publishedVersion.value + 1
  schema.value.formConfig = {
    ...schema.value.formConfig,
    published: true,
    publishedVersion: version,
    publishedAt: new Date().toISOString(),
    publishedFields: buildPublishedCatalog(schema.value.fields),
  }
  ElMessage.success(
    `已发布 v${version}：${count} 个字段的字段标识已锁定，${publishedCatalog.value.length} 个主表字段已进入左侧「字段」清单`,
  )
}
function onFileChange(file: UploadFile): void {
  const raw = file.raw
  if (!raw) return
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = String(reader.result ?? '')
  }
  reader.readAsText(raw)
}
function onImport(): void {
  if (!importText.value.trim()) {
    ElMessage.warning('请粘贴或选择要导入的 schema JSON')
    return
  }
  try {
    const imported = importSchema(importText.value)
    // 成功后再替换，避免非法导入破坏当前编辑
    schema.value = imported
    selectedKey.value = ''
    importVisible.value = false
    importText.value = ''
    ElMessage.success('导入成功')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// 暴露注册表引用，便于外部校验字段目录（无副作用）；选中 key 一并暴露，
// 使「定位未激活页签内字段」这类卡片尚未渲染的场景也能被测试断言选中结果
defineExpose({ schema, registry: fieldRegistry, selectedKey })
</script>

<style scoped>
.form-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--el-border-color-lighter);
}
.form-designer__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}
.form-designer__spacer {
  flex: 1;
}
.form-designer__body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.form-designer__left {
  display: flex;
  flex-direction: column;
  width: 240px;
  border-right: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}
.form-designer__canvas {
  flex: 1;
  overflow-y: auto;
  background: var(--el-fill-color-blank);
  padding: 16px;
}
.form-designer__canvas-inner {
  position: relative;
  max-width: 760px;
  margin: 0 auto;
  min-height: 200px;
}
/* 画布字段列表：撑开整块区域作为可放置区（含末尾空白），便于拖入 */
.form-designer__list {
  min-height: calc(100vh - 240px);
}
/* 空态提示：浮层展示，pointer-events:none 使拖拽事件穿透到下方列表 */
.form-designer__hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  pointer-events: none;
}
.form-designer__right {
  display: flex;
  flex-direction: column;
  width: 320px;
  border-left: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}
/* 左右两侧面板双 tab（左侧组件/字段，右侧字段属性/表单属性）：撑满高度，内容各自滚动 */
.form-designer__tabs {
  display: flex;
  flex: 1;
  /* 与 Element Plus `.el-tabs--top` 保持一致：DOM 中 content 在前、header 在后，
     需用 column-reverse 让 tab 头显示在顶部（若设为 column 会跑到面板底部） */
  flex-direction: column-reverse;
  min-height: 0;
}
.form-designer__tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  margin: 0;
  padding: 0 8px;
}
.form-designer__tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.form-designer__tabs :deep(.el-tab-pane) {
  height: 100%;
}
</style>
