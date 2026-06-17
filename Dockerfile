# ========== 构建阶段 ==========
FROM node:20-slim AS builder

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build
COPY assets/ ./assets/

# ========== 运行阶段 ==========
FROM node:20-slim

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 安装 Chromium + 中文字体 + emoji 字体
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-sandbox \
  fonts-noto-cjk \
  fonts-noto-cjk-extra \
  fonts-noto-color-emoji \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

# 默认东八区（部署时可通过 -e TZ=... 覆盖）
ENV TZ=Asia/Shanghai

WORKDIR /app

# 复制 pnpm-lock.yaml + package.json 安装生产依赖
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/package.json ./
RUN pnpm install --prod --frozen-lockfile

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
