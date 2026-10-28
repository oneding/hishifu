#!/usr/bin/env bash
# 一键更新线上站点：打包源码 → 上传 → 服务器构建 → 部署 standalone → 重启服务
#
# 用法：
#   SSH_PW='<服务器密码>' ./scripts/ops/deploy.sh
#   SITE_URL=https://其他域名 SSH_PW='...' ./scripts/ops/deploy.sh
#
# 说明：构建放在服务器做（本机构建受编辑器环境的删除保护影响，且服务器 npm 源更快）。
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${SSH_PW:?请先 export SSH_PW=<服务器密码>}"
SITE_URL="${SITE_URL:-https://hishifu.oneding.tech}"
export MSYS_NO_PATHCONV=1        # 防止 Git Bash 把 /tmp/xxx 转成 Windows 路径
export SSH_TIMEOUT="${SSH_TIMEOUT:-900}"

echo "▶ 1/5 打包源码"
tar -czf xingyi-src.tar.gz \
  src scripts docs drizzle package.json package-lock.json \
  next.config.ts tsconfig.json postcss.config.mjs drizzle.config.ts next-env.d.ts

echo "▶ 2/5 上传"
python scripts/ops/upload.py xingyi-src.tar.gz /tmp/xingyi-src.tar.gz

echo "▶ 3/5 解压"
python scripts/ops/ssh_exec.py "tar -xzf /tmp/xingyi-src.tar.gz -C /srv/xingyi-src"

echo "▶ 4/5 服务器构建（约 1-2 分钟）"
# 服务器源码目录没有 .git，把本机 commit 传过去，页脚才能显示 v1.0.2 · a1b2c3d
APP_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '')"
python scripts/ops/ssh_exec.py "cd /srv/xingyi-src && APP_COMMIT=$APP_COMMIT NEXT_PUBLIC_SITE_URL=$SITE_URL npm run build" \
  | tail -5

echo "▶ 5/5 部署并重启"
# ⚠️ 静态资源必须用 cp -aT：目标目录已存在时，`cp -a 源 目标` 会把源整个拷进目标里
#    （.next/static/static/...），且旧文件不清除 → 页面引用的最新 CSS/JS 全部 404、页面无样式
python scripts/ops/ssh_exec.py --sudo "cp -a /srv/xingyi-src/.next/standalone/. /srv/xingyi/ \
  && rm -rf /srv/xingyi/.next/static \
  && cp -aT /srv/xingyi-src/.next/static /srv/xingyi/.next/static \
  && chown -R ubuntu:ubuntu /srv/xingyi && systemctl restart xingyi"
python scripts/ops/ssh_exec.py --sudo "sleep 6; systemctl is-active xingyi && curl -s -o /dev/null -w 'HTTP=%{http_code}\n' --max-time 20 http://127.0.0.1:3000/zh"

echo "✅ 部署完成"
