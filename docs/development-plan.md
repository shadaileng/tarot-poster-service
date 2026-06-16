# 🃏 塔罗海报生成服务 — 开发规划书

> 版本: v1.2 | 日期: 2026-06-16 | 状态: Phase 1 已完成，Phase 2-4 规划中

---

## 一、项目现状

### 1.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js 20 + TypeScript 5.4 | ESNext 模块，`bundler` 模块解析 |
| 框架 | Express 4.21 | 轻量 HTTP 服务 |
| 渲染引擎 | Puppeteer 23.6 | 无头 Chrome 截图 |
| 包管理 | pnpm 9.15 | 锁定依赖 |
| 测试 | Vitest 2.1 | 单元 + 集成测试 |
| 部署 | Docker + docker-compose | 容器化运行 |

### 1.2 当前架构

```
POST /poster  ──→  authMiddleware
                      │
                      ▼
              buildPosterHTML(data)
                      │  ES6 模板字符串拼接 HTML
                      ▼
              renderPoster(html)
                      │  Puppeteer 单例 Browser
                      │  page.setContent → waitForSelector → screenshot
                      ▼
              LRUCache (SHA256 key, TTL 1h)
                      │
                      ▼
              Response: image/png
```

### 1.3 已实现功能

- ✅ 基础海报生成 API（`POST /poster`）
- ✅ 暗黑神秘风格 HTML 模板（750×1334，2x DPR）
- ✅ 牌阵渲染（正位/逆位 180° 旋转、位置标签、关键词）
- ✅ AI 综合解读区域
- ✅ LRU 内存缓存（SHA256 去重，TTL 可配）
- ✅ API Key 鉴权中间件
- ✅ CORS 中间件
- ✅ Docker 容器化部署（含 Chromium + Noto 中文字体）
- ✅ 本地卡牌 SVG 静态资源服务
- ✅ 基础单元测试（模板生成、缓存、XSS 防护）

### 1.4 已知问题

| 问题 | 严重程度 | 状态 | 表现 |
|------|:--:|:--:|------|
| 资源就绪检查不充分 | 🔴 高 | ✅ 已修复 (1.1) | `networkidle0` 可能提前触发，导致截图时图片未加载完成 |
| Google Fonts 加载延迟 | 🔴 高 | ✅ 已修复 (1.2) | Noto Serif SC 在线字体可能未就绪即截图，出现缺字 |
| 浏览器单例无重连机制 | 🟡 中 | ✅ 已修复 (1.3) | 浏览器崩溃后所有后续请求失败 |
| 无错误诊断抓取 | 🟡 中 | ✅ 已修复 (1.4) | 渲染失败时缺少页面状态快照，难以排查 |
| HTML 模板耦合在 TS 中 | 🟡 中 | 待处理 (2.1) | 300+ 行模板字符串，CSS 无语法高亮，难以维护 |
| 无并发渲染能力 | 🟢 低 | 待处理 (2.3) | 单 Page 串行，高并发时响应慢 |
| 设计令牌硬编码 | 🟢 低 | 待处理 (2.2) | 颜色/字号/间距写死在模板字符串中，无法切换主题 |
| 缺乏性能监控 | 🟢 低 | 待处理 (3.2) | 无渲染耗时、缓存命中率等指标 |

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

### Phase 1: 稳定性修复（优先级 🔴 高）

**目标**：消除生产环境偶发白图/缺字问题，提升基础可靠性。

#### 任务 1.1 — 增强资源就绪检查

**文件**：`src/poster/render.ts`

**改动**：在 `waitForSelector('.poster-ready')` 之前增加防御性等待：

```
① 等待所有 <img> complete 且 naturalWidth > 0
② 执行 img.decode() 强制 GPU 纹理上传
③ 等待 document.fonts.ready（替代对 Google Fonts 的依赖）
④ 额外 setTimeout(100ms) 让浏览器完成合成管线
⑤ 最终等待 .poster-ready 选择器
```

**预期收益**：消除 90% 以上的"白图/缺字"偶发问题。

#### 任务 1.2 — 字体本地化

**文件**：`src/poster/template.ts`、`Dockerfile`

**改动**：
- 从 Google Fonts CDN 改为本地字体文件
- Dockerfile 中已有 `fonts-noto-cjk`，在模板中改为 `@font-face` 引用本地路径
- 字体文件名：`/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc` 等

**预期收益**：消除网络依赖，字体加载时间从 2-5s 降至 <100ms。

#### 任务 1.3 — 浏览器重连机制

**文件**：`src/poster/render.ts`

**改动**：
- `getBrowser()` 增加 `browser.isConnected()` 检查
- 浏览器断连时自动重新 `puppeteer.launch()`
- 增加 `page.close()` 的 try/catch（避免孤儿 Page 累积）
- 增加浏览器实例健康检查（定期 ping）

**预期收益**：浏览器崩溃后自动恢复，无需手动重启服务。

#### 任务 1.4 — 错误诊断抓取

**文件**：`src/poster/render.ts`

**改动**：
- 在 `renderPoster()` 的 catch 块中：
  - 捕获 `page.content()` 作为诊断 HTML
  - 尝试 `page.screenshot()` 获取失败时页面快照
  - 收集 `page.on('console')` 和 `page.on('pageerror')` 日志
- 将诊断信息写入结构化日志

**预期收益**：渲染失败时可快速定位根因（CSS 错误、JS 异常、图片 404 等）。

---

### Phase 2: 架构优化（优先级 🟡 中）

**目标**：提升代码可维护性和开发体验，为后续扩展打基础。

#### 任务 2.1 — HTML 模板外挂化

**文件**：`src/poster/template.ts` → `src/poster/templates/default.html` + `src/poster/template.ts`（重构）

**改动**：
- 将 HTML + CSS 从 TypeScript 模板字符串提取为独立 `.html` 文件
- 使用轻量模板语法（如 `{{ variable }}` 占位符）
- `template.ts` 改为模板加载 + 变量注入引擎
- 开发模式下支持模板文件热加载（`fs.watch`）
- CSS 独立为 `.css` 文件，获得 IDE 语法高亮支持

**目录结构**：
```
src/poster/
  ├── templates/
  │   ├── default.html       # 默认暗黑模板
  │   ├── default.css        # 默认样式
  │   └── minimal.html       # （未来）简洁版模板
  ├── engine.ts              # 模板加载 + 变量注入
  ├── render.ts              # Puppeteer 渲染（不变）
  ├── types.ts               # 类型定义（不变）
  └── theme.ts               # （新增）设计令牌
```

**预期收益**：
- 新增模板无需修改 TypeScript 代码
- HTML/CSS 可在浏览器中直接预览
- AI Agent 可直接生成/修改 HTML 模板

#### 任务 2.2 — 设计令牌系统（Design Tokens）

**文件**：`src/poster/theme.ts`（新建）

**改动**：
- 定义主题对象类型 `PosterTheme`
- 内置 `dark`（默认）、`light` 两种预设主题
- 通过 CSS 变量注入模板：`--color-bg`、`--color-text`、`--color-accent` 等
- API 可选参数 `theme: 'dark' | 'light'`

**主题结构**：
```typescript
interface PosterTheme {
  id: string
  colors: {
    bg: string
    bgGradient: string
    text: string
    textSecondary: string
    accent: string
    accentGlow: string
    cardBg: string
    cardBorder: string
    sectionBg: string
    sectionBorder: string
  }
  typography: {
    fontFamily: string
    titleSize: number
    titleWeight: number
    bodySize: number
    bodyLineHeight: number
  }
  spacing: {
    pagePadding: number
    cardGap: number
    sectionGap: number
  }
  radius: {
    card: number
    section: number
  }
}
```

**预期收益**：主题切换零代码成本，支持用户自定义品牌色。

#### 任务 2.3 — 浏览器 Page 池化

**文件**：`src/poster/render.ts` → `src/poster/browser-pool.ts`（新建）

**改动**：
- 创建 `BrowserPool` 类，管理 1-N 个 Puppeteer Page 实例
- 请求获取 Page → 渲染 → 归还 Page（清理 cookies、localStorage）
- 支持配置最大并发数（`POOL_MAX_PAGES` 环境变量，默认 4）
- 优雅降级：池满时排队等待

**预期收益**：并发渲染能力提升 N 倍，单 Page 创建/销毁开销消除。

---

### Phase 3: 功能扩展（优先级 🟢 低）

**目标**：增加新功能，提升用户体验和业务价值。

#### 任务 3.1 — 多模板支持

**文件**：`src/poster/templates/` 目录扩展

**改动**：
- API 增加 `template` 参数：`POST /poster { ..., template: 'default' | 'minimal' | 'wechat' }`
- `minimal`：简约白底模板，适合打印
- `wechat`：适配微信朋友圈 9:16 比例（1080×1920）
- 模板注册表：`src/poster/templates/index.ts` 自动扫描目录

#### 任务 3.2 — 性能监控仪表板

**文件**：`src/monitor/` 目录（新建）

**改动**：
- 记录每次渲染的耗时（模板生成、资源等待、截图、总耗时）
- 记录缓存命中率
- 暴露 `GET /metrics` 端点（Prometheus 格式）
- 健康检查增加渲染延迟 P50/P95/P99

#### 任务 3.3 — 动画海报（长期方向）

**文件**：`src/poster/animation.ts`（新建）

**改动**：
- 在模板中集成 GSAP 入场动画
- 通过 `window.__hf.seek()` 协议支持逐帧截取
- 使用 FFmpeg 将帧序列编码为短视频
- API 增加 `POST /poster/video` 端点
- 支持生成 3-5 秒的分享动画

**借鉴**：HyperFrames 的 `data-*` 声明式轨道 + 帧适配器模式。

---

### Phase 4: 工程化增强

**目标**：提升代码质量和运维效率。

#### 任务 4.1 — 测试覆盖率提升

- Puppeteer 渲染集成测试（Mock Page 或真实 Chromium）
- API 端到端测试（supertest）
- 缓存淘汰边界测试
- 并发压力测试（autocannon）

#### 任务 4.2 — CI/CD 流水线

- GitHub Actions：lint → test → build → docker build
- 自动构建并推送 Docker 镜像
- 合并到 main 分支自动部署

#### 任务 4.3 — 日志标准化

- 引入结构化日志（pino 或 winston）
- 统一日志格式：`{ level, timestamp, module, message, ...context }`
- 区分 `console.log` 调试日志和生产日志

---

## 四、API 演进计划

### 当前 API

```
POST /poster
Body: PosterData
Response: image/png
```

### 未来 API

```
# Phase 2: 增加主题参数
POST /poster
Body: { ...PosterData, theme?: 'dark' | 'light' }

# Phase 3: 增加模板参数
POST /poster
Body: { ...PosterData, template?: 'default' | 'minimal' | 'wechat' }

# Phase 3: 性能监控
GET /metrics
Response: text/plain (Prometheus)

# Phase 3: 动画海报
POST /poster/video
Body: { ...PosterData, duration?: number, fps?: number }
Response: video/mp4
```

---

## 五、环境变量规划

| 变量 | 当前 | 规划 | 说明 |
|------|:--:|:--:|------|
| `PORT` | ✅ | ✅ | 服务端口 |
| `NODE_ENV` | ✅ | ✅ | 运行环境 |
| `API_KEY` | ✅ | ✅ | API 鉴权密钥 |
| `CORS_ORIGIN` | ✅ | ✅ | 跨域白名单 |
| `PUPPETEER_EXECUTABLE_PATH` | ✅ | ✅ | Chrome 路径 |
| `PUPPETEER_ARGS` | ✅ | ✅ | Chrome 启动参数 |
| `CACHE_MAX_SIZE` | ✅ | ✅ | 缓存最大条目 |
| `CACHE_TTL_SECONDS` | ✅ | ✅ | 缓存过期时间 |
| `POSTER_WIDTH` | ✅ | ✅ | 海报宽度 |
| `POSTER_HEIGHT` | ✅ | ✅ | 海报高度 |
| `POOL_MAX_PAGES` | — | 🆕 | 浏览器 Page 池大小 |
| `LOG_LEVEL` | — | 🆕 | 日志级别 (debug/info/warn/error) |
| `FONT_PATH` | — | 🆕 | 自定义字体目录 |

---

## 六、项目目录结构（目标）

```
tarot-poster-service/
├── src/
│   ├── index.ts                  # Express 入口
│   ├── config.ts                 # 环境变量管理
│   ├── cache/
│   │   └── index.ts              # LRU 缓存
│   ├── middleware/
│   │   ├── auth.ts               # API 鉴权
│   │   └── cors.ts               # CORS
│   ├── poster/
│   │   ├── types.ts              # 类型定义
│   │   ├── engine.ts             # 模板加载 + 变量注入
│   │   ├── render.ts             # Puppeteer 渲染
│   │   ├── browser-pool.ts       # 🆕 浏览器 Page 池
│   │   ├── theme.ts              # 🆕 设计令牌
│   │   └── templates/
│   │       ├── index.ts          # 🆕 模板注册表
│   │       ├── default.html      # 🆕 默认模板
│   │       ├── default.css       # 🆕 默认样式
│   │       └── minimal.html      # 🆕 未来模板
│   ├── monitor/
│   │   └── metrics.ts            # 🆕 性能指标
│   └── logger.ts                 # 🆕 结构化日志
├── test/
│   ├── poster.test.ts            # 模板 + 缓存测试
│   ├── api.test.ts               # 🆕 API 端到端测试
│   └── render.test.ts            # 🆕 渲染集成测试
├── assets/
│   ├── cards/                    # 卡牌 SVG
│   └── fonts/                    # 本地字体
├── docs/
│   ├── development-plan.md       # 本文档
│   └── hf-space-deploy.md        # HF Spaces 部署指南
├── scripts/
├── Dockerfile
├── Dockerfile.hf
├── docker-compose.yml
├── Makefile
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

---

## 七、里程碑时间线

```
Week 1-2  ████████  Phase 1: 稳定性修复 ✅ 已完成
          ├── 1.1 增强资源就绪检查 ✅
          ├── 1.2 字体本地化 ✅
          ├── 1.3 浏览器重连机制 ✅
          └── 1.4 错误诊断抓取 ✅

Week 3-4  ████████  Phase 2: 架构优化 🔜 待启动
          ├── 2.1 HTML 模板外挂化
          ├── 2.2 设计令牌系统
          └── 2.3 浏览器 Page 池化

Week 5-6  ████████  Phase 3: 功能扩展
          ├── 3.1 多模板支持
          └── 3.2 性能监控仪表板

Week 7+   ████████  Phase 4: 工程化增强 + 动画海报
          ├── 4.1 测试覆盖率提升
          ├── 4.2 CI/CD 流水线
          ├── 4.3 日志标准化
          └── 3.3 动画海报（调研 + POC）
```

---

## 八、风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|:--:|:--:|------|
| Puppeteer 版本升级导致截图差异 | 低 | 中 | 锁定版本，视觉回归测试 |
| 字体本地化后缺失字形 | 低 | 中 | 保留 Google Fonts 作为 fallback |
| 浏览器池化导致内存泄漏 | 中 | 中 | 设置 Page 最大复用次数，超限后自动回收 |
| HTML 模板外挂化后变量注入错误 | 低 | 低 | 单元测试覆盖所有模板变量 |
| 多模板并行开发冲突 | 低 | 低 | 模板按文件隔离，注册表统一管理 |

---

## 九、参考资料

- [HyperFrames](https://github.com/heygen-com/hyperframes) — 声明式 HTML 视频渲染框架，核心设计理念参考
- [Puppeteer 文档](https://pptr.dev/) — 无头浏览器 API
- [GSAP](https://gsap.com/) — Web 动画库（Phase 3 动画海报使用）
- [FFmpeg](https://ffmpeg.org/) — 视频编码（Phase 3 动画海报使用）
- 项目内文档：`README.hf.md`（HF Spaces 部署）、`AGENTS.md`
