/**
 * 向 form-create 注册引擎自定义组件（布局字段与占位组件）。
 * 渲染器加载 schema 前调用，确保 rule.type 能解析到对应组件。
 */

import formCreate from '@form-create/element-ui'
import EngineDivider from './EngineDivider.vue'
import EngineText from './EngineText.vue'
import EngineTabs from './EngineTabs.vue'
import EngineTabPane from './EngineTabPane.vue'
import EngineSubForm from './EngineSubForm.vue'
import EngineUnknown from './EngineUnknown.vue'

let registered = false

export function registerEngineComponents(): void {
  if (registered) return
  formCreate.component('engine-divider', EngineDivider)
  formCreate.component('engine-text', EngineText)
  formCreate.component('engine-tabs', EngineTabs)
  formCreate.component('engine-tab-pane', EngineTabPane)
  formCreate.component('engine-subform', EngineSubForm)
  formCreate.component('engine-unknown', EngineUnknown)
  registered = true
}
