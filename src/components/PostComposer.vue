<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { MAX_LENGTH, NEAR_LENGTH_THRESHOLD, SUCCESS_FLASH_MS } from '@/config/constants'
import { useAutoResizeTextarea } from '@/composables/useAutoResizeTextarea'
import { usePostsStore } from '@/stores/usePostsStore'
import { useToastStore } from '@/stores/useToastStore'

const postsStore = usePostsStore()
const toastStore = useToastStore()

const draft = ref('')
const composing = ref(false)
const flashed = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const { resize } = useAutoResizeTextarea(inputRef)

let flashTimer: ReturnType<typeof setTimeout> | undefined

const length = computed(() => draft.value.length)
const isNearLimit = computed(() => length.value >= NEAR_LENGTH_THRESHOLD && length.value <= MAX_LENGTH)
const isOverLimit = computed(() => length.value > MAX_LENGTH)
const canSubmit = computed(() => draft.value.trim().length > 0 && !isOverLimit.value)
const submitLabel = computed(() => (flashed.value ? '已发布' : '发布'))

function flashSuccess(): void {
  flashed.value = true
  if (flashTimer !== undefined) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashed.value = false
  }, SUCCESS_FLASH_MS)
}

function submit(): void {
  if (composing.value) return

  if (!canSubmit.value) {
    toastStore.show(isOverLimit.value ? `内容超出 ${MAX_LENGTH} 字限制` : '写点什么再发布吧')
    inputRef.value?.focus()
    return
  }

  const result = postsStore.publish(draft.value)
  if (!result.ok) {
    toastStore.show(result.reason === 'too-long' ? `内容超出 ${MAX_LENGTH} 字限制` : '写点什么再发布吧')
    inputRef.value?.focus()
    return
  }

  draft.value = ''
  flashSuccess()
  toastStore.show(result.persisted ? '发布成功' : '已发布，但本地存储不可用，刷新后会丢失')

  nextTick(() => {
    resize()
    inputRef.value?.focus()
  })
}

function handleInput(): void {
  resize()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  if (!event.ctrlKey && !event.metaKey) return
  if (composing.value) return

  event.preventDefault()
  submit()
}

function handleCompositionStart(): void {
  composing.value = true
}

function handleCompositionEnd(): void {
  composing.value = false
  resize()
}

onBeforeUnmount(() => {
  if (flashTimer !== undefined) clearTimeout(flashTimer)
})
</script>

<template>
  <section class="composer glass" aria-labelledby="composer-title">
    <h2 class="sr-only" id="composer-title">发布动态</h2>

    <div class="composer__body">
      <span class="avatar avatar--me" aria-hidden="true">我</span>
      <div class="composer__field">
        <label class="sr-only" for="composer-input">此刻的想法</label>
        <textarea
          id="composer-input"
          ref="inputRef"
          v-model="draft"
          class="composer__input"
          data-testid="composer-input"
          rows="2"
          maxlength="500"
          placeholder="分享此刻的想法…"
          autocomplete="off"
          spellcheck="false"
          @input="handleInput"
          @keydown="handleKeydown"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
        ></textarea>
        <p class="composer__hint">Ctrl / ⌘ + Enter 快速发布</p>
      </div>
    </div>

    <div class="composer__footer">
      <div
        class="counter"
        :class="{ 'is-near': isNearLimit, 'is-over': isOverLimit }"
        data-testid="composer-counter"
        aria-live="polite"
      >
        <span class="counter__value" data-testid="composer-counter-value">{{ length }}</span>
        <span class="counter__limit">/ {{ MAX_LENGTH }}</span>
      </div>
      <button
        class="btn"
        :class="{ 'is-success': flashed }"
        data-testid="composer-submit"
        type="button"
        :disabled="!canSubmit"
        @click="submit"
      >
        <span class="btn__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12l16-8-5 16-3.5-6.5L4 12z" />
          </svg>
        </span>
        <span class="btn__label">{{ submitLabel }}</span>
      </button>
    </div>
  </section>
</template>
