import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.npm-cache/**'],
  },
  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  skipFormatting,
  {
    rules: {
      // App.vue 等单词组件名（根组件）无需强制多词
      'vue/multi-word-component-names': 'off',
      // 引擎封装 form-create（JS 内核，api/rule 无完整类型），务实允许 any
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // 声明文件（如 *.vue 模块 shim）惯用 {} 占位类型，关闭空对象类型检查
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
]
