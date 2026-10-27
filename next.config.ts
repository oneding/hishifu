import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * 构建时把版本信息注入前端（页脚展示）：
 *   version  —— package.json 的语义化版本，每次发布由 scripts/ops/github_sync.py 自动 bump
 *   commit   —— 当前 commit 短哈希（Vercel / 服务器构建时都能拿到）
 *   buildAt  —— 构建时间（UTC+8 展示）
 * 取不到 git 时退化为 "unknown"，不阻塞构建。
 */
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {
  version: string;
};

function gitShortHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // 上级目录存在无关 lockfile，显式锁定工作区根目录
  outputFileTracingRoot: path.resolve(__dirname),
  /**
   * 产出 .next/standalone（自带最小 node_modules），服务器只跑 `node server.js`。
   * 这样小内存服务器无需 npm install / npm run build（本机 1G 可用内存构建会 OOM）。
   */
  output: "standalone",
  // PGlite 是 WASM 包，必须排除在打包之外，否则 Next 会尝试处理 .wasm / .data 资源
  serverExternalPackages: ["@electric-sql/pglite"],
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_COMMIT: gitShortHash(),
    NEXT_PUBLIC_APP_BUILD_AT: new Date().toISOString(),
  },
  experimental: {
    // 后台页面大量使用服务端渲染，允许更大的 body（导出/批量操作）
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
