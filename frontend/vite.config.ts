import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/types/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/types/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // 单个用例实测最长约 2.2s，30s 是 13 倍余量。默认 5s 在机器负载升高时
    // 会把排队造成的等待误判成失败，让「全绿」失去证据意义。
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        // 组件单测会渲染 Element Plus 组件，需要让 Vite 处理它的样式导入
        inline: ['element-plus'],
      },
    },
  },
})
