<template>
  <div class="engine-text">
    <div v-if="title" class="engine-text__title">{{ title }}</div>
    <div class="engine-text__content">{{ content }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title?: string; content?: string }>()
</script>

<style scoped>
.engine-text {
  width: 100%;
  padding: 4px 0;
}
.engine-text__title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--el-text-color-primary);
}
.engine-text__content {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
