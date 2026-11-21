#!/usr/bin/env bash
# One-command production installer for CutSheet Studio on withkeya.com (/cutsheet/).
# Usage on the withkeya.com VPS:
#   sudo bash deploy/install.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root / sudo 执行：sudo bash deploy/install.sh" >&2
  exit 1
fi

REPO_URL="${CUTSHEET_REPO_URL:-https://github.com/Stans97/cutsheet-studio.git}"

if ! command -v node >/dev/null 2>&1; then
  echo "[install] 错误：未检测到 Node.js，请先安装 Node.js 20+（推荐 24 LTS）。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[install] 错误：当前 Node.js 版本过低 ($(node -v))，需要 Node.js >= 20（推荐 24 LTS）。" >&2
  exit 1
fi

# 1. Create dedicated system user and directories
if ! id -u cutsheet-studio >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/cutsheet-studio --shell /usr/sbin/nologin cutsheet-studio
fi

mkdir -p /opt/cutsheet-studio /var/lib/cutsheet-studio /etc/cutsheet-studio
chown -R cutsheet-studio:cutsheet-studio /var/lib/cutsheet-studio
chmod 0700 /var/lib/cutsheet-studio

# 2. Initialize server-side env file if missing (preserve existing keys!)
if [ ! -f /etc/cutsheet-studio/env ]; then
  cat > /etc/cutsheet-studio/env <<'EOF'
PORT=3780
HOST=127.0.0.1
DATA_DIR=/var/lib/cutsheet-studio
COOKIE_PATH=/cutsheet/
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-6.2-sol
OPENAI_REASONING_EFFORT=high
OPENAI_PROTOCOL=responses
GEMINI_API_KEY=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_MODEL=gemini-4-neon
GEMINI_THINKING_LEVEL=high
GEMINI_PROTOCOL=generate_content
EOF
  chmod 0640 /etc/cutsheet-studio/env
  chown root:cutsheet-studio /etc/cutsheet-studio/env
  echo "[install] 已创建 /etc/cutsheet-studio/env（可随时填入服务器级 OPENAI_API_KEY / GEMINI_API_KEY）"
fi

# 3. Fetch latest repo and install systemd units + auto-deploy timer
TMP_SRC="$(mktemp -d)"
trap 'rm -rf "$TMP_SRC"' EXIT
git clone --quiet --depth 1 "$REPO_URL" "$TMP_SRC"

install -m 0755 "$TMP_SRC/deploy/auto-deploy.sh" /usr/local/sbin/cutsheet-studio-auto-deploy
install -m 0644 "$TMP_SRC/cutsheet-studio.service" /etc/systemd/system/cutsheet-studio.service
install -m 0644 "$TMP_SRC/deploy/cutsheet-studio-deploy.service" /etc/systemd/system/cutsheet-studio-deploy.service
install -m 0644 "$TMP_SRC/deploy/cutsheet-studio-deploy.timer" /etc/systemd/system/cutsheet-studio-deploy.timer
install -m 0644 "$TMP_SRC/route.conf" /etc/cutsheet-studio/route.conf

systemctl daemon-reload
systemctl enable cutsheet-studio.service

echo "[install] 执行首次原子部署与健康检查..."
/usr/local/sbin/cutsheet-studio-auto-deploy

systemctl enable --now cutsheet-studio-deploy.timer

cat <<'EOF'

[install] CutSheet Studio 后端部署完成！
- 本机健康检查：http://127.0.0.1:3780/api/health
- Nginx 路由片段已保存至：/etc/cutsheet-studio/route.conf

最后一步：在 withkeya.com 的 Nginx HTTPS server 块中加入：
    include /etc/cutsheet-studio/route.conf;
然后执行：
    nginx -t && systemctl reload nginx

完成后即可通过 https://withkeya.com/cutsheet/ 直接访问（免登录游客模式即开即用）。
EOF
