<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'

type Mode = 'login' | 'register' | 'forgot'

const props = withDefaults(
  defineProps<{ modelValue: boolean; reason?: 'save' | 'continue' }>(),
  { reason: 'continue' },
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'confirmed': []
}>()

const session = useSessionStore()

const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
/**
 * 同意把简历内容发给模型供应商。
 *
 * **注册时单独勾这一项**（`docs/privacy-conclusions.md` §7）——它是「要发就得
 * 用户点头」的那一下，不勾就不能完成注册。
 */
const consent = ref(false)

const COPY = {
  login: { title: '登录', submit: '登录', hint: '登录之后就能保存简历、生成版本。' },
  register: { title: '注册', submit: '注册并验证邮箱', hint: '注册后会发一封验证邮件，点开就能开始用。' },
  forgot: { title: '重置密码', submit: '发重置邮件', hint: '我们会发一封带重置链接的邮件过去。' },
} as const

const copy = computed(() => COPY[mode.value])

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    mode.value = 'login'
    email.value = session.lastEmail
    password.value = ''
    error.value = ''
    notice.value = ''
    consent.value = false
  },
)

function close(): void {
  emit('update:modelValue', false)
}

/** 把 ApiError 变成一句人话——文案来自状态表，不自己另写。 */
function describe(caught: unknown): string {
  if (caught instanceof ApiError) return `${caught.state.title}。${caught.state.hint}`
  return '出了点问题。刷新一下再试。'
}

async function submit(): Promise<void> {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    if (mode.value === 'login') {
      await session.login(email.value, password.value)
      emit('confirmed')
      close()
      return
    }
    if (mode.value === 'register') {
      // 同意是注册的前提——不勾，服务端不会建这个账号
      if (!consent.value) {
        error.value = '需要勾选上面的同意项才能注册。'
        busy.value = false
        return
      }
      await session.register(email.value, password.value, consent.value)
      notice.value = '验证邮件已发出，去查收一下点开链接就能登录。'
      busy.value = false
      return
    }
    await session.requestPasswordReset(email.value)
    notice.value = '如果这个邮箱注册过，重置邮件已经发出。'
    busy.value = false
  } catch (caught) {
    error.value = describe(caught)
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="copy.title"
    width="420px"
    align-center
    @close="close"
  >
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="邮箱">
        <el-input
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="用来登录和收验证邮件"
        />
      </el-form-item>
      <el-form-item v-if="mode !== 'forgot'" label="密码">
        <el-input
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          placeholder="至少 8 位"
          @keyup.enter="submit"
        />
      </el-form-item>
      <el-form-item v-if="error" :error="error" />
      <el-form-item v-if="notice" class="identity-notice">{{ notice }}</el-form-item>
      <el-form-item v-if="mode === 'register'">
        <el-checkbox v-model="consent">
          我同意把我的简历内容发给境内模型供应商，用于比对 JD 与生成版本
        </el-checkbox>
        <p class="identity-hint">
          只会发简历里的分区、条目与要点正文，以及你粘贴的这份 JD。姓名、抬头与联系方式不会发出去。
        </p>
      </el-form-item>
    </el-form>

    <p class="identity-hint">{{ copy.hint }}</p>

    <template #footer>
      <el-button type="primary" :loading="busy" @click="submit">{{ copy.submit }}</el-button>
      <el-button text @click="close">留在本页</el-button>
      <el-button v-if="mode === 'login'" text @click="mode = 'forgot'">
        忘记密码
      </el-button>
      <el-button v-else text @click="mode = 'login'">返回登录</el-button>
    </template>

    <div class="identity-switch">
      <el-button v-if="mode !== 'register'" text size="small" @click="mode = 'register'">
        没有账号？注册一个
      </el-button>
      <el-button v-else text size="small" @click="mode = 'login'">已有账号？去登录</el-button>
    </div>
  </el-dialog>
</template>

<style scoped>
.identity-hint {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.7;
  color: var(--ink-500);
}

.identity-notice {
  font-size: var(--text-xs);
  line-height: 1.7;
  color: var(--ink-500);
}

.identity-switch {
  margin-top: var(--space-sm);
}
</style>
