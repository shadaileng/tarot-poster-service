# 🃏 塔罗海报生成服务 — 开发规划书

> 版本: v2.1 | 日期: 2026-06-17 | 状态: Phase 1-2 已完成，Phase 3 已完成，Phase 4 部分完成

---

## 一、项目现状

### 1.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js 22 + TypeScript 5.4 | ESNext 模块，`bundler` 模块解析 |
| 框架 | Express 4.21 | 轻量 HTTP 服务 |
| 渲染引擎 | Puppeteer 23.6 | 无头 Chrome 截图 |
| 包管理 | pnpm 9.15 | 锁定依赖 |
| 测试 | Vitest 2.1 | 单元 + 集成测试 |
| 部署 | Docker + docker-compose | 容器化运行 |

### 1.2 当前架构

```
POST /poster  ──→  authMiddleware (可选 Bearer Token 鉴权)
                      │
                      ▼
              缓存检查 (LRUCache, SHA256 去重)
                      │
              ┌── HIT ──→ 直接返回 PNG + X-Cache: HIT
              │
              ▼ MISS
              getTemplate(name) → { name, html, css, width, defaultTheme }
                      │
                      ▼
              buildPosterHTML(data)
                      │  generateCardHTML() × N 牌面 HTML 片段
                      │  renderTemplate() → engine.ts 变量注入
                      │  themeToCSSVars() → CSS 自定义属性
                      ▼
              renderPoster(html, width)
                      │  getBrowser() → 单例 Browser + 健康检查
                      │  BrowserPool.acquire() → Page 池化
                      │  setContent → 资源就绪检查 → screenshot
                      │  返回 { buffer, timings }
                      ▼
              LRUCache.set(key, buffer)
                      │
                      ▼
              Response: image/png + X-Cache: MISS + 耗时响应头

GET /health   ──→  缓存状态 + 浏览器池状态 + 渲染 P50/P95/P99
GET /metrics  ──→  Prometheus 格式指标
GET /         ──→  服务信息 (HF Spaces 兼容)
```

### 1.3 已实现功能

- ✅ 基础海报生成 API（`POST /poster`）
- ✅ 三套海报模板：default（暗黑 750×1334）、minimal（简约白底 750×1334）、wechat（暗黑 1080×1920 朋友圈比例）
- ✅ 模板注册表：`src/poster/templates/index.ts` 统一管理模板元数据，未匹配时回退 default
- ✅ 牌阵渲染（正位/逆位 180° 旋转、位置标签、关键词、含义文本）
- ✅ AI 综合解读区域（优先使用 `comprehensiveInterpretation`，回退 `interpretation`）
- ✅ LRU 内存缓存（SHA256 去重，TTL 可配，容量上限淘汰）
- ✅ API Key 鉴权中间件（可选，`API_KEY` 为空则跳过）
- ✅ CORS 中间件（可配 `CORS_ORIGIN`）
- ✅ Docker 容器化部署（含 Chromium + Noto Serif CJK SC 中文字体）
- ✅ 本地卡牌 SVG 静态资源服务（`/cards` 端点）
- ✅ 基础单元测试（模板生成、缓存、XSS 防护）
- ✅ HTML/CSS 模板外挂化（独立 `.html`/`.css` 文件，纯正则替换模板引擎）
- ✅ 设计令牌系统（dark/light 双主题，CSS 自定义属性注入）
- ✅ 浏览器 Page 池化（`BrowserPool` 类，用完即关策略，排队等待机制）
- ✅ 字体本地化（`@font-face` 引用系统 `Noto Serif CJK SC`，零 CDN 依赖）
- ✅ 浏览器健康检查（30s 周期 ping + `disconnected` 事件监听 + 自动重连）
- ✅ 错误诊断抓取（`page.content()`、失败截图、console 日志收集）
- ✅ 性能监控仪表板（分阶段耗时、缓存命中率、P50/P95/P99、Prometheus `/metrics`）

### 1.4 已知问题

| 问题 | 严重程度 | 状态 | 表现 |
|------|:--:|:--:|------|
| 资源就绪检查不充分 | 🔴 高 | ✅ 已修复 (1.1) | `networkidle0` 可能提前触发，导致截图时图片未加载完成 |
| Google Fonts 加载延迟 | 🔴 高 | ✅ 已修复 (1.2) | Noto Serif SC 在线字体可能未就绪即截图，出现缺字 |
| 浏览器单例无重连机制 | 🟡 中 | ✅ 已修复 (1.3) | 浏览器崩溃后所有后续请求失败 |
| 无错误诊断抓取 | 🟡 中 | ✅ 已修复 (1.4) | 渲染失败时缺少页面状态快照，难以排查 |
| HTML 模板耦合在 TS 中 | 🟡 中 | ✅ 已修复 (2.1) | 300+ 行模板字符串，CSS 无语法高亮，难以维护 |
| 无并发渲染能力 | 🟢 低 | ✅ 已修复 (2.3) | 单 Page 串行，高并发时响应慢 |
| 设计令牌硬编码 | 🟢 低 | ✅ 已修复 (2.2) | 颜色/字号/间距写死在模板字符串中，无法切换主题 |
| 缺乏性能监控 | 🟢 低 | ✅ 已修复 (3.2) | 无渲染耗时、缓存命中率等指标 |
| 无结构化日志 | 🟢 低 | ⬜ 待处理 (4.3) | console.log 无法按级别/模块过滤 |
| 测试覆盖率不足 | 🟢 低 | ✅ 已修复 (4.1) | 8 个测试文件 117 个测试用例，覆盖 API/缓存/池/主题/模板/引擎/指标 |
| 无 CI/CD 流水线 | 🟢 低 | ⬜ 待处理 (4.2) | 手动构建和部署 |

---

## 二、规划目标

### 核心目标

将 `tarot-poster-service` 从一个"能跑"的单体截图服务，升级为**高可用、易维护、可扩展**的海报渲染引擎。

### 设计原则

1. **渐进式改进** — 优先修复已知问题，再新增功能
2. **最小破坏性** — 所有改动保持 API 接口向后兼容
3. **可观测性优先** — 所有关键路径必须具备日志和指标
4. **独立可测试** — 每个模块可独立进行单元测试

---

## 三、迭代路线

### Phase 1: 稳定性修复 ✅ 已完成

**目标**：消除生产环境偶发白图/缺字问题，提升基础可靠性。

#### 任务 1.1 — 增强资源就绪检查 ✅

**文件**：`src/poster/render.ts`

**实施细节**：
- 在 `page.setContent()` 使用 `domcontentloaded`（不依赖网络空闲）
- 在截图前执行 5 步防御性资源就绪检查：
  1. 等待所有 `<img>` 的 `complete && naturalWidth > 0`（每张图片 8s 超时兜底）
  2. 执行 `img.decode()` 强制 GPU 纹理上传（带 `.catch()` 容错）
  3. 等待 `document.fonts.ready` 确保字体渲染完成
  4. 额外 `setTimeout(100ms)` 让浏览器完成合成管线
  5. 最终等待 `.poster-ready` 选择器（10s 超时）
- 增加分阶段耗时打点：`setContentMs` / `resourceMs` / `composeMs` / `screenshotMs` / `totalMs`

**预期收益**：消除 90% 以上的"白图/缺字"偶发问题。

---

#### 任务 1.2 — 字体本地化 ✅

**文件**：各模板 CSS 文件（`default.css`、`minimal.css`、`wechat.css`）

**实施细节**：
- 在所有 CSS 模板中通过 `@font-face` 声明本地字体：
  ```css
  @font-face {
    font-family: 'Noto Serif CJK SC';
    src: local('Noto Serif CJK SC'),
         url('file:///usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc') format('truetype');
    font-weight: 400;
    font-display: block;
  }
  ```
- 同样声明 Bold 字重（`NotoSerifCJK-Bold.ttc`）
- Docker 镜像已包含 `fonts-noto-cjk` 包，零额外网络依赖
- `font-display: block` 确保字体加载完成前不渲染文字（避免 FOIT）

**预期收益**：消除网络依赖，字体加载时间从 2-5s 降至 <100ms。

---

#### 任务 1.3 — 浏览器重连机制 ✅

**文件**：`src/poster/render.ts`

**实施细节**：
- `getBrowser()` 函数实现双重保险机制：
  - **主动检查**：每次调用先检查 `browser.isConnected()`，断连则 `browserPromise = null` 触发重连
  - **被动监听**：注册 `browser.on('disconnected')` 事件，崩溃时自动置空
  - **周期健康检查**：`setInterval` 每 30s ping 一次，使用 `.unref()` 防止阻止进程退出
- `getBrowser()` 返回全局单例 `browserPromise`，首次启动或断连后 `puppeteer.launch()`
- `closeBrowser()` 优雅关闭：先停健康检查 → 关浏览器池 → 关浏览器实例
- 进程退出时注册 `SIGTERM`/`SIGINT` 处理器调用 `closeBrowser()`

**预期收益**：浏览器崩溃后自动恢复，无需手动重启服务。

---

#### 任务 1.4 — 错误诊断抓取 ✅

**文件**：`src/poster/render.ts`

**实施细节**：
- 在渲染前注册 `page.on('console')` 和 `page.on('pageerror')` 监听器
- `renderPoster()` 的 catch 块中执行三级诊断：
  1. 捕获 `page.content()` 作为诊断 HTML（截取前 2000 字符）
  2. 尝试 `page.screenshot()` 获取失败时页面快照，保存到 `os.tmpdir()/tarot-poster-error-{timestamp}.png`
  3. 收集 console 日志（最近 50 条）和页面 JS 错误
- 所有诊断信息通过 `console.error()` 输出为结构化 JSON
- finally 块中移除事件监听器防止内存泄漏，归还 Page 到池

**预期收益**：渲染失败时可快速定位根因（CSS 错误、JS 异常、图片 404 等）。

---

### Phase 2: 架构优化 ✅ 已完成

**目标**：提升代码可维护性和开发体验，为后续扩展打基础。

#### 任务 2.1 — HTML 模板外挂化 ✅

**文件**：
- 新建：`src/poster/templates/default.html`、`default.css`
- 新建：`src/poster/engine.ts` — 模板加载 + 变量注入引擎
- 重构：`src/poster/template.ts` — 卡片 HTML 生成 + 模板编排

**实施细节**：

**模板引擎 (`engine.ts`)**：
- `loadTemplate(name)` — 开发模式每次读取文件（`NODE_ENV !== 'production'`），生产模式首次读取后缓存
- `renderTemplate(template, variables)` — 纯正则替换：
  - `{{ key }}` → HTML 转义替换（防 XSS）
  - `{{{ key }}}` → 原样注入（用于预编译 HTML 片段）
  - `{{ css }}` → 注入 CSS 文件内容
  - `{{ themeCSSVars }}` → 注入主题 CSS 自定义属性
- `escapeHtml()` 函数对 `<>&"'/` 五个字符做转义

**模板编排 (`template.ts`)**：
- `buildPosterHTML(data)` 主流程：
  1. 从 `getTemplate(data.template)` 获取模板元数据
  2. `generateCardHTML()` 为每张牌生成 HTML 片段（位置标签、牌面 SVG→base64 data URI、正逆位标记、牌名、关键词、含义）
  3. 从 `data.comprehensiveInterpretation` 或 `data.interpretation` 提取综合解读（按 `✨ 综合解读` 标记分割）
  4. `getTheme(data.theme)` 获取主题对象 → `themeToCSSVars()` 转 CSS 变量
  5. `renderTemplate()` 注入到 HTML 模板中

**SVG 图片处理**：
- `readCardSVG()` 从 `assets/cards/` 读取本地 SVG 文件
- 转为 base64 data URI 内嵌 HTML，实现零网络依赖的牌面渲染
- 使用 `safeFetch` 封装，带 10s 超时和错误处理

**目录结构**：
```
src/poster/
  ├── templates/
  │   ├── index.ts          # 模板注册表
  │   ├── default.html      # 默认暗黑模板
  │   ├── default.css       # 默认样式（渐变背景、星月装饰）
  │   ├── minimal.html      # 简约白底模板
  │   ├── minimal.css       # 简约样式（纯色背景、简洁边框）
  │   ├── wechat.html       # 微信朋友圈模板
  │   └── wechat.css        # 微信样式（更大尺寸和间距）
  ├── engine.ts             # 模板加载 + 变量注入引擎
  ├── template.ts           # 卡片 HTML 生成 + 模板编排
  ├── render.ts             # Puppeteer 渲染 + 浏览器管理
  ├── browser-pool.ts       # 浏览器 Page 池
  ├── theme.ts              # 设计令牌系统
  └── types.ts              # 类型定义
```

**预期收益**：
- 新增模板无需修改 TypeScript 代码，只需添加 `.html`/`.css` 文件
- HTML/CSS 可在浏览器中直接预览和调试
- IDE 获得 HTML/CSS 语法高亮、自动补全、lint 支持

---

#### 任务 2.2 — 设计令牌系统（Design Tokens） ✅

**文件**：
- 新建：`src/poster/theme.ts` — 主题定义 + CSS 变量生成

**实施细节**：

**主题对象类型**：
```typescript
interface PosterTheme {
  id: string                          // 'dark' | 'light'
  colors: { ... }                     // 颜色令牌
  typography: { ... }                 // 排版令牌
  spacing: { pagePadding, cardGap, sectionGap }
  radius: { card, section }
  shadows: { card, section, glow }
  decoration: { ... }                 // 装饰元素（渐变、光晕等）
}
```

**内置主题**：
| 主题 | id | 背景 | 文字 | 强调色 | 适用场景 |
|------|----|------|------|--------|----------|
| 暗黑神秘 | `dark` | `#0a0a0f` 深黑 | `#e8e0d0` 暖白 | `#c9a96e` 金色 | 默认、wechat |
| 明亮简约 | `light` | `#faf8f5` 奶油白 | `#2d2a26` 深棕 | `#8b6914` 古铜 | minimal |

**CSS 变量命名规范**：`--t-{category}-{name}`，如 `--t-color-bg`、`--t-font-title-size`

**`themeToCSSVars()` 函数**：
- 递归遍历主题对象，将嵌套路径转为 CSS 自定义属性
- `colors.bg` → `--t-color-bg: #0a0a0f`
- `typography.titleSize` → `--t-font-title-size: 48px`（自动加 `px` 后缀）
- 所有 CSS 模板通过 `{{ themeCSSVars }}` 占位符注入

**API 集成**：`POST /poster` 接受可选 `theme?: 'dark' | 'light'`，未指定时使用模板默认主题

**预期收益**：主题切换零代码成本，支持未来扩展自定义品牌色。

---

#### 任务 2.3 — 浏览器 Page 池化 ✅

**文件**：
- 新建：`src/poster/browser-pool.ts` — 浏览器 Page 连接池

**实施细节**：

**`BrowserPool` 类设计**：
```
核心策略：Page 用完即关，不复用（避免僵尸 Page 风险）
并发模型：池满时排队等待，支持超时
```

- `acquire()` — 获取 Page：
  - 当前活跃数 < `maxPages` → 直接 `browser.newPage()` 创建
  - 池满 → 加入 `waitQueue` 等待，支持 `acquireTimeoutMs` 超时
  - 返回带唯一 `_poolId` 标记的 Page 对象
- `release(page)` — 归还 Page：
  - 关闭 Page（`page.close()` 带 try/catch 容错）
  - 递减活跃计数
  - 通知等待队列中的下一个请求
- `getStats()` — 获取池状态：
  ```typescript
  { available: number, active: number, waiting: number, maxPages: number }
  ```
- `shutdown()` — 优雅关闭：
  - 拒绝所有等待中的请求
  - 清空等待队列

**配置**（通过 `src/config.ts` 管理）：
- `POOL_MAX_PAGES` 环境变量，默认值 4
- `POOL_ACQUIRE_TIMEOUT_MS` 环境变量，默认值 30000

**全局单例**：`getBrowserPool(browser)` 函数返回与浏览器实例绑定的池单例

**集成到 `renderPoster()`**：
```typescript
const browser = await getBrowser()          // 获取/重连浏览器
const pool = await getBrowserPool(browser)  // 获取/创建池
const page = await pool.acquire()           // 从池获取 Page
try {
  // ... 渲染逻辑 ...
} finally {
  await pool.release(page)                  // 归还/关闭 Page
}
```

**预期收益**：并发渲染能力提升至 N 倍（N = `POOL_MAX_PAGES`），单 Page 创建/销毁开销通过池化均摊。

---

### Phase 3: 功能扩展 🔄 进行中

**目标**：增加新功能，提升用户体验和业务价值。

#### 任务 3.1 — 多模板支持 ✅

**文件**：`src/poster/templates/` 目录扩展 + `src/poster/templates/index.ts`

**实施细节**：

**模板注册表 (`templates/index.ts`)**：
```typescript
interface TemplateMeta {
  name: TemplateName          // 'default' | 'minimal' | 'wechat'
  html: string                // HTML 模板文件名
  css: string                 // CSS 文件名
  width: number               // 海报宽度
  defaultTheme: 'dark' | 'light'
}

const templates: Record<TemplateName, TemplateMeta>
// getTemplate(name?) → 返回模板元数据，未匹配回退 default
```

**三套模板规格**：

| 模板 | 宽度 | 默认主题 | 设计特点 | 适用场景 |
|------|------|----------|----------|----------|
| `default` | 750px | dark | 渐变背景、星月装饰、完整视觉层次 | 默认通用海报 |
| `minimal` | 750px | light | 纯色奶油白背景、简洁边框、轻量设计 | 打印、简约风格 |
| `wechat` | 1080px | dark | 更大尺寸、更大字体和间距 | 微信朋友圈分享（1080×1920） |

**API 集成**：
- `POST /poster` 接受 `template?: 'default' | 'minimal' | 'wechat'`
- 缓存键包含 `template` 参数，不同模板独立缓存
- 模板元数据的 `width` 传递给 `renderPoster(html, width)` 决定视口宽度
- 未指定 `theme` 时使用模板的 `defaultTheme`

**模板公共特性**：
- 所有模板通过 `{{ cards }}` 注入牌面 HTML 片段
- 所有模板通过 `{{ interpretation }}` 注入综合解读
- 所有模板使用 `{{ themeCSSVars }}` 实现主题化
- 所有模板包含 `.poster-ready` 标记用于截图就绪检测
- 所有模板使用本地 `@font-face` 声明 Noto Serif CJK SC

---

#### 任务 3.2 — 性能监控仪表板 ✅

**文件**：
- 新建：`src/monitor/metrics.ts` — 指标收集器
- 新建：`src/monitor/index.ts` — 统一导出

**实施细节**：

**`MetricsCollector` 类**：
```
数据结构：环形缓冲区，最多 1000 个渲染样本
记录维度：templateMs / resourceMs / screenshotMs / totalMs / template / cacheHit
```

- `recordRender(timing: RenderTiming)` — 记录一次渲染：
  - 总请求数 +1
  - 缓存命中/未命中分别计数
  - 非缓存请求累计各阶段总耗时
  - 样本存入环形缓冲区（满后覆盖最旧记录）
- `recordError()` — 记录渲染错误
- `getSnapshot()` — 获取当前统计快照：
  - `totalRequests`、`cacheHits`、`cacheMisses`、`cacheHitRate`、`errorCount`
  - 各阶段 `avgXxxMs` 平均耗时
  - `P50`/`P95`/`P99` 分位数（基于排序样本计算）
  - `sampleCount`、`nonCacheSampleCount`
- `toPrometheus()` — 导出 Prometheus 格式：
  - `poster_requests_total` (counter)
  - `poster_cache_hits_total` / `poster_cache_misses_total` (counter)
  - `poster_cache_hit_rate` (gauge)
  - `poster_errors_total` (counter)
  - `poster_render_duration_ms` (summary, 含 P50/P95/P99)
  - `poster_template_duration_ms` (summary)
  - `poster_resource_duration_ms` (summary)
  - `poster_screenshot_duration_ms` (summary)
- `reset()` — 重置所有统计

**API 集成**：

| 端点 | 说明 |
|------|------|
| `GET /metrics` | Prometheus 格式指标，Content-Type: `text/plain; version=0.0.4` |
| `GET /health` | 扩展：增加 `metrics.totalRequests`、`metrics.errors`、`metrics.avgTotalMs`、`metrics.renderP50/P95/P99` |
| `POST /poster` | 响应头增加 `X-Render-Template-Ms`、`X-Render-Resource-Ms`、`X-Render-Screenshot-Ms`、`X-Render-Total-Ms` |

**分阶段耗时来源**（来自 `renderPoster` 的 `RenderStageTiming`）：
- `templateMs` — `buildPosterHTML()` 耗时（index.ts 中打点）
- `resourceMs` — 图片加载 + decode + 字体等待（render.ts 中打点）
- `screenshotMs` — `page.screenshot()` 耗时（render.ts 中打点）
- `totalMs` — 请求进入到响应完成（index.ts 中打点）

---

#### 任务 3.3 — 动画海报 🔜 待启动

**文件**：`src/poster/animation.ts`（新建）

**设计方向**：
- 在模板中集成 GSAP 入场动画
- 通过 `window.__hf.seek()` 协议支持逐帧截取
- 使用 FFmpeg 将帧序列编码为短视频
- API 增加 `POST /poster/video` 端点
- 支持生成 3-5 秒的分享动画

**借鉴**：HyperFrames 的 `data-*` 声明式轨道 + 帧适配器模式。

---

### Phase 4: 工程化增强 🔄 进行中

**目标**：提升代码质量和运维效率。

#### 任务 4.1 — 测试覆盖率提升 ✅

**当前测试**：8 个测试文件，117 个测试用例，1 个跳过

**已实施**：

1. **模板引擎单元测试** — `test/engine.test.ts`（9 tests）
   - `renderTemplate` 变量替换（{{ escaped }} / {{{ raw }}}）
   - HTML 转义防 XSS
   - CSS 文件注入
   - themeCSSVars 注入
   - 缺失变量容错
   - 多模板套用

2. **主题系统测试** — `test/theme.test.ts`（17 tests）
   - `getTheme` 查找/回退（dark/light/unknown）
   - `themeToCSSVars` CSS 变量输出格式
   - dark/light 主题令牌完整性对比
   - 颜色/排版/间距/圆角令牌验证

3. **模板注册表测试** — `test/templates.test.ts`（13 tests）
   - `getTemplate` 精确匹配/未指定回退 default/未知回退
   - 各模板 width 和 defaultTheme 正确性

4. **指标收集器测试** — `test/metrics.test.ts`（23 tests）
   - recordRender 计数/缓存命中未命中分离
   - recordError 错误计数
   - getSnapshot 零值状态/P50/P95/P99 分位数/缓存命中率
   - toPrometheus 格式含 HELP/TYPE 注释
   - reset 清空所有统计

5. **浏览器池测试** — `test/browser-pool.test.ts`（14 tests）
   - acquire/release 流程（Mock Page）
   - 池满排队等待 + 超时拒绝
   - shutdown 拒绝等待者 + 关闭活跃 Page
   - getStats 状态快照

6. **缓存边界测试** — `test/poster.test.ts` 扩展（17 tests）
   - LRU 淘汰（访问后移动到末尾）
   - 容量上限驱逐最旧条目
   - 缓存键包含 template/theme/comprehensiveInterpretation
   - size/maxSize 属性验证

7. **API 集成测试** — `test/api.test.ts`（21 tests）
   - GET / 返回服务信息
   - GET /health 返回缓存/池/指标状态
   - GET /metrics Prometheus 格式
   - POST /poster 参数校验（空 cards/缺失 cards → 400）
   - POST /poster 成功返回 image/png + X-Cache HIT/MISS
   - X-Render-* 响应头、Cache-Control
   - auth 中间件（未配置 API_KEY 时跳过）
   - CORS 中间件（Access-Control-Allow-Origin + OPTIONS 204）

8. **渲染集成测试** — `test/render.test.ts`（4 tests | 1 skipped）
   - Mock Puppeteer 模块结构验证
   - renderPoster/closeBrowser 导出验证

**新增 devDependencies**：
- `supertest` / `@types/supertest` — API 端到端测试

**目标覆盖率**：>80% 行覆盖

---

#### 任务 4.2 — CI/CD 流水线

**设计**：
```
GitHub Actions workflow:
  push/PR → lint (tsc --noEmit) → test (vitest run) → build (tsc) → docker build → docker push
```

**具体步骤**：
1. `pnpm install --frozen-lockfile`
2. `pnpm exec tsc --noEmit` — 类型检查
3. `pnpm test` — 运行测试
4. `pnpm build` — 编译 TypeScript
5. `docker build -t tarot-poster-service .`
6. `docker push` — 推送到镜像仓库
7. 合并到 main 分支后自动部署

**环境变量管理**：通过 GitHub Secrets 管理 `DOCKER_REGISTRY`、`API_KEY` 等敏感信息

---

#### 任务 4.3 — 日志标准化

**当前状态**：所有日志使用 `console.log` / `console.error` / `console.warn`，无结构化

**计划**：
- 引入 `pino` 结构化日志库（轻量，性能好）
- 统一日志格式：
  ```json
  { "level": "info", "timestamp": "...", "module": "render", "message": "...", "durationMs": 1234, "template": "default" }
  ```
- 按模块区分：`[Puppeteer]`、`[Cache]`、`[Pool]`、`[API]`、`[Metrics]`
- 开发环境输出美化格式（`pino-pretty`），生产环境输出 JSON
- 通过 `LOG_LEVEL` 环境变量控制日志级别（debug/info/warn/error）

**影响文件**：`src/index.ts`、`src/poster/render.ts`、`src/poster/browser-pool.ts`、`src/cache/index.ts`、`src/monitor/metrics.ts`

---

## 四、API 演进计划

### 当前 API

```
# 海报生成
POST /poster
Body: {
  cards: PosterCardInput[],
  question: string,
  spreadName: string,
  interpretation?: string,
  comprehensiveInterpretation?: string,
  date: string,
  theme?: 'dark' | 'light',
  template?: 'default' | 'minimal' | 'wechat'
}
Response: image/png
Response Headers:
  X-Cache: HIT | MISS
  X-Render-Template-Ms: <number>
  X-Render-Resource-Ms: <number>
  X-Render-Screenshot-Ms: <number>
  X-Render-Total-Ms: <number>
  Cache-Control: public, max-age=3600

# 健康检查
GET /health
Response: {
  status: 'ok',
  cache: { size, maxSize, hitRate },
  pool: { available, active, waiting, maxPages },
  metrics: { totalRequests, errors, avgTotalMs, renderP50, renderP95, renderP99 }
}

# 性能指标
GET /metrics
Response: text/plain (Prometheus format)

# 服务信息
GET /
Response: { service, version, status, endpoints }
```

### 未来 API

```
# Phase 3: 动画海报 🔜
POST /poster/video
Body: { ...PosterData, duration?: number, fps?: number }
Response: video/mp4
```

---

## 五、环境变量规划

| 变量 | 当前 | 规划 | 默认值 | 说明 |
|------|:--:|:--:|------|------|
| `PORT` | ✅ | ✅ | 3000 | 服务端口 |
| `NODE_ENV` | ✅ | ✅ | development | 运行环境 |
| `API_KEY` | ✅ | ✅ | (空=跳过鉴权) | API 鉴权密钥 |
| `CORS_ORIGIN` | ✅ | ✅ | * | 跨域白名单 |
| `PUPPETEER_EXECUTABLE_PATH` | ✅ | ✅ | /usr/bin/google-chrome | Chrome 路径 |
| `PUPPETEER_ARGS` | ✅ | ✅ | --no-sandbox,--disable-setuid-sandbox,... | Chrome 启动参数 |
| `CACHE_MAX_SIZE` | ✅ | ✅ | 100 | 缓存最大条目 |
| `CACHE_TTL_SECONDS` | ✅ | ✅ | 3600 | 缓存过期时间 (s) |
| `POSTER_WIDTH` | ✅ | ✅ | 750 | 默认海报宽度（被模板覆盖） |
| `POSTER_HEIGHT` | ✅ | ✅ | 1334 | 默认海报高度（fullPage 截图忽略） |
| `POOL_MAX_PAGES` | ✅ | ✅ | 4 | 浏览器 Page 池大小 |
| `POOL_ACQUIRE_TIMEOUT_MS` | ✅ | ✅ | 30000 | Page 获取超时 (ms) |
| `LOG_LEVEL` | — | 🆕 | info | 日志级别 (debug/info/warn/error) |
| `FONT_PATH` | — | 🆕 | /usr/share/fonts | 自定义字体目录 |

---

## 六、项目目录结构（当前实际）

```
tarot-poster-service/
├── src/
│   ├── index.ts                  # Express 入口（路由、中间件注册）
│   ├── config.ts                 # 环境变量集中管理
│   ├── cache/
│   │   └── index.ts              # LRU 内存缓存 (Map-based, TTL + 容量淘汰)
│   ├── middleware/
│   │   ├── auth.ts               # Bearer Token 鉴权（可选）
│   │   └── cors.ts               # CORS 响应头 + OPTIONS 预检
│   ├── monitor/
│   │   ├── index.ts              # 监控模块统一导出
│   │   └── metrics.ts            # 指标收集器 (环形缓冲 + Prometheus 导出)
│   ├── poster/
│   │   ├── types.ts              # 类型定义 (PosterData, PosterCardInput, TemplateName)
│   │   ├── engine.ts             # 模板引擎 (纯正则替换 + HTML 转义)
│   │   ├── template.ts           # 海报 HTML 生成 (卡片片段 + 模板编排)
│   │   ├── render.ts             # Puppeteer 渲染 (浏览器管理 + 截图 + 诊断)
│   │   ├── browser-pool.ts       # Page 连接池 (用完即关 + 排队等待)
│   │   ├── theme.ts              # 设计令牌 (dark/light + CSS 变量生成)
│   │   └── templates/
│   │       ├── index.ts          # 模板注册表 (元数据管理 + 查找回退)
│   │       ├── default.html      # 默认暗黑模板 HTML
│   │       ├── default.css       # 默认暗黑模板 CSS
│   │       ├── minimal.html      # 简约白底模板 HTML
│   │       ├── minimal.css       # 简约白底模板 CSS
│   │       ├── wechat.html       # 微信朋友圈模板 HTML
│   │       └── wechat.css        # 微信朋友圈模板 CSS
├── test/
│   ├── poster.test.ts            # 模板 + 缓存 + LRU + XSS 防护测试
│   ├── engine.test.ts            # 模板引擎变量注入测试
│   ├── theme.test.ts             # 主题系统测试
│   ├── templates.test.ts         # 模板注册表测试
│   ├── metrics.test.ts           # 性能指标收集器测试
│   ├── browser-pool.test.ts      # 浏览器 Page 池测试
│   ├── render.test.ts            # Puppeteer 渲染 Mock 测试
│   └── api.test.ts               # API 端到端测试 (supertest)
├── assets/
│   └── cards/                    # 塔罗牌 SVG 图片 (78 张大阿卡纳)
├── docs/
│   ├── development-plan.md       # 本文档
│   └── hf-space-deploy.md        # HF Spaces 部署指南
├── Dockerfile                    # 生产环境镜像
├── Dockerfile.hf                 # HF Spaces 镜像
├── docker-compose.yml            # 本地开发编排
├── Makefile                      # 常用命令快捷方式
├── package.json                  # 依赖 + 脚本
├── pnpm-lock.yaml                # 锁定依赖版本
├── tsconfig.json                 # TypeScript 配置
└── README.md                     # 项目说明
```

---

## 七、里程碑时间线

```
Week 1-2  ████████  Phase 1: 稳定性修复 ✅ 已完成
          ├── 1.1 增强资源就绪检查 ✅
          ├── 1.2 字体本地化 ✅
          ├── 1.3 浏览器重连机制 ✅
          └── 1.4 错误诊断抓取 ✅

Week 3-4  ████████  Phase 2: 架构优化 ✅ 已完成
          ├── 2.1 HTML 模板外挂化 ✅
          ├── 2.2 设计令牌系统 ✅
          └── 2.3 浏览器 Page 池化 ✅

Week 5-6  ████████  Phase 3: 功能扩展 🔄 进行中
          ├── 3.1 多模板支持 ✅
          ├── 3.2 性能监控仪表板 ✅
          └── 3.3 动画海报 🔜

Week 7+   ████████  Phase 4: 工程化增强 🔄 进行中
          ├── 4.1 测试覆盖率提升 ✅
          ├── 4.2 CI/CD 流水线 🔜
          └── 4.3 日志标准化 🔜
```

---

## 八、风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|:--:|:--:|------|
| Puppeteer 版本升级导致截图差异 | 低 | 中 | 锁定版本，视觉回归测试 |
| 字体本地化后缺失字形 | 低 | 中 | Noto Serif CJK SC 覆盖 CJK 完整字符集 |
| 浏览器池化导致内存泄漏 | 低 | 低 | Page 用完即关策略，不复用，内存可被 GC 回收 |
| HTML 模板外挂化后变量注入错误 | 低 | 低 | 单元测试覆盖所有模板变量 + 正则替换容错 |
| 多模板并行开发冲突 | 低 | 低 | 模板按文件隔离，注册表统一管理 |
| 环形缓冲区样本丢失（重启后） | 低 | 低 | 可接受，Prometheus 定期抓取会保留历史数据 |

---

## 九、模块职责速查

| 模块 | 文件 | 职责 |
|------|------|------|
| 入口 | `src/index.ts` | Express 路由注册、中间件编排、请求生命周期管理 |
| 配置 | `src/config.ts` | 环境变量解析、默认值、类型安全 |
| 缓存 | `src/cache/index.ts` | LRU 内存缓存，SHA256 键生成，TTL/容量淘汰 |
| 鉴权 | `src/middleware/auth.ts` | Bearer Token 验证，可选启用 |
| 跨域 | `src/middleware/cors.ts` | CORS 响应头，OPTIONS 预检 |
| 类型 | `src/poster/types.ts` | PosterData、PosterCardInput、TemplateName 类型 |
| 模板引擎 | `src/poster/engine.ts` | 文件加载、正则替换、HTML 转义 |
| 模板编排 | `src/poster/template.ts` | 卡片 HTML 生成、解读提取、模板变量组装 |
| 模板注册 | `src/poster/templates/index.ts` | 模板元数据、查找回退 |
| 模板文件 | `src/poster/templates/*.html, *.css` | 三套海报模板的 HTML/CSS |
| 主题 | `src/poster/theme.ts` | dark/light 主题定义、CSS 变量生成 |
| 渲染 | `src/poster/render.ts` | Puppeteer 浏览器管理、截图、诊断 |
| 池化 | `src/poster/browser-pool.ts` | Page 并发控制、排队等待 |
| 监控 | `src/monitor/metrics.ts` | 指标收集、分位数计算、Prometheus 导出 |

---

## 十、参考资料

- [HyperFrames](https://github.com/heygen-com/hyperframes) — 声明式 HTML 视频渲染框架，核心设计理念参考
- [Puppeteer 文档](https://pptr.dev/) — 无头浏览器 API
- [GSAP](https://gsap.com/) — Web 动画库（Phase 3 动画海报使用）
- [FFmpeg](https://ffmpeg.org/) — 视频编码（Phase 3 动画海报使用）
- [Prometheus 数据模型](https://prometheus.io/docs/concepts/data_model/) — 指标格式规范
- 项目内文档：`README.hf.md`（HF Spaces 部署）、`AGENTS.md`
