/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 引擎模式。取值域见 docs/adr/0001-engine-mode-switch.md。
   * 未知取值一律回落到本地规则引擎，不报错也不白屏。
   */
  readonly VITE_ENGINE_MODE?: 'mock' | 'remote'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
