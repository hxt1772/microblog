# 微语 · Moments

一个极简的本地短动态信息流，使用纯 HTML + CSS + JavaScript 编写，无框架、无构建步骤、无第三方依赖。

发布的内容只保存在当前浏览器的 LocalStorage 中，不经过任何服务器。

## 功能

- **发布**：输入文字后点击「发布」，或按 `Ctrl / ⌘ + Enter` 快速发布
- **查看**：时间线按发布时间倒序展示，显示相对时间（刚刚 / 3 分钟前 / 昨天 14:20）
- **统计看板**：展示总动态数、累计字数、今日发布数，以及近 7 天发布趋势柱状图，发布后实时更新
- **本地持久化**：刷新或重新打开页面，内容依然存在
- **输入约束**：空内容不可发布，超过 280 字提示并禁用发布按钮
- **安全渲染**：用户内容按纯文本渲染，不会执行任何 HTML 或脚本
- **异常降级**：LocalStorage 不可用（隐私模式 / 配额已满）时自动退回内存存储并提示

## 本地运行

直接用浏览器打开 `index.html` 即可。

如需用本地服务器访问：

```bash
npx serve .
```

## 数据说明

- 存储键名：`microblog.posts.v1`
- 数据结构：`{ id, content, createdAt }`
- 最多保留最近 300 条，超出部分自动丢弃
- 清空浏览器站点数据后内容会丢失

如需手动清空，在浏览器控制台执行：

```js
localStorage.removeItem("microblog.posts.v1");
```

## 目录结构

```
.
├── index.html   # 页面结构
├── styles.css   # 样式与设计令牌
├── app.js       # 数据层 / 视图层 / 控制层
└── README.md
```

## 浏览器支持

支持 LocalStorage、`crypto.randomUUID`（含降级实现）、CSS `backdrop-filter` 的现代浏览器（Chrome / Edge / Safari / Firefox 近期版本）。

## 仓库

https://github.com/hxt1772/microblog
