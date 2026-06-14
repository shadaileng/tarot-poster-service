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

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000`（HF Spaces: `7860`） |
| `NODE_ENV` | 运行环境 | `development` |
| `API_KEY` | API 鉴权密钥 | 空（不鉴权） |
| `CORS_ORIGIN` | CORS 允许来源 | `*` |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium 路径 | 系统自动查找 |
| `PUPPETEER_ARGS` | Chromium 启动参数 | `--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage` |
| `CACHE_MAX_SIZE` | 缓存最大条目数 | `100` |
| `CACHE_TTL_SECONDS` | 缓存 TTL（秒） | `3600` |
| `POSTER_WIDTH` | 海报宽度（px） | `750` |
| `POSTER_HEIGHT` | 海报高度（px） | `1334` |

## 部署配置（.env.hf）

| 变量 | 用途 | 示例 |
|------|------|------|
| `HF_TOKEN` | HuggingFace Access Token | `hf_xxxxxxxxx` |
| `HF_USERNAME` | HF 用户名或组织名 | `myuser` |
| `HF_SPACE_NAME` | Space 名称 | `tarot-poster` |

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
- **ESM 导入必须带 `.js` 扩展名**（如 `import { config } from './config.js'`），符合 Node.js ESM 规范
- 缓存键基于 SHA256 哈希（只对关键字段哈希，不包含 `meaning` 全文）
- Puppeteer 浏览器实例通过连接池复用（`getBrowser()` 单例），监听 `SIGTERM/SIGINT` 优雅关闭
- HTML 模板内联 CSS，不依赖外部样式文件
