import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useDraftStore } from './stores/draft'
import { useSessionStore } from './stores/session'
import { useVersionStore } from './stores/versions'
import { splitLegacySlots } from './stores/persistence'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

const session = useSessionStore()
session.restore()

// 旧的全局存档按用户拆到各自分槽
splitLegacySlots()

// 当前用户一变（登录、退出、换名字）就从对应槽位重新载入，不残留上一个用户的内容。
// 同步触发：登录那一刻数据就换好，示例数据那条「登录→解析→保存」的同步链路才不会读到旧数据。
watch(
  () => session.currentUserId,
  () => {
    useDraftStore().restore()
    useVersionStore().restore()
  },
  { immediate: true, flush: 'sync' },
)

window.addEventListener('beforeunload', (event) => {
  if (!useDraftStore().dirty) return
  event.preventDefault()
  event.returnValue = ''
})

app.mount('#app')
