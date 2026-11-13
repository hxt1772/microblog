# 微语 · Moments

一个极简的本地短动态信息流，使用 **Vue 3 + TypeScript + Pinia + Vite** 实现，无后端、无数据库。
发布的内容只保存在当前浏览器的 LocalStorage 中，不经过任何服务器。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 构建 | Vite 8 + `@vitejs/plugin-vue` |
| 框架 | Vue 3.5（Composition API + `<script setup lang="ts">`） |
| 状态 | Pinia 4（setup store） |
| 测试 | Vitest 5 + `@vue/test-utils` + jsdom |
| 类型 | TypeScript 5.9 + `vue-tsc` |
| 存储 | 浏览器 `localStorage`（键名 `microblog.posts.v1`） |

## 快速开始

要求 Node.js `^20.19.0 || >=22.12.0`。

```bash
npm install      # 安装依赖
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 类型检查 + 生产构建（输出 dist/）
npm run preview  # 预览构建产物
npm test         # 运行全部单元 / 组件 / 集成测试
npm run typecheck # 仅类型检查
```

## 功能

- **发布**：输入文字后点击「发布」，或按 `Ctrl / ⌘ + Enter` 快速发布；中文输入法组词期间不会误触
- **查看**：时间线按发布时间倒序展示，显示相对时间（刚刚 / 3 分钟前 / 今天 09:05 / 昨天 20:07 / 11月10日 09:05 / 2025年12月31日），每分钟自动刷新
- **统计看板**：总动态数、累计字数（emoji 按 1 字计）、今日发布数，以及近 7 天发布趋势柱状图；发布后实时更新并带数字跳动反馈
- **本地持久化**：刷新或重新打开页面内容依然存在，最多保留最近 300 条
- **输入约束**：空内容不可发布，超过 280 字提示并禁用发布按钮，计数器接近上限变黄、超限变红
- **安全渲染**：用户内容一律按纯文本插值渲染，不解析任何 HTML 或脚本
- **异常降级**：LocalStorage 不可用（隐私模式 / 配额已满）时自动退回内存存储并提示
- **无障碍**：语义化标签、`aria-live` 提示、柱状图 `aria-label` 摘要、支持 `prefers-reduced-motion`

## 架构

```
App.vue（组合层：场景层 + 品牌栏 + 三大区块 + Toast）
├── SceneBackground / AppHeader        纯展示
├── PostComposer                       草稿与输入法状态留在组件内
├── StatsBoard → TrendChart            指标卡 + 近 7 天柱状图
├── PostFeed → PostItem / EmptyState   时间线
└── ToastHost                          2.6s 自动消失，卸载清理计时器
        ↓
stores/usePostsStore（唯一数据真源）  stores/useToastStore（提示状态）
        ↓
services/postRepository（LocalStorage 读写 + 内存降级）
        ↓
lib/sanitize · lib/time · lib/stats · lib/id（纯函数，时间参数显式传入）
```

设计要点：

- `posts` 是唯一数据真源，`stats` 用 `computed` 派生，避免冗余状态不同步
- 纯函数层显式接收 `now`，测试无需假时钟即可稳定断言；页面由统一 ticker 推进时间基准
- 组件按「props down / events up」，全部用户内容通过 `{{ }}` 插值输出
- 定时器、事件监听在组件卸载时统一清理

## TDD 与测试

开发按「先写失败测试 → 最小实现 → 重构」推进，测试覆盖行为而非实现细节。

| 测试文件 | 覆盖内容 |
| --- | --- |
| `src/lib/time.spec.ts` | 相对时间 6 档梯度、跨年、未来时间归零、自然日边界 |
| `src/lib/stats.spec.ts` | 7 天分桶与标签、emoji 计字、今日计数、出窗数据、千分位 |
| `src/lib/sanitize.spec.ts` | 脏数据丢弃、去空白、超长截断、id 补齐/去重、非法时间修正、倒序、300 条裁剪 |
| `src/lib/id.spec.ts` | `crypto.randomUUID` 优先、缺失与抛错时的降级、降级唯一性 |
| `src/services/postRepository.spec.ts` | 空键、合法/畸形 JSON、读取抛错、配额异常、内存降级、快照隔离 |
| `src/stores/usePostsStore.spec.ts` | 水合清洗、发布置顶/裁剪、空与超长拒绝、写入失败标记、跨天重算 |
| `src/stores/useToastStore.spec.ts` | 显隐、文案覆盖、token 递增 |
| `src/components/PostComposer.spec.ts` | 计数 near/over、按钮禁用、点击与快捷键发布、输入法保护、存储异常提示 |
| `src/components/PostFeed.spec.ts` | 空态切换、倒序渲染、计数更新 |
| `src/components/PostItem.spec.ts` | 作者与相对时间、`time[datetime]`、纯文本渲染 |
| `src/components/StatsBoard.spec.ts` | 三项指标、emoji 计字、跳变动画、千分位 |
| `src/components/TrendChart.spec.ts` | 空态、7 列、今天高亮、柱高比例、零值占位、`aria-label` |
| `src/components/ToastHost.spec.ts` | 自动隐藏、连续提示重新计时 |
| `src/App.spec.ts` | 首屏结构、发布闭环、刷新恢复、存储降级提示、XSS 防护 |

## 目录结构

```
.
├── index.html                  # Vite 入口
├── vite.config.ts              # Vue 插件 / 别名 / Vitest 配置
├── vitest.setup.ts             # 用例级环境清理
├── tsconfig.json
├── src/
│   ├── main.ts                 # createApp + Pinia
│   ├── App.vue                 # 页面组合与全局 ticker
│   ├── config/constants.ts     # 280 / 300 / 存储键等常量
│   ├── types/post.ts           # Post / PostStats / StorageLike
│   ├── lib/                    # 纯函数：id / time / stats / sanitize
│   ├── services/               # postRepository
│   ├── stores/                 # usePostsStore / useToastStore
│   ├── composables/            # ticker、textarea 自适应
│   ├── components/             # 视图组件
│   └── styles/                 # tokens / base / scene / layout / composer / stats / feed / toast / animations / responsive
└── README.md
```

## 数据说明

- 存储键名：`microblog.posts.v1`（与旧版一致，历史数据可直接沿用）
- 数据结构：`{ id, content, createdAt }`
- 最多保留最近 300 条，超出部分自动丢弃
- 读取时会清洗数据：丢弃空内容、截断超 280 字、补齐或重写重复 `id`、修正非法时间戳、按时间倒序
- 清空浏览器站点数据后内容会丢失；也可在控制台执行：

```js
localStorage.removeItem("microblog.posts.v1");
```

## 验收记录

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 单元 / 组件 / 集成测试 | `npm test` | 14 个文件、94 个用例全部通过 |
| 类型检查 | `npm run typecheck` | 无错误 |
| 生产构建 | `npm run build` | 构建成功（CSS 15.7 kB / JS 86.6 kB） |
| 浏览器验收 | `npm run dev` | 首页与发布流程人工确认 |

## 浏览器支持

支持 LocalStorage、`crypto.randomUUID`（含降级实现）、CSS `backdrop-filter` 的现代浏览器（Chrome / Edge / Safari / Firefox 近期版本）。
