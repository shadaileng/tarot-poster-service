#!/usr/bin/env bash
# ============================================================
# HuggingFace Spaces 部署脚本
# 从环境变量或 .env.hf 文件读取配置，推送项目到 HF Space
#
# 配置优先级：环境变量 > .env.hf 文件 > 默认值
#
# 用法:
#   # 方式一：通过 .env.hf 文件
#   cp .env.hf.example .env.hf
#   # 编辑 .env.hf 填入实际值
#   bash scripts/deploy-hf.sh
#
#   # 方式二：通过环境变量
#   HF_TOKEN=hf_xxxx HF_USERNAME=yourname HF_SPACE_NAME=tarot-poster bash scripts/deploy-hf.sh
# ============================================================

set -euo pipefail

# ---------- 颜色输出 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

fail() {
  log_error "$1"
  exit 1
}

# ---------- 路径 ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------- 加载 .env.hf 文件 ----------
load_env_file() {
  local env_file="$PROJECT_DIR/.env.hf"
  if [ -f "$env_file" ]; then
    log_info "加载配置文件: $env_file"
    while IFS='=' read -r key value; do
      key=$(echo "$key" | xargs)
      value=$(echo "$value" | xargs)
      # 跳过注释和空行
      [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
      # 环境变量优先，不覆盖
      if [ -z "${!key:-}" ]; then
        export "$key=$value"
      fi
    done < "$env_file"
  else
    log_warn ".env.hf 文件不存在，将仅使用环境变量"
    log_warn "提示: cp .env.hf.example .env.hf 然后编辑填入实际值"
  fi
}

load_env_file

# ---------- 读取变量 ----------
HF_TOKEN="${HF_TOKEN:-}"
HF_USERNAME="${HF_USERNAME:-}"
HF_SPACE_NAME="${HF_SPACE_NAME:-}"

# ---------- 校验变量 ----------
[ -n "$HF_TOKEN" ]      || fail "HF_TOKEN 未设置（检查 .env.hf 或环境变量）"
[ -n "$HF_USERNAME" ]   || fail "HF_USERNAME 未设置（检查 .env.hf 或环境变量）"
[ -n "$HF_SPACE_NAME" ] || fail "HF_SPACE_NAME 未设置（检查 .env.hf 或环境变量）"

# 占位符校验
[ "$HF_TOKEN" != "hf_xxxxxxxxxxxxxxxxx" ]    || fail "请修改 HF_TOKEN 为实际值"
[ "$HF_USERNAME" != "your-hf-username" ]     || fail "请修改 HF_USERNAME 为实际值"
[[ "$HF_SPACE_NAME" != "tarot-poster" && -n "$HF_SPACE_NAME" ]] || true

log_info "项目目录: $PROJECT_DIR"
log_info "用户名: $HF_USERNAME"
log_info "Space: $HF_SPACE_NAME"

# ---------- 临时目录 ----------
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# ---------- 1. 复制文件到临时目录 ----------
log_info "复制项目文件到临时目录..."

# 复制 Dockerfile.hf → 临时目录/Dockerfile（不覆盖项目目录的 Dockerfile）
if [ -f "$PROJECT_DIR/Dockerfile.hf" ]; then
  cp "$PROJECT_DIR/Dockerfile.hf" "$TMP_DIR/Dockerfile"
  log_info "  ✓ Dockerfile (from Dockerfile.hf)"
else
  log_warn "  ✗ Dockerfile.hf (不存在，跳过)"
fi

# 待推送文件列表
FILES_TO_COPY=(
  "src"
  "assets"
  "scripts/entrypoint.sh"
  "package.json"
  "pnpm-lock.yaml"
  "tsconfig.json"
)

# 处理 .dockerignore
if [ -f "$PROJECT_DIR/.dockerignore" ]; then
  FILES_TO_COPY+=(".dockerignore")
else
  cat > "$TMP_DIR/.dockerignore" <<'EOF'
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

for item in "${FILES_TO_COPY[@]}"; do
  if [ "$item" = ".dockerignore" ] && [ ! -f "$PROJECT_DIR/.dockerignore" ]; then
    src="$TMP_DIR/.dockerignore"
  else
    src="$PROJECT_DIR/$item"
  fi

  if [ -e "$src" ]; then
    # 保持目录结构
    dest_dir="$TMP_DIR/$(dirname "$item")"
    mkdir -p "$dest_dir"
    cp -a "$src" "$dest_dir/"
    log_info "  ✓ $item"
  else
    log_warn "  ✗ $item (不存在，跳过)"
  fi
done

# ---------- 验证临时目录 ----------
file_count=$(find "$TMP_DIR" -maxdepth 1 -type f | wc -l)
dir_count=$(find "$TMP_DIR" -maxdepth 1 -type d | tail -n +2 | wc -l)
total=$((file_count + dir_count))

if [ "$total" -eq 0 ]; then
  log_error "临时目录为空，没有任何文件被复制"
  log_error "目录: $TMP_DIR"
  fail "文件复制失败，请检查项目目录结构"
fi

log_info "共复制 $total 个文件/目录到临时目录"

# ---------- 3. 初始化 Git 并推送 ----------
SPACE_REMOTE="https://${HF_USERNAME}:${HF_TOKEN}@huggingface.co/spaces/${HF_USERNAME}/${HF_SPACE_NAME}"

cd "$TMP_DIR"

git init -q
git config user.name  "$HF_USERNAME"
git config user.email "${HF_USERNAME}@users.huggingface.co"
git remote add origin "$SPACE_REMOTE"

git add -A
if ! git commit -m "deploy: $(date -u +'%Y-%m-%dT%H:%M:%SZ')" --quiet 2>&1; then
  log_error "git commit 失败"
  log_error "当前目录: $(pwd)"
  log_error "目录内容:"
  ls -la
  log_error "git status:"
  git status
  fail "无法创建提交，请检查文件是否正确复制"
fi

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
