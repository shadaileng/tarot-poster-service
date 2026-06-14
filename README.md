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
