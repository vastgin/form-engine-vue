<template>
  <el-divider class="engine-divider">
    <span v-if="title">{{ title }}</span>
  </el-divider>
</template>

<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<style scoped>
.engine-divider {
  width: 100%;
}
</style>
