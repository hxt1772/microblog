<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { TOAST_DURATION_MS } from '@/config/constants'
import { useToastStore } from '@/stores/useToastStore'

const toastStore = useToastStore()
const { message, visible, token } = storeToRefs(toastStore)

let timer: ReturnType<typeof setTimeout> | undefined

watch(token, () => {
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(() => {
    toastStore.hide()
  }, TOAST_DURATION_MS)
})

onBeforeUnmount(() => {
  if (timer !== undefined) clearTimeout(timer)
})
</script>

<template>
  <div
    class="toast"
    :class="{ 'is-visible': visible }"
    data-testid="toast"
    role="status"
    aria-live="polite"
  >
    {{ message }}
  </div>
</template>
