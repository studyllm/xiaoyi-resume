<script setup lang="ts">
import logoUrl from '@/assets/logo.png'

withDefaults(defineProps<{ variant?: 'landing' | 'bar' }>(), { variant: 'landing' })
</script>

<template>
  <!-- 装饰性标识：紧挨着产品名文字，替代文本留空，屏幕阅读器只读文字一次 -->
  <img class="brand-logo" :class="`is-${variant}`" :src="logoUrl" alt="" />
</template>

<style scoped>
.brand-logo {
  display: block;
  flex: 0 0 auto;
  /* 换成非方形的标识时按比例缩放，不压扁 */
  object-fit: contain;
}

.brand-logo.is-landing {
  width: var(--brand-logo-size-landing);
  height: var(--brand-logo-size-landing);
}

.brand-logo.is-bar {
  width: var(--brand-logo-size-bar);
  height: var(--brand-logo-size-bar);
}
</style>
