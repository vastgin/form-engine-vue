<template>
  <div class="field-preview">
    <!-- 数据字段：委托共享控件（预览态，交互由外层 pointer-events 屏蔽） -->
    <FieldControl v-if="isCommon" :node="dataNode" :model-value="dataNode.value" preview />

    <!-- 分割线 -->
    <el-divider v-else-if="type === 'divider'" class="field-preview__divider">
      <span v-if="node.title">{{ node.title }}</span>
    </el-divider>

    <!-- 说明文字 -->
    <div v-else-if="type === 'text'" class="field-preview__text">
      <div v-if="node.title" class="field-preview__text-title">{{ node.title }}</div>
      <div class="field-preview__text-content">{{ content || '（未设置说明内容）' }}</div>
    </div>

    <!-- 容器（多标签页）/ 子表单 / 未知类型：由画布卡片自行处理，这里仅作兜底占位 -->
    <span v-else class="field-preview__empty">{{ fieldTypeLabel(type) }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * 画布控件可视化预览：数据字段委托共享 FieldControl（预览态）渲染真实控件外观，
 * 布局字段（分割线/说明文字）在此直接呈现；容器与子表单由画布卡片自行处理。
 * 委托闸门以「注册表是否为该类型声明了控件定义」为准（统一渲染单轨），而非枚举数据字段类型，
 * 故新增字段类型后画布自动呈现真实控件，本组件无需改动。
 * FieldPreview 对外 props 保持 `node` 不变（design D3，回归护栏 tests/designerVisual.test.ts）。
 * 对应 specs/form-designer「画布所见即所得展示」。
 */
import { computed } from 'vue'
import type { DataFieldNode, FieldNode } from '@/schema/types'
import { fieldRegistry } from '@/registry'
import FieldControl from '@/components/FieldControl.vue'
import { fieldTypeLabel } from './fieldIcons'

const props = defineProps<{ node: FieldNode }>()

const type = computed(() => props.node.type)
/** 注册表为该类型声明了控件定义即走真实控件；布局/容器/未知类型无 control，走各自分支或兜底 */
const isCommon = computed(() => !!fieldRegistry.get(type.value)?.control)
const dataNode = computed(() => props.node as DataFieldNode)
const content = computed(
  () => ((props.node.props as Record<string, unknown> | undefined)?.content as string) ?? '',
)
</script>

<style scoped>
.field-preview {
  width: 100%;
}
.field-preview__empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.field-preview__divider {
  margin: 4px 0;
}
.field-preview__text {
  padding: 2px 0;
}
.field-preview__text-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--el-text-color-primary);
}
.field-preview__text-content {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--el-text-color-regular);
}
</style>
