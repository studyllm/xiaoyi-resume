<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const state = ref<'working' | 'ok' | 'failed'>('working')
const message = ref('')

onMounted(async () => {
  const token = String(route.query.token ?? '')
  if (!token) {
    state.value = 'failed'
    message.value = '这个链接没有带上令牌。重新从邮件里点一次。'
    return
  }
  try {
    await session.verifyEmail(token)
    state.value = 'ok'
    message.value = '邮箱已验证，现在可以保存简历、生成版本了。'
  } catch (error) {
    state.value = 'failed'
    message.value =
      error instanceof ApiError ? `${error.state.title}。${error.state.hint}` : '验证没成功。'
  }
})
</script>

<template>
  <div class="page">
    <div class="card-block verify-panel">
      <h1 class="page-title">验证邮箱</h1>
      <p class="text-muted">{{ state === 'working' ? '正在验证……' : message }}</p>
      <el-button type="primary" size="small" @click="router.push('/draft')">去我的简历</el-button>
    </div>
  </div>
</template>

<style scoped>
.verify-panel {
  max-width: 32em;
}
</style>
