# HuggingFace Spaces 部署方案

## 概述

本项目通过 HuggingFace Spaces 部署 Docker 服务。HF Space 本质是一个 Git 仓库，推送 `Dockerfile` 后 HF 会自动构建镜像并运行。

项目已有 `Dockerfile.hf` 作为 HF 环境的 Docker 镜像定义，部署时将其复制为根目录 `Dockerfile`，连同源代码一起推送到 HF Space 仓库。

## 架构流程

```mermaid
flowchart TD
    A[开始] --> B{检查 HF_TOKEN 环境变量}
    B -->|未设置| C["❌ 报错退出"]
    B -->|已设置| D{检查 HF_USERNAME / HF_SPACE_NAME}
    D -->|未设置| E["❌ 报错退出"]
    D -->|已设置| F["构建 HF Space Git URL<br/>https://{user}:{token}@huggingface.co/spaces/{user}/{space}"]
    F --> G["复制 Dockerfile.hf → Dockerfile"]
    G --> H["创建临时目录 / 初始化 git"]
    H --> I["复制项目文件到临时目录"]
    I --> J["git add + commit"]
    J --> K["git push --force 到 HF Space"]
    K --> L{推送成功?}
    L -->|成功| M["✅ 清理 + 输出 Space URL"]
    L -->|失败| N["❌ 报错"]
```

## 环境变量

| 变量 | 说明 | 示例 | 必需 |
|------|------|------|------|
| `HF_TOKEN` | HuggingFace Access Token | `hf_xxxxxxxxxxxxxxxxx` | ✅ |
| `HF_USERNAME` | HF 用户名或组织名 | `myuser` | ✅ |
| `HF_SPACE_NAME` | Space 名称 | `tarot-poster` | ✅ |

## 推送文件清单

只推送构建 Docker 镜像所需的最小文件集：

- `src/` — TypeScript 源代码
- `assets/` — 静态资源（SVG 素材）
- `scripts/` — 入口脚本（entrypoint.sh）
- `package.json` — 依赖声明
- `pnpm-lock.yaml` — 依赖锁定
- `tsconfig.json` — TypeScript 配置
- `Dockerfile` — 由 `Dockerfile.hf` 复制生成
- `.dockerignore` — Docker 构建忽略规则

以下文件不会被推送：
- `node_modules/` — HF 构建时会重新安装
- `dist/` — HF 构建时会重新编译
- `.env` / `.env.local` — 敏感信息
- `docker-compose.yml` / `Makefile` — 本地开发工具
- `test/` / `coverage/` — 测试文件
- `.git/` — 避免嵌套 Git 仓库

## 文件变更计划

### 1. 新建 `scripts/deploy-hf.sh`

部署脚本主逻辑，负责校验环境变量、准备文件、初始化 Git 并推送到 HF Space。

```bash
#!/usr/bin/env bash
# ============================================================
# HuggingFace Spaces 部署脚本
# 使用 HF_TOKEN 认证，将项目推送到 HF Space Git 仓库
#
# 环境变量:
#   HF_TOKEN       - HuggingFace Access Token（必需）
#   HF_USERNAME    - HF 用户名或组织名（必需）
#   HF_SPACE_NAME  - Space 名称（必需）
#
# 用法:
#   export HF_TOKEN=hf_xxxx
#   export HF_USERNAME=myuser
#   export HF_SPACE_NAME=tarot-poster
#   bash scripts/deploy-hf.sh
#
# 或通过 Makefile:
#   HF_TOKEN=hf_xxxx HF_USERNAME=myuser HF_SPACE_NAME=tarot-poster make deploy-hf
# ============================================================

set -euo pipefail

# ---------- 颜色输出 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------- 参数校验 ----------
fail() {
  log_error "$1"
  exit 1
}

HF_TOKEN="${HF_TOKEN:-}"
HF_USERNAME="${HF_USERNAME:-}"
HF_SPACE_NAME="${HF_SPACE_NAME:-}"

[ -n "$HF_TOKEN" ]    || fail "HF_TOKEN 环境变量未设置"
[ -n "$HF_USERNAME" ] || fail "HF_USERNAME 环境变量未设置（HF 用户名或组织名）"
[ -n "$HF_SPACE_NAME" ] || fail "HF_SPACE_NAME 环境变量未设置（Space 名称）"

# ---------- 路径 ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

log_info "项目目录: $PROJECT_DIR"
log_info "临时目录: $TMP_DIR"

# ---------- 1. 准备 Dockerfile ----------
log_info "复制 Dockerfile.hf → Dockerfile"
cp "$PROJECT_DIR/Dockerfile.hf" "$PROJECT_DIR/Dockerfile"

# ---------- 待推送文件列表 ----------
FILES_TO_COPY=(
  "src"
  "assets"
  "scripts"
  "package.json"
  "pnpm-lock.yaml"
  "tsconfig.json"
  "Dockerfile"
  ".dockerignore"
)

# 如果 .dockerignore 不存在则生成一个默认的
DOCKERIGNORE_SRC=""
if [ -f "$PROJECT_DIR/.dockerignore" ]; then
  DOCKERIGNORE_SRC="$PROJECT_DIR/.dockerignore"
else
  DOCKERIGNORE_SRC="$TMP_DIR/.dockerignore.generated"
  cat > "$DOCKERIGNORE_SRC" <<'EOF'
node_modules/
dist/
.git/
.env
.env.*
*.log
*.md
.vscode/
.idea/
coverage/
test/
EOF
  FILES_TO_COPY+=(".dockerignore")
fi

# ---------- 2. 复制文件到临时目录 ----------
log_info "复制项目文件到临时目录..."

for item in "${FILES_TO_COPY[@]}"; do
  src="$PROJECT_DIR/$item"
  if [ "$item" = ".dockerignore" ] && [ ! -f "$PROJECT_DIR/.dockerignore" ]; then
    src="$DOCKERIGNORE_SRC"
  fi
  if [ -e "$src" ]; then
    cp -a "$src" "$TMP_DIR/"
    log_info "  ✓ $item"
  else
    log_warn "  ✗ $item (不存在，跳过)"
  fi
done

# ---------- 3. 初始化 Git 并推送 ----------
SPACE_REMOTE="https://${HF_USERNAME}:${HF_TOKEN}@huggingface.co/spaces/${HF_USERNAME}/${HF_SPACE_NAME}"

cd "$TMP_DIR"

git init -q
git config user.name  "$HF_USERNAME"
git config user.email "${HF_USERNAME}@users.huggingface.co"
git remote add origin "$SPACE_REMOTE"

git add -A
git commit -m "deploy: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" --quiet || {
  log_warn "没有检测到文件变更，尝试强制推送..."
}

log_info "推送至: https://huggingface.co/spaces/${HF_USERNAME}/${HF_SPACE_NAME}"
log_info "正在推送..."

if git push -u origin main --force 2>&1; then
  log_ok "✅ 部署成功！"
  log_ok "Space 地址: https://huggingface.co/spaces/${HF_USERNAME}/${HF_SPACE_NAME}"
else
  log_error "推送失败，请检查 HF_TOKEN / HF_USERNAME / HF_SPACE_NAME 是否正确"
  log_error "Remote: $SPACE_REMOTE"
  exit 1
fi
```

### 2. 修改 `Makefile` — 添加 `deploy-hf` target

在 `Makefile` 末尾追加：

```makefile
# ========== HuggingFace Spaces 部署 ==========
deploy-hf:
	@bash scripts/deploy-hf.sh
```

### 3. 修改 `.env.example` — 添加 HF 变量说明

在文件末尾追加：

```bash
# HuggingFace Spaces 部署（仅部署时需要）
# HF_TOKEN=hf_xxxxxxxxxxxxxxxxx
# HF_USERNAME=your-hf-username
# HF_SPACE_NAME=tarot-poster
```

## 使用方式

### 前置条件

1. 在 [HuggingFace](https://huggingface.co/settings/tokens) 创建 Access Token（需要 write 权限）
2. 在 HuggingFace 上创建一个 Space，选择 **Docker** 模板，Space SDK 选 `Docker`
3. Space 的 visibility 可根据需要选择 public 或 private

### 执行部署

```bash
# 方式一：通过环境变量
export HF_TOKEN=hf_xxxxxxxxxxxx
export HF_USERNAME=yourname
export HF_SPACE_NAME=tarot-poster
bash scripts/deploy-hf.sh

# 方式二：通过 Makefile（推荐）
HF_TOKEN=hf_xxx HF_USERNAME=yourname HF_SPACE_NAME=tarot-poster make deploy-hf
```

### 部署流程说明

1. 脚本校验必需的环境变量是否已设置
2. 将 `Dockerfile.hf` 复制为根目录 `Dockerfile`
3. 将必要的源文件复制到临时目录
4. 在临时目录初始化 Git，用 `HF_TOKEN` 作为密码认证
5. 强制推送到 `https://huggingface.co/spaces/{username}/{space-name}`
6. HF 收到推送后自动触发 Docker 构建和部署
7. 推送完成后自动清理临时文件

## 注意事项

1. **首次部署**：需要先在 HF 上手动创建 Space，否则推送会失败
2. **强制推送**：脚本使用 `--force` 推送，每次都会覆盖 HF Space 仓库的全部内容
3. **环境变量**：HF Space 运行时需要的环境变量（如 `API_KEY`、`NODE_ENV` 等）需在 HF Space Settings 页面手动配置
4. **Token 安全**：`HF_TOKEN` 不要硬编码在脚本中，也不要提交到 Git 仓库
5. **构建时间**：首次部署时 HF 需要拉取基础镜像并构建，可能需要几分钟
