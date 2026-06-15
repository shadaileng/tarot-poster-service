# tarot-poster-service

塔罗牌海报生成微服务 — HTML/CSS + Puppeteer 后台截图

## 快速开始

### 本地开发

```bash
# 安装依赖
pnpm install

# 复制环境变量
cp .env.example .env

# 启动开发服务器
pnpm run dev
```

服务默认监听 `http://localhost:3000`。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET /` | 根路径 | 服务信息（HF Spaces 兼容） |
| `GET /health` | 健康检查 | 服务状态 + 缓存信息 |
| `POST /poster` | 海报生成 | 接收 PosterData，返回 PNG 图片 |

### 海报生成请求示例

```bash
curl -X POST http://localhost:3000/poster \
  -H "Content-Type: application/json" \
  -d '{
    "cards": [
      {
        "name": "愚者",
        "image": "https://example.com/cards/fool.png",
        "position": "现状",
        "orientation": "upright",
        "meaning": "新的开始",
        "keywords": ["开始", "冒险"],
        "type": "major",
        "number": 0
      }
    ],
    "question": "我的未来会怎样？",
    "spreadName": "单张牌阵",
    "date": "2026-06-12"
  }'
```

## 部署方式

### Docker

```bash
docker build -t tarot-poster-service .
docker run -d -p 3000:3000 tarot-poster-service
```

### Docker Compose

```bash
docker-compose up -d
```

### HuggingFace Spaces

详见 [HuggingFace Spaces 部署文档](docs/hf-space-deploy.md)

**快速开始**：

```bash
# Linux/macOS
cp .env.hf.example .env.hf  # 编辑填入配置
bash scripts/deploy-hf.sh

# Windows (PowerShell)
Copy-Item .env.hf.example .env.hf
notepad .env.hf
.\scripts\deploy-hf.ps1

# Windows (批处理)
# 编辑 scripts\deploy-hf.bat 修改变量后双击运行
```

## 技术栈

- **运行时**: Node.js 20 + TypeScript
- **Web 框架**: Express
- **截图**: Puppeteer（无头 Chromium）
- **缓存**: LRU 内存缓存
- **部署**: Docker / HuggingFace Spaces

## 疑难排解

### CORS 跨域问题（HF Space + Cloudflare 反向代理）

**问题现象**：前端请求 Cloudflare Worker 代理的 API 时，浏览器报 CORS 错误。响应头 `Access-Control-Allow-Origin` 返回的是 HF Space 域名（如 `https://<user>-<space>.hf.space`），而非前端域名或 `*`。

**根因**：部署架构为 `前端 → Cloudflare Worker → HF Space → Express`。即使 Express 应用层设置了 `Access-Control-Allow-Origin: *`，HF Space 平台的 nginx 反向代理层会自动注入 CORS 响应头覆盖应用层设置，且值固定为 HF Space 自身的域名。

**解决方案**：在 Cloudflare Worker 中拦截并覆盖 HF Space 返回的 CORS 响应头：

```javascript
// Cloudflare Worker 中处理响应
const response = await fetch(targetUrl, { /* ... */ });

// 覆盖 HF Space 平台注入的 CORS 头
const corsHeaders = new Headers(response.headers);
corsHeaders.set("Access-Control-Allow-Origin", "*");
corsHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
corsHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
corsHeaders.set("Access-Control-Max-Age", "86400");

return new Response(response.body, {
  status: response.status,
  statusText: response.statusText,
  headers: corsHeaders,
});
```

关键点：不能原样透传 HF Space 的响应头，必须在 Worker 层重新设置 CORS 头为 `*` 或具体的前端域名。
