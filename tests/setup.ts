/**
 * 测试环境初始化：补齐 jsdom 缺失的浏览器 API（Element Plus 依赖）。
 */
import { config } from '@vue/test-utils'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!globalThis.ResizeObserver) {
  // 测试环境桩
  globalThis.ResizeObserver = ResizeObserverStub
}

if (!window.matchMedia) {
  // 测试环境桩
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

if (!Element.prototype.scrollIntoView) {
  // 测试环境桩：jsdom 不实现滚动，设计器「字段清单点击定位」等用例只关心是否被调用
  Element.prototype.scrollIntoView = function scrollIntoView(): void {}
}

config.global.stubs = {
  transition: false,
  'transition-group': false,
}
