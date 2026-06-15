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

## 环境变量

本项目有两组环境变量文件：

| 文件 | 用途 | 加载方式 |
|------|------|---------|
| `.env` | 应用运行时变量 | `cp .env.example .env` 后由 `src/config.ts` 读取 |
| `.env.hf` | HF Spaces 部署变量 | 仅部署脚本读取，不进入容器 |

### 应用运行变量（`.env`）

| 变量 | 用途 | 默认值 | 必填 |
|------|------|--------|:--:|
| `PORT` | 服务监听端口 | `3000` | |
| `NODE_ENV` | 运行环境 | `development` | |
| `API_KEY` | API 鉴权密钥（Bearer Token） | 空（不鉴权） | |
| `CORS_ORIGIN` | 跨域允许来源 | `*` | |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium 可执行文件路径 | 系统自动查找 | |
| `PUPPETEER_ARGS` | Chromium 启动参数（逗号分隔） | `--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage` | |
| `CACHE_MAX_SIZE` | LRU 缓存最大条目数 | `100` | |
| `CACHE_TTL_SECONDS` | 缓存过期时间（秒） | `3600` | |
| `POSTER_WIDTH` | 海报宽度（px） | `750` | |
| `POSTER_HEIGHT` | 海报高度（px） | `1334` | |

### HF Spaces 部署变量（`.env.hf`）

这些变量仅在运行部署脚本时使用，不会进入 Docker 容器：

| 变量 | 用途 | 示例 | 必填 |
|------|------|------|:--:|
| `HF_TOKEN` | HuggingFace Access Token | `hf_xxxxxxxxx` | ✅ |
| `HF_USERNAME` | HF 用户名或组织名 | `myuser` | ✅ |
| `HF_SPACE_NAME` | Space 名称 | `tarot-poster` | ✅ |

### 关键变量详解

#### `API_KEY`

- **不设置**（默认）：`/poster` 端点不做鉴权，任何人均可调用。
- **设置后**：请求必须携带 `Authorization: Bearer <your-key>` 头，否则返回 `401 Unauthorized`。
- **生产环境强烈建议设置**，尤其是 HF Spaces 这类公网可达的部署。

#### `CORS_ORIGIN`

- 默认 `*` 允许所有来源跨域请求。
- 如果前端有固定域名，建议设为具体值（如 `https://your-app.pages.dev`）。
- 注意：HF Spaces 平台的 nginx 反向代理可能覆盖此设置（详见下方疑难排解）。

#### `PUPPETEER_EXECUTABLE_PATH` 与 `PUPPETEER_ARGS`

- **本地开发**：无需设置，Puppeteer 会自动下载 Chromium。
- **Docker 部署**：必须设置 `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`（已在 Dockerfile 中硬编码）。
- **Docker 部署**：必须设置 `--no-sandbox` 参数（已在 Dockerfile 中硬编码），因为容器内通常以 root 运行。

#### `CACHE_MAX_SIZE` 与 `CACHE_TTL_SECONDS`

- 缓存键基于请求内容的 SHA256 哈希（排除 `meaning` 全文，避免文本细微差异导致缓存失效）。
- 高频调用场景可适当增大 `CACHE_MAX_SIZE`。
- `CACHE_TTL_SECONDS` 默认 1 小时，可根据业务需求调整。

### 生产环境 vs 开发环境差异

| 维度 | 开发 (`pnpm run dev`) | Docker 生产 | HF Spaces 生产 |
|------|----------------------|-------------|---------------|
| **NODE_ENV** | `development` | `production` | `production` |
| **PORT** | `3000`（可自定义） | `3000` | **`7860`**（HF 平台固定） |
| **启动方式** | `tsx watch`（热重载） | `node dist/index.js` | `node dist/index.js` |
| **PUPPETEER_EXECUTABLE_PATH** | 不设置（自动下载） | `/usr/bin/chromium` | `/usr/bin/chromium` |
| **PUPPETEER_SKIP_DOWNLOAD** | 不设置 | `true` | `true` |
| **容器入口** | 无 | `CMD ["node", "dist/index.js"]` | `entrypoint.sh` 检查 Chromium → `node dist/index.js` |
| **API_KEY** | 通常留空 | ✅ 建议设置 | ✅ 建议设置 |
| **CORS_ORIGIN** | `*` | 前端域名 | `*` 或前端域名 |
| **中文字体** | 系统自带 | Docker 安装 `fonts-noto-cjk` | Docker 安装 `fonts-noto-cjk` |

> **端口差异说明**：HF Spaces 平台要求应用监听 `7860`，否则流量无法正确路由。`Dockerfile.hf` 中已硬编码 `PORT=7860`。如果误用标准 `Dockerfile` 推到 HF Spaces，服务会因监听 3000 而不可达。

### 配置验证清单

部署后依次执行以下命令验证服务是否正常：

```bash
# 1. 根路径返回服务信息
curl http://localhost:3000/
# 期望：{"service":"tarot-poster-service","version":"1.0.0","status":"running"}

# 2. 健康检查
curl http://localhost:3000/health
# 期望：{"status":"ok","cache":{"size":0,"maxSize":100}}

# 3. 参数校验（空请求应返回 400）
curl -s -X POST http://localhost:3000/poster \
  -H "Content-Type: application/json" \
  -d '{}'
# 期望：HTTP 400 + {"error":"Invalid request: cards array is required"}

# 4. 完整海报生成（返回有效 PNG）
curl -s -X POST http://localhost:3000/poster \
  -H "Content-Type: application/json" \
  -d '{
    "cards": [{"name":"愚者","position":"现状","orientation":"upright","meaning":"新的开始","keywords":["开始"],"type":"major","number":0}],
    "question":"测试",
    "spreadName":"单张",
    "date":"2026-06-15"
  }' -o test-output.png && file test-output.png
# 期望：PNG image data, 750 x 1334, ...

# 5. 缓存命中验证（连续两次相同请求）
curl -sI -X POST http://localhost:3000/poster \
  -H "Content-Type: application/json" \
  -d '{"cards":[{"name":"愚者","position":"现状","orientation":"upright","meaning":"新的开始","keywords":["开始"],"type":"major","number":0}],"question":"cache test","spreadName":"单张","date":"2026-06-15"}' 2>&1 | grep -i x-cache
# 第一次：X-Cache: MISS
# 第二次：X-Cache: HIT

# 6. API Key 鉴权验证（仅当配置了 API_KEY）
# 无 Key → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/poster \
  -H "Content-Type: application/json" \
  -d '{"cards":[{"name":"愚者","position":"现状","orientation":"upright","meaning":"test","keywords":[],"type":"major","number":0}],"question":"test","spreadName":"单张","date":"2026-06-15"}'
# 期望：401

# 错误 Key → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/poster \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-key" \
  -d '{"cards":[{"name":"愚者","position":"现状","orientation":"upright","meaning":"test","keywords":[],"type":"major","number":0}],"question":"test","spreadName":"单张","date":"2026-06-15"}'
# 期望：401

# 正确 Key → 200
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/poster \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-actual-key>" \
  -d '{"cards":[{"name":"愚者","position":"现状","orientation":"upright","meaning":"test","keywords":[],"type":"major","number":0}],"question":"test","spreadName":"单张","date":"2026-06-15"}'
# 期望：200
```

Docker Compose 环境下，将 `localhost:3000` 替换为实际端口即可，并使用 `docker-compose ps` 确认容器状态为 `healthy`。

### HF Spaces 环境变量设置指引

在 HF Spaces 上设置环境变量需要通过网页 UI 操作：

1. 打开你的 Space 页面，例如 `https://huggingface.co/spaces/your-username/tarot-poster-service`
2. 点击顶部 **⚙️ Settings** 标签页
3. 向下滚动到 **Repository secrets and variables** 区域
4. 根据变量类型选择添加方式：

| 按钮 | 用途 | 适用变量 |
|------|------|---------|
| **New secret** | 加密存储（网页不可见） | `API_KEY` 等敏感信息 |
| **New variable** | 明文存储（网页可见） | `CORS_ORIGIN`、`CACHE_MAX_SIZE` 等非敏感配置 |

> **注意**：从应用代码角度看，Secret 和 Variable 无区别——均通过 `process.env.XXX` 读取。Secret 仅在 HF 网页 UI 上隐藏值，任何有 Dockerfile 读写权限的人仍可通过代码读取。

5. 填入 Name（变量名）和 Value（值），点击 **Save**

6. HF Space 会自动触发重启（蓝色进度条），等待重启完成即可生效

**HF Spaces 上需要设置的环境变量**：

| 优先级 | 变量 | 说明 |
|--------|------|------|
| 🔴 强烈建议 | `API_KEY` | 保护 `/poster` 端点不被匿名调用 |
| 🟡 视情况 | `CORS_ORIGIN` | 如前端域名固定则设置，注意平台可能覆盖 |
| 🟢 调优用 | `CACHE_MAX_SIZE` | 高频调用可调大，默认 100 |
| 🟢 调优用 | `CACHE_TTL_SECONDS` | 按需调整，默认 3600 |
| 🟢 调优用 | `POSTER_WIDTH` / `POSTER_HEIGHT` | 默认 750×1334 |

**HF Spaces 上不需要设置的环境变量**：

- `PORT`：平台强制设为 `7860`，`Dockerfile.hf` 已硬编码
- `PUPPETEER_EXECUTABLE_PATH`：`Dockerfile.hf` 已设为 `/usr/bin/chromium`
- `HF_TOKEN` / `HF_USERNAME` / `HF_SPACE_NAME`：这些是部署脚本用的，不进入容器

**故障排查**：

- 如果修改环境变量后未生效：进入 Settings → 点击 **Factory rebuild**（完全重建容器，比重启更彻底）
- 查看启动日志：点击 Space 页面上的 **Logs** 标签页，可看到 `entrypoint.sh` 输出的环境变量确认信息

## 疑难排解

### CORS 跨域问题（HF Space + Cloudflare 反向代理）

**问题现象**：前端请求 Cloudflare Worker 代理的 API 时，浏览器报 CORS 错误。响应头 `Access-Control-Allow-Origin` 返回的是 HF Space 域名（如 `https://<user>-<space>.hf.space`），而非前端域名或 `*`。

**根因**：部署架构为 `前端 → Cloudflare Worker → HF Space → Express`。即使 Express 应用层设置了 `Access-Control-Allow-Origin: *`，HF Space 平台的 nginx 反向代理层会自动注入 CORS 响应头覆盖应用层设置，且值固定为 HF Space 自身的域名。

#### 方案一：Cloudflare Worker 中间层拦截

在 Cloudflare Worker 中拦截并覆盖 HF Space 返回的 CORS 响应头：

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

#### 方案二：设置 `CORS_ORIGIN` 环境变量（无需 Cloudflare 中间层）

如果没有 CDN / Worker 代理层，最直接的方法是在 HF Space 中设置 `CORS_ORIGIN` 环境变量：

1. 进入你的 HF Space 页面，点击 **Settings**
2. 找到 **Repository secrets and variables** 区域
3. 新增一个 **Variable**：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `CORS_ORIGIN` | `*` 或前端域名 | 允许跨域请求的来源 |

设置后 HF Space 会自动重启容器。应用会读取该变量并设置 `Access-Control-Allow-Origin` 响应头。

> **注意**：如果 HF Space 平台的 nginx 反向代理层仍覆盖了 CORS 响应头（以 Space 自身域名为准），此方法无效，需要回到下方自建反向代理或 Cloudflare Worker 方案。

#### 方案三：自建 Nginx / Caddy 反向代理（有 VPS 时）

**Nginx 示例配置：**

```nginx
server {
    listen 80;
    server_name your-proxy.example.com;

    location / {
        proxy_pass https://<user>-<space>.hf.space;
        proxy_set_header Host <user>-<space>.hf.space;

        # 覆盖 HF Space 返回的 CORS 头
        proxy_hide_header Access-Control-Allow-Origin;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}
```

**Caddy 示例配置（更简洁）：**

```caddy
your-proxy.example.com {
    reverse_proxy https://<user>-<space>.hf.space {
        header_down -Access-Control-Allow-Origin
        header_down Access-Control-Allow-Origin "*"
        header_down Access-Control-Allow-Methods "GET, POST, OPTIONS"
        header_down Access-Control-Allow-Headers "Content-Type, Authorization"
    }
}
```

#### 方案四：Vercel / Netlify Serverless 函数代理

在 Vercel 或 Netlify 上部署轻量代理函数：

```javascript
// Vercel: api/proxy.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const target = `https://<user>-<space>.hf.space${req.url}`;
  const response = await fetch(target, {
    method: req.method,
    headers: { "Content-Type": "application/json" },
    body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
  });

  const data = await response.arrayBuffer();
  res.setHeader("Content-Type", response.headers.get("Content-Type") || "image/png");
  res.send(Buffer.from(data));
}
```

#### 方案五：后端 BFF 模式

在自有后端增加代理接口，由服务端转发请求（服务端间通信不受浏览器 CORS 限制）：

```typescript
// Express BFF 示例
app.post("/api/poster", async (req, res) => {
  const response = await fetch("https://<user>-<space>.hf.space/poster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  res.set("Content-Type", response.headers.get("Content-Type") || "image/png");
  response.body.pipe(res);
});
```

> **总结**：核心思路是让一个可完全控制的中间层来覆盖 HF Space nginx 注入的 CORS 头。无论是 Cloudflare Worker、`CORS_ORIGIN` 环境变量、自建 Nginx，还是 Serverless 函数，本质都是在返回给浏览器之前，将 `Access-Control-Allow-Origin` 重新设置为 `*` 或前端域名。
