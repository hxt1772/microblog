# 微语 · Moments

一个极简的短动态信息流，前后端分离实现：**Vue 3 + TypeScript + Pinia + Vite** 前端，**Hono + REST API + 内存存储** 后端。
发布的内容通过 `/api` 写入服务端内存，前端不再使用浏览器 LocalStorage；服务进程重启后数据清空。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 构建 | Vite 8 + `@vitejs/plugin-vue` |
| 前端 | Vue 3.5（Composition API + `<script setup lang="ts">`） |
| 状态 | Pinia 4（setup store） |
| 后端 | Hono 4 + `@hono/node-server` |
| 存储 | 服务端进程内存（重启即清空，最多 300 条） |
| 测试 | Vitest 5 + `@vue/test-utils` + jsdom（前端）/ node 环境（后端） |
| 类型 | TypeScript 5.9 + `vue-tsc` |

## 快速开始

要求 Node.js `^20.19.0 || >=22.12.0`。

```bash
npm install        # 安装依赖
npm run dev        # 同时启动 API(8787) 与 Web(5173)，Vite 代理 /api
npm run dev:api    # 只启动后端
npm run dev:web    # 只启动前端
npm run build      # 类型检查 + 生产构建（输出 dist/）
npm run preview    # 预览构建产物（同样代理 /api）
npm run start:api  # 以单进程方式启动 API
npm test           # 前后端全部单元 / 组件 / 集成测试
npm run typecheck  # 仅类型检查
```

打开 http://localhost:5173 即可使用；前端所有请求都是同源相对路径 `/api`，由 Vite 代理转发到 `http://localhost:8787`。

## REST API

| 方法 | 路径 | 说明 | 成功响应 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 健康检查，返回当前条数 | `200 { "status": "ok", "count": number }` |
| `GET` | `/api/posts` | 按发布时间倒序返回，最多 300 条 | `200 { "posts": Post[] }` |
| `POST` | `/api/posts` | body `{ "content": string }` | `201 { "post": Post }` |
| `POST` | `/api/posts/:id/like` | 切换点赞（再调一次即取消） | `200 { "post": Post }` |
| `POST` | `/api/posts/:id/favorite` | 切换收藏（再调一次即取消） | `200 { "post": Post }` |

`Post` 结构：`{ id: string, content: string, createdAt: number, likes: number, liked: boolean, favorited: boolean }`，`id`、`createdAt` 与互动字段一律由服务端生成。`likes` 为点赞总数，`liked` / `favorited` 表示当前用户是否已点赞 / 收藏（单用户演示）。

错误统一为 `{ "error": { "code": string, "message": string } }`：

| 状态码 | code | 触发条件 |
| --- | --- | --- |
| 400 | `EMPTY_CONTENT` | 正文 trim 后为空 |
| 400 | `CONTENT_TOO_LONG` | 正文超过 280 字符 |
| 400 | `INVALID_BODY` | 请求体不是 JSON 对象，或 `content` 不是字符串 |
| 404 | `POST_NOT_FOUND` | 点赞 / 收藏的目标 id 不存在 |
| 404 | `NOT_FOUND` | 路由不存在 |
| 500 | `INTERNAL_ERROR` | 未捕获异常（固定文案，不泄露内部细节） |

```bash
curl http://localhost:8787/api/health
curl -X POST http://localhost:8787/api/posts \
  -H "Content-Type: application/json" \
  -d '{"content":"你好，服务端"}'
```

## 功能

- **发布**：点击「发布」或按 `Ctrl / ⌘ + Enter`；请求进行中按钮禁用，重复提交被拦截；失败保留草稿
- **查看**：时间线按发布时间倒序，相对时间每分钟刷新（刚刚 / 3 分钟前 / 今天 09:05 / 昨天 20:07 / 11月10日 09:05 / 2025年12月31日）
- **点赞 / 收藏**：每条动态可点赞与收藏，再点一次取消；按钮展示 `aria-pressed` 与点赞数，请求飞行中禁用避免连点；状态以服务端返回为准，刷新后仍保留
- **收藏视图**：信息流支持「全部 / 收藏」切换，收藏页签显示收藏条数，无收藏时展示专属空态
- **统计看板**：总动态数、累计字数（emoji 按 1 字计）、今日发布数，以及近 7 天趋势柱状图；发布后实时更新并带数字跳动
- **服务端存储**：刷新或多标签页访问读到的都是同一份服务端数据；进程重启后清空
- **输入约束**：空内容不可发布，超过 280 字禁用发布并提示；前端本地校验 + 服务端权威校验双重保障
- **安全渲染**：用户内容一律按纯文本插值渲染，不解析任何 HTML 或脚本
- **异常降级**：接口不可用时提示「服务暂时不可用」，页面不崩溃，也不再写入浏览器存储
- **无障碍**：语义化标签、`aria-live` 提示、柱状图 `aria-label` 摘要、加载态 `role="status"`、支持 `prefers-reduced-motion`

## 架构

```
App.vue（组合层：场景层 + 品牌栏 + 三大区块 + Toast）
├── PostComposer ──┐
├── StatsBoard     ├──> stores/usePostsStore（唯一数据真源）
└── PostFeed ──────┘            │
                                ▼
                    services/postApi（fetch + 错误归一化）
                                │  /api（Vite 代理 → :8787）
                                ▼
                    server/app.ts（Hono 路由 / 请求体校验 / JSON 错误体）
                                ▼
                    server/store.ts（内存数组，倒序，≤ 300 条）
```

`shared/` 存放前后端共享的契约：`post.ts`（`Post` / `PostInput` / `ReactionKind`）、`constants.ts`（`MAX_LENGTH` / `MAX_ENTRIES` / `API_BASE_PATH`）、`id.ts`（UUID 优先 + 降级实现）。

设计要点：

- **服务端是唯一真源**：`publish` 以 `201` 返回的记录为准置顶，不做乐观插入，失败时列表不会被假数据污染
- **水合状态显式化**：`loading` / `hydrated` 区分「加载中」与「空列表」，首屏不闪现空态
- **错误分层**：`PostApiError`（网络 / 格式 / 业务码）→ store（`apiAvailable` + `PublishFailureReason`）→ 组件（toast 文案）
- **统计派生**：`posts` 是唯一状态，`stats` / `favorites` / `favoriteCount` 由 `computed` 派生；时间基准由全页唯一的 ticker 推进
- **互动不做乐观更新**：点赞 / 收藏成功后用服务端记录原位替换，失败保留原状态；`pendingIds` 保证同一 id 不并发请求
- **测试跑真实语义**：`src/test-utils/fakeServer.ts` 把 `fetch` 接到真实 Hono 应用的 `app.request()`，前端集成测试不 mock store 内部

## TDD 与测试

按「先写失败测试 → 最小实现 → 重构」推进，测试覆盖行为而非实现细节。

| 测试文件 | 覆盖内容 |
| --- | --- |
| `server/store.spec.ts` | trim、空/空白拒绝、280 边界、倒序、300 条裁剪、注入时钟/id、点赞与收藏切换、未知 id 报错、副本隔离、count |
| `server/app.spec.ts` | REST 契约：health / 列表 / 201 / 400 三种错误码 / 点赞与收藏 200 与 404 `POST_NOT_FOUND` / 404 JSON / 500 脱敏 / CORS 与预检 |
| `src/services/postApi.spec.ts` | 响应解析与清洗、非 2xx 映射、非 JSON、缺失字段、`fetch` 拒绝、点赞收藏 URL 与 404 映射、请求体与错误信息脱敏 |
| `src/stores/usePostsStore.spec.ts` | 水合成功/失败、loading 流转、发布置顶、本地与服务端校验、网络失败、300 条裁剪、跨天重算、互动原位替换与 pending 去重、收藏派生 |
| `src/App.spec.ts` | 首屏结构、发布闭环、刷新恢复、服务不可用提示、XSS 防护、点赞/收藏闭环与收藏筛选 |
| `src/components/PostComposer.spec.ts` | 计数 near/over、按钮禁用、点击与快捷键发布、输入法保护、重复提交、飞行中继续输入 |
| `src/components/PostFeed.spec.ts` | 加载态、空态、倒序渲染、计数更新、收藏筛选与收藏空态 |
| `src/lib/time.spec.ts` | 相对时间 6 档梯度、跨年、未来时间归零、自然日边界 |
| `src/lib/stats.spec.ts` | 7 天分桶与标签、emoji 计字、今日计数、千分位 |
| `src/lib/sanitize.spec.ts` | 脏数据丢弃、去空白、超长截断、id 补齐/去重、非法时间修正、倒序、300 条裁剪 |
| `src/lib/id.spec.ts` | `crypto.randomUUID` 优先、缺失与抛错降级、降级唯一性 |
| `src/components/PostItem.spec.ts` | 作者与相对时间、`time[datetime]`、纯文本渲染、点赞/收藏按钮状态与点击、pending 禁用 |
| `src/components/StatsBoard.spec.ts` | 三项指标、emoji 计字、跳变动画、千分位 |
| `src/components/TrendChart.spec.ts` | 空态、7 列、今天高亮、柱高比例、零值占位、`aria-label` |
| `src/components/ToastHost.spec.ts` | 自动隐藏、连续提示重新计时 |
| `src/stores/useToastStore.spec.ts` | 显隐、文案覆盖、token 递增 |

## 目录结构

```
.
├── index.html                  # Vite 入口
├── vite.config.ts              # Vue 插件 / 别名 / /api 代理 / Vitest 配置
├── vitest.setup.ts             # 用例级环境清理（jsdom 与 node 双环境）
├── tsconfig.json               # 包含 src / server / shared
├── server/
│   ├── app.ts                  # Hono 应用：路由、校验、JSON 错误体、CORS
│   ├── store.ts                # 内存存储：倒序、裁剪、校验、可注入时钟与 id
│   └── index.ts                # @hono/node-server 启动（默认 8787）
├── shared/
│   ├── post.ts                 # Post / PostInput
│   ├── constants.ts            # MAX_LENGTH / MAX_ENTRIES / API_BASE_PATH
│   └── id.ts                   # id 生成（UUID 优先 + 降级）
├── src/
│   ├── main.ts                 # createApp + Pinia
│   ├── App.vue                 # 页面组合与全局 ticker
│   ├── services/postApi.ts     # REST 客户端与错误归一化
│   ├── stores/                 # usePostsStore / useToastStore
│   ├── lib/                    # 纯函数：time / stats / sanitize / id 重导出
│   ├── composables/            # ticker、textarea 自适应
│   ├── components/             # 视图组件
│   ├── test-utils/             # mountWithPinia、fakeServer
│   └── styles/                 # tokens / base / scene / layout / composer / stats / feed / toast / animations / responsive
└── README.md
```

## 数据与限制

- 存储位于服务端进程内存：**重启服务即清空**，最多保留最近 300 条
- 服务端权威：正文 `trim`、长度 ≤ 280、`id` 与 `createdAt` 由服务端生成
- 单实例、无鉴权，CORS 放开为 `*`，仅适合本地演示；生产化需要接入持久化存储、鉴权与限流
- 点赞 / 收藏为单用户语义：`liked`、`favorited` 是全局唯一标记，多客户端共享同一份状态，`likes` 随之在 0 / 1 之间切换
- 接口前缀固定为 `/api`（`shared/constants.ts` 中 `API_BASE_PATH`）

## 验收记录

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 单元 / 组件 / 集成测试 | `npm test` | 16 个文件、176 个用例全部通过（含 33 个后端用例） |
| 类型检查 | `npm run typecheck` | 无错误 |
| 生产构建 | `npm run build` | 成功（CSS 17.61 kB / JS 91.89 kB） |
| REST 冒烟 | `curl` / `Invoke-WebRequest` | health、列表、201、400×3、280 边界、点赞 0↔1、收藏切换、`POST_NOT_FOUND` 均符合契约 |
| 浏览器验收 | `npm run dev` | 点赞/取消、收藏/取消、收藏筛选、收藏空态、刷新后状态保持、发布默认零互动均通过 |

## 浏览器支持

支持 `fetch`、`crypto.randomUUID`（含降级实现）、CSS `backdrop-filter` 的现代浏览器（Chrome / Edge / Safari / Firefox 近期版本）。
