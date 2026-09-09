<template>
  <el-tab-pane :label="label" :name="name">
    <slot />
  </el-tab-pane>
</template>

<script setup lang="ts">
defineProps<{ label?: string; name?: string }>()
</script>
