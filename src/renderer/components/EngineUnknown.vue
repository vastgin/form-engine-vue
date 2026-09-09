<template>
  <el-alert
    class="engine-unknown"
    :title="`未知字段类型：${fieldType || '(空)'}`"
    type="warning"
    :closable="false"
    show-icon
  />
</template>

<script setup lang="ts">
defineProps<{ fieldType?: string }>()
</script>

<style scoped>
.engine-unknown {
  width: 100%;
  margin-bottom: 8px;
}
</style>
