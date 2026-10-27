# 项目：上海零基础形意拳体验课预约网站（xingyi-booking）

## 项目约定
- 需求来源：`网站制作需求1027.docx`（首期测试版 V1.0，中英双语、模拟支付、邮件确认、后台管理）
- 全部时间按 **上海当地时间 UTC+8** 存储与展示；页面语言 ≠ 实际授课语言，两者分开标注
- 中英文共用同一套课程、场次、库存、订单、名单
- 订单状态 / 付款状态 / 退款状态三者分别记录；**申请退款 ≠ 退款成功**
- 订单「已付款」只能由服务端核验的支付通知产生，绝不因跳转成功页认定

## 技术约定
- Next.js 15 App Router + TS + Tailwind v4；Drizzle ORM
- 数据层双驱动：无 `DATABASE_URL` → PGlite（`./.data/pg`）；有 → node-postgres
- 发信统一走 `src/lib/email.ts` 的 `sendEmail()`，换服务商只改这一处
- 客户端组件禁止引入任何链到 db 的模块（配置拆成 `config.ts` 纯常量 与 `settings.ts` 读库两部分）

## 常用命令
```bash
npm run dev            # http://localhost:3000
npm run db:migrate     # 建表
npm run db:seed        # 演示数据 + 默认管理员
npm run db:migrate:to  # 迁到 TARGET_DATABASE_URL（先停 dev server）
# 操作远程库必须带 --env-file，否则会打到本地 PGlite：
npx tsx --env-file=.env.local scripts/reset.ts --yes
python scripts/acceptance.py            # 端到端验收 21 项
python scripts/race.py <url> <sid> 20   # 并发抢位压测
```

## 数据库（已迁到私有 Supabase 150.158.139.170）
- 库 `xingyi` / 角色 `xingyi_app`；容器 `supabase-db`，PG 17.6
- 开发期走 SSH 隧道 `127.0.0.1:15432 → 172.20.0.2:5432`（`scripts/ops/tunnel.py`）
- 生产：应用同机/同 docker 网络，连接串用容器内地址，不走隧道、不开 5432 公网
- SSL：项目默认**关闭**（`sslOptionsFromUrl`），需要时连接串加 `?sslmode=require`

## 部署（已上线到 150.158.139.170）
- `/srv/xingyi-src` 构建，`/srv/xingyi` 运行（standalone），systemd `xingyi.service`
- 更新：`SSH_PW=... ./scripts/ops/deploy.sh`
- 服务器 Node 20 在 `/usr/local/bin/node`（系统 18 不可用，Tailwind v4 要求 ≥20）
- 运维脚本在 `scripts/ops/`：`ssh_exec.py` / `upload.py` / `tunnel.py` / `deploy.sh`
  - ⚠️ 调用前必须 `export MSYS_NO_PATHCONV=1`，否则 /tmp 会被转成 Windows 路径
  - ⚠️ 传给 ssh 的命令里不要出现单引号（bash -c repr 会转义坏）
- 域名 `hishifu.oneding.tech` 目前只有 Resend 的 SPF/DKIM，**缺 A 记录**（待用户补，之后 certbot）

## 凭据与环境
- 默认管理员：`admin@xingyi-test.local` / `Xingyi@2026`
- Resend：发件人 `booking@hishifu.oneding.tech`（域名已验证，任意收件人可投递；勿用 example.com 测试投递——保留域会被永远拒绝）
- ⚠️ Resend Key 曾在对话中明文出现，正式上线前应在 Resend 控制台轮换
- 生产前必须替换：`AUTH_SECRET`、`PAYMENT_WEBHOOK_SECRET`、数据库密码、`NEXT_PUBLIC_SITE_URL`
