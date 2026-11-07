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
      // 共享包不走别名：@xiaoyi/shared 由 npm workspace 解析，
      // 包边界由解析器强制——server 引用不到 frontend 的东西。
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 服务端在另一个端口。走代理而不是跨域直连——
      // 同源就不用 CORS，session cookie 也就不用管 SameSite 与凭证。
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    // 共享包的用例跟着源码走——它们测的是前后端共用的那份逻辑
    include: ['src/**/*.spec.ts', '../packages/shared/src/**/*.spec.ts'],
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
