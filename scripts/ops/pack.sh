#!/usr/bin/env bash
# 打包 standalone 产物为可直接上传的 tar.gz（含 static / public / drizzle 迁移）
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="xingyi-standalone.tar.gz"
STAGE=".next/standalone"

if [ ! -f "$STAGE/server.js" ]; then
  echo "未找到 $STAGE/server.js，请先执行 npm run build" >&2
  exit 1
fi

# standalone 不会自动带上这两个目录，必须手工补齐
mkdir -p "$STAGE/.next"
cp -r .next/static "$STAGE/.next/static" 2>/dev/null || true
[ -d public ] && cp -r public "$STAGE/public" || true
[ -d drizzle ] && cp -r drizzle "$STAGE/drizzle" || true

rm -f "$OUT"
tar -czf "$OUT" -C "$STAGE" .
ls -lh "$OUT"
echo "打包完成：$OUT"
