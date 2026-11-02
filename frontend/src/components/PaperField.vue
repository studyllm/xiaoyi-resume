<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'name' | 'headline' | 'org' | 'title' | 'label' | 'plain'

const props = withDefaults(
  defineProps<{
    editable: boolean
    value?: string
    placeholder?: string
    variant?: Variant
  }>(),
  { value: '', placeholder: '', variant: 'plain' },
)

const emit = defineEmits<{ update: [value: string] }>()

const VARIANTS: Record<Variant, { size?: string; weight?: number; color?: string }> = {
  name: { size: '18pt', weight: 700 },
  headline: { size: '11pt', color: 'var(--ink-700)' },
  org: { weight: 700 },
  title: { color: 'var(--ink-700)' },
  label: { color: 'var(--ink-500)' },
  plain: {},
}

const fieldStyle = computed(() => {
  const variant = VARIANTS[props.variant]
  return {
    fontSize: variant.size,
    fontWeight: variant.weight,
    color: variant.color,
  }
})
</script>

<template>
  <el-input
    v-if="editable"
    :model-value="value"
    borderless
    class="paper-field paper-field--input"
    :style="fieldStyle"
    :placeholder="placeholder"
    @update:model-value="(next: string) => emit('update', next)"
  />
  <span v-else class="paper-field paper-field--text" :style="fieldStyle">{{ value }}</span>
</template>

<style scoped>
.paper-field {
  font-family: var(--font-paper);
}

.paper-field--input :deep(.el-input__wrapper),
.paper-field--input :deep(.el-input__inner) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.paper-field--input :deep(.el-input__inner) {
  font-family: var(--font-paper);
  color: inherit;
}
</style>
