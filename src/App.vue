<template>
  <div class="app">
    <header class="app__header">
      <h1>Form Engine · 维思勤表单引擎</h1>
      <span class="app__sub">form-create + Vue3 · 设计器 / 渲染器 / schema 契约</span>
    </header>

    <!-- 单一视图：设计器占满剩余空间。填报态（渲染器）经设计器工具栏「预览」进入，
         不再另设底部模式切换页签 -->
    <main class="app__main">
      <FormDesigner v-model="schema" :data-sources="dataSources" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FormDesigner } from '@/designer'
import type { FormSchema } from '@/schema/types'
import { sampleSchema, sampleDataSources } from '@/demo/sampleSchema'

const schema = ref<FormSchema>(JSON.parse(JSON.stringify(sampleSchema)))
const dataSources = ref(sampleDataSources)
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  box-sizing: border-box;
}
.app__header h1 {
  font-size: 18px;
  margin: 0;
}
.app__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 设计器撑满剩余高度（FormDesigner 自身 height:100%），min-height:0 保证内部可滚动 */
.app__main {
  flex: 1;
  margin-top: 12px;
  min-height: 0;
}
</style>
