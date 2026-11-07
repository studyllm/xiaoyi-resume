import { buildApp } from './app'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'

const app = buildApp()

app
  .listen({ port, host })
  .then(() => {
    console.log(`服务端已启动：http://${host}:${port}`)
  })
  .catch((error) => {
    console.error('服务端启动失败：', error)
    process.exit(1)
  })
