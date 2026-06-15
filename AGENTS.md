# AGENTS.md — AI 协作指南

> 本文档帮助 AI 编程助手快速理解 `tarot-poster-service` 项目。
> 修改代码前请先阅读本文档。

## 项目概述

塔罗牌海报生成微服务，基于 **Node.js + Express + TypeScript + Puppeteer**，使用 **pnpm** 管理依赖。
接收 `POST /poster` 请求（牌面数据），拼装 HTML 页面后通过 Puppeteer 截图返回 PNG 图片。

```
tarot-poster-service/
├── src/
│   ├── index.ts              # Express 服务入口（GET /、GET /health、POST /poster）
│   ├── config.ts             # 统一环境变量管理
│   ├── poster/
│   │   ├── types.ts          # 海报数据类型定义
│   │   ├── template.ts       # 海报 HTML 模板（暗黑神秘风格 CSS）
│   │   └── render.ts         # Puppeteer 截图 + 浏览器连接池
│   ├── cache/
│   │   └── index.ts          # LRU 内存缓存（SHA256 键 + 可配置 TTL）
│   └── middleware/
│       ├── cors.ts           # CORS 中间件
│       └── auth.ts           # API Key 鉴权中间件（未配置则跳过）
├── assets/fonts/             # 中文字体文件
├── scripts/
│   ├── entrypoint.sh         # 容器启动脚本
│   ├── deploy-hf.sh          # HF 部署脚本（Linux/macOS）
│   ├── deploy-hf.ps1         # HF 部署脚本（Windows PowerShell）
│   └── deploy-hf.bat         # HF 部署脚本（Windows 批处理）
├── test/
│   └── poster.test.ts        # 海报生成测试
├── Dockerfile                # 标准多阶段构建
├── Dockerfile.hf             # HuggingFace Spaces 专用
├── docker-compose.yml        # Docker Compose 编排
├── Makefile                  # 常用命令快捷方式
├── package.json              # 项目配置（packageManager: pnpm）
├── pnpm-lock.yaml            # pnpm 锁定文件
└── tsconfig.json             # TypeScript 配置
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js 20 |
| 框架 | Express |
| 语言 | TypeScript（strict: true） |
| 截图 | Puppeteer（Chromium headless） |
| 缓存 | LRU 内存缓存（自实现） |
| 鉴权 | API Key（Bearer Token，可选） |
| 包管理 | pnpm |
| 部署 | 本地 / Docker / HuggingFace Spaces |

## 核心流程

```
POST /poster  { cards, question, spreadName, interpretation, date }
  │
  ├─ 鉴权（middleware/auth.ts）—— 未配置 API_KEY 则跳过
  ├─ 参数校验 —— cards 数组不能为空
  ├─ 缓存查询（cache/index.ts）—— SHA256 哈希键，命中直接返回
  ├─ HTML 模板生成（poster/template.ts）—— 拼装暗黑风格 HTML+CSS
  ├─ Puppeteer 截图（poster/render.ts）—— 浏览器连接池复用，2x 高清截图
  └─ 返回 PNG Buffer → 写入缓存
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务信息（HF Spaces 兼容） |
| GET | `/health` | 健康检查 + 缓存状态 |
| POST | `/poster` | 生成海报图片（返回 PNG） |

## 环境变量

> 详细说明见 [README.md](./README.md#环境变量)。

### 应用运行变量（`.env` / `process.env`）

| 变量 | 用途 | 默认值 | 必填 | 分组 |
|------|------|--------|:--:|:--:|
| `PORT` | 服务端口 | `3000`（HF Spaces: `7860`） | | 服务 |
| `NODE_ENV` | 运行环境 | `development` | | 服务 |
| `API_KEY` | API 鉴权密钥（Bearer Token） | 空（不鉴权） | | 安全 |
| `CORS_ORIGIN` | CORS 允许来源 | `*` | | 安全 |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium 路径 | 系统自动查找 | | 截图 |
| `PUPPETEER_ARGS` | Chromium 启动参数（逗号分隔） | `--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage` | | 截图 |
| `CACHE_MAX_SIZE` | 缓存最大条目数 | `100` | | 性能 |
| `CACHE_TTL_SECONDS` | 缓存 TTL（秒） | `3600` | | 性能 |
| `POSTER_WIDTH` | 海报宽度（px） | `750` | | 海报 |
| `POSTER_HEIGHT` | 海报高度（px） | `1334` | | 海报 |

### HF 部署变量（`.env.hf`，仅部署脚本使用）

| 变量 | 用途 | 示例 | 必填 |
|------|------|------|:--:|
| `HF_TOKEN` | HuggingFace Access Token | `hf_xxxxxxxxx` | ✅ |
| `HF_USERNAME` | HF 用户名或组织名 | `myuser` | ✅ |
| `HF_SPACE_NAME` | Space 名称 | `tarot-poster` | ✅ |

### 生产/开发关键差异

| 维度 | 开发 | Docker 生产 | HF Spaces 生产 |
|------|------|-------------|---------------|
| `NODE_ENV` | `development` | `production` | `production` |
| `PORT` | `3000` | `3000` | **`7860`**（强制） |
| `PUPPETEER_EXECUTABLE_PATH` | 不设置 | `/usr/bin/chromium` | `/usr/bin/chromium` |
| `PUPPETEER_SKIP_DOWNLOAD` | 不设置 | `true` | `true` |
| `API_KEY` | 通常留空 | ✅ 建议设置 | ✅ 建议设置 |

### 注意事项

- 新增环境变量时，必须在 `src/config.ts` 中添加读取逻辑，并同步更新 `.env.example`、`README.md` 和本文件的环境变量表格
- `API_KEY` 不配置时鉴权中间件完全跳过，`/poster` 无保护
- HF Spaces 上 `PORT` 会被平台覆盖为 `7860`，不要在 HF Space 的 Variables 中手动设置 `PORT`
- Docker 部署必须设置 `--no-sandbox` 参数，否则 Chromium 无法在容器中启动

## 部署方式

| 方式 | 命令 | 说明 |
|------|------|------|
| 本地开发 | `pnpm install && pnpm run dev` | `http://localhost:3000` |
| Docker | `docker build -t tarot-poster . && docker run -p 3000:3000 tarot-poster` | 多阶段构建 |
| Docker Compose | `docker-compose up -d` | 一键编排 |
| HF Spaces | `bash scripts/deploy-hf.sh` 或 `.\scripts\deploy-hf.ps1` | 自动化部署 |

## 编码规范

- TypeScript strict 模式
- 所有环境变量通过 `src/config.ts` 统一访问，不直接读取 `process.env`
- 缓存键基于 SHA256 哈希（只对关键字段哈希，不包含 `meaning` 全文）
- Puppeteer 浏览器实例通过连接池复用（`getBrowser()` 单例），监听 `SIGTERM/SIGINT` 优雅关闭
- HTML 模板内联 CSS，不依赖外部样式文件
