import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createSeededStore, shouldSeedExamples } from './seed'
import { createPostStore } from './store'

const port = Number(process.env.PORT ?? 8787)
const seeded = shouldSeedExamples()
const store = seeded ? createSeededStore() : createPostStore()
const app = createApp({ store })

if (seeded) {
  console.log(`[微语] 已注入 ${store.count()} 条范例动态（设置 SEED_EXAMPLES=0 可关闭）`)
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[微语] API 已启动：http://localhost:${info.port}`)
})
