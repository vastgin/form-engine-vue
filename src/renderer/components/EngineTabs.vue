<template>
  <el-tabs v-model="active" class="engine-tabs" type="border-card">
    <slot />
  </el-tabs>
</template>

<script setup lang="ts">
/**
 * 多标签页容器：子面板由 form-create 渲染至默认插槽。
 * 激活页签由组件内部状态托管并默认选中首个页签 —— el-tabs 未绑定 modelValue 时其内部
 * 缺省名为 "0"，与页签实际的 name（tab.key）不匹配会导致没有任何页签被选中，
 * 故由适配层把首个页签的 name 透传进来作为初始值，其后切换由本组件自行承载。
 */
import { ref, watch } from 'vue'

const props = defineProps<{
  /** 初始激活的页签 name（适配层传入首个页签的 key） */
  activeName?: string
}>()

const active = ref(props.activeName ?? '')

// schema 变化（如页签增删）时同步初始激活项，仅在传入有效值时覆盖用户当前选择
watch(
  () => props.activeName,
  (name) => {
    if (name) active.value = name
  },
)
</script>

<style scoped>
.engine-tabs {
  width: 100%;
  margin-bottom: 8px;
}
</style>
