<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { useSessionStore } from '@/stores/session'

export type IdentityReason = 'save' | 'continue'

const props = withDefaults(
  defineProps<{ modelValue: boolean; reason?: IdentityReason }>(),
  { reason: 'continue' },
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'confirmed': []
}>()

const session = useSessionStore()

const userName = ref('')
const error = ref('')
const inputRef = ref<{ focus: () => void; select: () => void } | null>(null)

const COPY = {
  save: {
    title: '这份简历归你',
    body: '给这份简历留个名字，之后你打开时就知道它在这儿。名字和简历都只存在这台设备上。',
    submit: '保存到我的简历',
  },
  continue: {
    title: '留个名字就能继续',
    body: '名字和简历都只存在这台设备上，不需要注册账号。',
    submit: '继续',
  },
} as const

const copy = computed(() => COPY[props.reason])

/** 预填上次用过的名字并选中：常见情形是「还是我」，回车就能继续。 */
async function fillLastName(): Promise<void> {
  error.value = ''
  userName.value = session.lastName
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

onMounted(fillLastName)

watch(
  () => props.modelValue,
  (open) => {
    if (open) void fillLastName()
  },
)

function close(): void {
  emit('update:modelValue', false)
}

function submit(): void {
  if (!userName.value.trim()) {
    error.value = '请填写名字'
    return
  }
  session.login(userName.value)
  emit('confirmed')
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
      <el-form-item label="你的名字" :error="error">
        <el-input
          ref="inputRef"
          v-model="userName"
          placeholder="怎么称呼你就行"
          autocomplete="nickname"
          @keyup.enter="submit"
        />
      </el-form-item>
    </el-form>

    <p class="identity-hint">{{ copy.body }}</p>

    <template #footer>
      <el-button type="primary" @click="submit">{{ copy.submit }}</el-button>
      <el-button text @click="close">留在本页</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.identity-hint {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.7;
  color: var(--ink-500);
}
</style>
