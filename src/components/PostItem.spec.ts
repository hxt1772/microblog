import { describe, expect, it } from 'vitest'
import { mountWithPinia } from '@/test-utils/mount'
import type { Post } from '@/types/post'
import PostItem from './PostItem.vue'

const NOW = new Date(2026, 10, 13, 15, 30, 0).getTime()

function makePost(overrides: Partial<Post> = {}): Post {
  return { id: 'p1', content: '今天天气不错', createdAt: NOW - 3 * 60 * 1000, ...overrides }
}

describe('PostItem', () => {
  it('展示作者、相对时间与内容', () => {
    const wrapper = mountPostItem(makePost())

    expect(wrapper.text()).toContain('我')
    expect(wrapper.text()).toContain('3 分钟前')
    expect(wrapper.text()).toContain('今天天气不错')
  })

  it('提供机器可读的时间属性', () => {
    const post = makePost()
    const wrapper = mountPostItem(post)

    expect(wrapper.find('time').attributes('datetime')).toBe(new Date(post.createdAt).toISOString())
  })

  it('内容按纯文本渲染，不解析 HTML', () => {
    const wrapper = mountPostItem(makePost({ content: '<b>加粗</b><img src=x onerror="alert(1)">' }))

    expect(wrapper.html()).not.toContain('<b>')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<b>加粗</b>')
  })

  it('相对时间跟随 now 属性变化', () => {
    const wrapper = mountPostItem(makePost({ createdAt: NOW - 2 * 60 * 60 * 1000 }))

    expect(wrapper.text()).toContain('今天 13:30')
  })
})

function mountPostItem(post: Post) {
  return mountWithPinia(PostItem, { props: { post, now: NOW } }).wrapper
}
