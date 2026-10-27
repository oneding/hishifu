# 发布到 Vercel（国外客户入口）

代码已托管在 **https://github.com/oneding/hishifu**，Vercel 直接从该仓库导入即可。

---

## 一、导入项目

1. Vercel → Add New → Project → Import `oneding/hishifu`
2. Framework Preset 选 **Next.js**（会自动识别）
3. Build Command / Output 保持默认（`next build`）
4. Node.js Version 选 **20.x 或 22.x**（Tailwind v4 要求 ≥ 20，选 18 会构建失败）
5. 填好下面的环境变量 → Deploy

## 二、环境变量（Vercel → Settings → Environment Variables）

| 变量 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://用户:密码@主机:5432/xingyi?sslmode=require` | **必须公网可达**，见第三节 |
| `RESEND_API_KEY` | `re_…` | 建议轮换后再填 |
| `EMAIL_FROM` | `形意拳体验预约 <booking@hishifu.oneding.tech>` | 域名须已在 Resend 验证 |
| `NEXT_PUBLIC_SITE_URL` | `https://<你的 Vercel 域名>` | 邮件里的安全链接指向它，**必须与实际域名一致** |
| `AUTH_SECRET` | 随机 48 字节 | 与服务器部署保持一致，两边 session 才互通 |
| `PAYMENT_WEBHOOK_SECRET` | 随机 48 字节 | 同上，必须一致 |
| `HOLD_MINUTES` | `15` | 可选 |

生成密钥：`openssl rand -base64 48`

## 三、⚠️ 关键前提：数据库要能被 Vercel 访问

当前数据库跑在你服务器（150.158.139.170）的 Docker 内网 `172.20.0.2:5432`，
**只有服务器本机能访问**，Vercel 连不上。三选一：

| 方案 | 做法 | 评价 |
|---|---|---|
| **A. 放开服务器 5432 到公网** | 把 `supabase-db` 的端口映射从 `127.0.0.1:5432` 改为 `0.0.0.0:5432`，配强密码 + `sslmode=require`，并在云防火墙只放行必要来源 | 数据统一，**但数据库直接暴露在公网**，需要接受风险 |
| **B. Vercel 连云端 Postgres** | 用 Supabase 云 / Neon 的免费库，`DATABASE_URL` 填它的公网地址 | 最省事、最安全；但与你服务器上的库是**两套数据** |
| **C. 两边各用各的库** | Vercel 用云库，服务器用本地库 | 订单数据会分裂，**不推荐** |

> 如果目标是"国内外客户共享同一套库存和订单"，只能选 **A**（或把数据库整体迁到公网可达的地方）。
> 选 A 时务必：改掉 `xingyi_app` 的默认密码、只对该库授权、开启 SSL、定期备份。

## 四、日常更新流程

```bash
# 1) 本机改完代码后，一条命令提交并推送到 GitHub（自动递增版本号）
python scripts/ops/github_sync.py -m "本次改动说明"

# 2) Vercel 侧
#    - 若开了 Git 自动部署：推送即触发构建
#    - 手工发布：Vercel 项目页 → Deployments → Redeploy
```

版本号由 `scripts/ops/github_sync.py` 自动递增（`package.json` 的 `version`），
构建时注入前端，显示在**每个页面的页脚**，形如：

```
v1.0.3 · a1b2c3d · 2026-10-27 16:53
```

`a1b2c3d` 是构建时所在 commit，用它就能确认线上跑的是哪份代码。

## 五、验证清单

- [ ] 首页中英文都能打开
- [ ] 页脚版本号与本仓库最新 tag 一致
- [ ] 走一遍下单 → 模拟支付 → 收到确认邮件（确认 `DATABASE_URL` 与 Resend 都通）
- [ ] 后台 `/admin` 能登录（默认 `admin@xingyi-test.local` / `Xingyi@2026`，上线后请改掉）
