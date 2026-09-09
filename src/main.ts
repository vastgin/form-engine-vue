import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import App from './App.vue'
import { registerEngineComponents } from './renderer/components'

// 注册引擎自定义组件（布局字段/占位组件）到 form-create
registerEngineComponents()

const app = createApp(App)
app.use(ElementPlus)
app.use(formCreate)
app.mount('#app')
