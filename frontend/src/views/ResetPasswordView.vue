<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const token = ref(String(route.query.token ?? ''))
const password = ref('')
const error = ref('')
const done = ref(false)
const busy = ref(false)

onMounted(() => {
  if (!token.value) error.value = '这个链接没有带上令牌。重新从邮件里点一次。'
})

async function submit(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    await session.confirmPasswordReset(token.value, password.value)
    done.value = true
  } catch (caught) {
    error.value =
      caught instanceof ApiError ? `${caught.state.title}。${caught.state.hint}` : '重置没成功。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="card-block reset-panel">
      <h1 class="page-title">重置密码</h1>
      <p v-if="done" class="text-muted">密码改好了，用新密码登录吧。</p>
      <template v-else>
        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item label="新密码">
            <el-input
              v-model="password"
              type="password"
              autocomplete="new-password"
              placeholder="至少 8 位"
              @keyup.enter="submit"
            />
          </el-form-item>
          <el-form-item v-if="error" :error="error" />
        </el-form>
        <el-button type="primary" size="small" :loading="busy" @click="submit">
          改好并退出登录
        </el-button>
      </template>
      <el-button text size="small" @click="router.push('/')">回到首页</el-button>
    </div>
  </div>
</template>

<style scoped>
.reset-panel {
  max-width: 32em;
}
</style>
