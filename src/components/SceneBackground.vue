<script setup lang="ts">
interface Leaf {
  x: string
  delay: string
  duration: string
  size: string
  drift: string
  hue: string
}

const leaves: Leaf[] = [
  { x: '4%', delay: '-1.2s', duration: '18s', size: '15px', drift: '52px', hue: '0deg' },
  { x: '16%', delay: '-9.4s', duration: '15s', size: '11px', drift: '-38px', hue: '-14deg' },
  { x: '29%', delay: '-5.6s', duration: '20s', size: '20px', drift: '64px', hue: '12deg' },
  { x: '44%', delay: '-13.2s', duration: '16.5s', size: '13px', drift: '-46px', hue: '26deg' },
  { x: '58%', delay: '-3.4s', duration: '19s', size: '17px', drift: '58px', hue: '-8deg' },
  { x: '71%', delay: '-11.8s', duration: '14.5s', size: '12px', drift: '-40px', hue: '18deg' },
  { x: '84%', delay: '-7.2s', duration: '17.5s', size: '21px', drift: '48px', hue: '4deg' },
  { x: '94%', delay: '-15.6s', duration: '21s', size: '14px', drift: '-54px', hue: '-20deg' },
]

/** 自定义属性通过对象传入，避免在模板里拼接字符串。 */
function leafStyle(leaf: Leaf): Record<string, string> {
  return {
    '--x': leaf.x,
    '--delay': leaf.delay,
    '--duration': leaf.duration,
    '--size': leaf.size,
    '--drift': leaf.drift,
    '--hue': leaf.hue,
  }
}
</script>

<template>
  <div class="scene" aria-hidden="true">
    <div class="scene__sky"></div>
    <div class="scene__sun"></div>
    <div class="scene__haze"></div>
    <div class="scene__ridge scene__ridge--far"></div>
    <div class="scene__ridge scene__ridge--mid"></div>
    <div class="scene__ridge scene__ridge--near"></div>
    <div class="scene__grain"></div>
    <div class="leaves">
      <span v-for="(leaf, index) in leaves" :key="index" class="leaf" :style="leafStyle(leaf)"></span>
    </div>
  </div>
</template>
