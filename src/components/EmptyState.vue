<template>
  <div class="empty is-visible" data-testid="empty-state">
    <div class="empty__art" aria-hidden="true">
      <svg viewBox="0 0 120 90" fill="none">
        <rect x="8" y="14" width="104" height="62" rx="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <path d="M28 34h64M28 46h48M28 58h28" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55" />
        <circle cx="98" cy="58" r="12" fill="#F7E7D5" stroke="currentColor" stroke-width="2" />
        <path d="M94 58h8M98 54v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </div>
    <p class="empty__title">还没有内容</p>
    <p class="empty__desc">发布第一条动态，它会保存到服务端。</p>
  </div>
</template>
