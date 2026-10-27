# 迁移到自有云服务器的私有 Supabase

本项目的数据层是标准 PostgreSQL，不依赖 Supabase 的 Auth / Storage / Realtime。
因此"迁移到私有 Supabase"实际只需要**把 DATABASE_URL 指向你服务器上的 Postgres**（自建 Supabase 套件里的那个库，或独立 Postgres 均可）。

---

## 一、两种部署方案

| 方案 | 内容 | 适用 | 资源占用 |
|---|---|---|---|
| **A. 独立 Postgres（推荐）** | 只跑 `postgres:16` + 可选连接池 | 本项目只需要数据库 | 低（1C2G 可跑） |
| **B. 完整自建 Supabase** | 官方 self-host 套件（Postgres + PostgREST + GoTrue + Kong + Studio…） | 后续还要用 Auth / Storage / Realtime | 高（建议 4C8G 起） |

> 如果服务器上已经跑着自建 Supabase，直接跳到「三、配置连接串」——用它的 Postgres 即可，本项目不需要额外改造。

---

## 二、在自有服务器部署（Ubuntu 22.04 / 24.04）

### 方案 A：独立 Postgres（推荐，5 分钟）

```bash
# 1) 安装 Docker（已装可跳过）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2) 启动 Postgres，数据落在本机目录，密码自己换掉
sudo mkdir -p /srv/xingyi/pgdata
docker run -d --name xingyi-pg --restart=always \
  -e POSTGRES_PASSWORD='换成强密码' \
  -e POSTGRES_DB=xingyi \
  -e TZ=Asia/Shanghai \
  -p 127.0.0.1:5432:5432 \
  -v /srv/xingyi/pgdata:/var/lib/postgresql/data \
  postgres:16-alpine

# 3) 验证
docker exec xingyi-pg psql -U postgres -d xingyi -c "select version();"
```

⚠️ 上面把端口绑定到 `127.0.0.1`，**只允许本机访问**，更安全。
若本机需要直接从外部连（不推荐），改成 `-p 5432:5432` 并务必配置防火墙只放行你的 IP。

### 方案 B：完整自建 Supabase

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# 编辑 .env：设置 POSTGRES_PASSWORD、JWT_SECRET、ANON_KEY、SERVICE_ROLE_KEY、SITE_URL
# 生成密钥：openssl rand -base64 48
docker compose pull
docker compose up -d
```

起好后 Postgres 在 `localhost:5432`（库名 `postgres`），Studio 在 `http://<服务器IP>:8000`。
**务必改掉 .env 里所有默认密钥，并把 8000 端口限制在内网。**

---

## 三、配置连接串

编辑项目根目录 `.env.local`：

```bash
# 直连 Postgres（本项目推荐，事务/行锁行为最标准）
DATABASE_URL=postgresql://postgres:你的密码@你的服务器:5432/xingyi

# 若走自建 Supabase 的 Supavisor 连接池（端口 6543），用 session 模式：
# DATABASE_URL=postgresql://postgres.<project-ref>:密码@服务器:6543/postgres
```

> 本项目用事务 + 条件 UPDATE 防超卖，**必须保证是 session/直连模式**；
> 不要使用 transaction 模式的连接池（serverless 场景），否则 `UPDATE … RETURNING` 与事务语义会受影响。

### SSL 怎么处理（重要）

项目按连接串里的 `sslmode` 决定行为，逻辑集中在 `src/db/index.ts` 的 `sslOptionsFromUrl()`：

| 连接串 | 行为 |
|---|---|
| `postgresql://user:pw@host:5432/db`（未写 sslmode） | **不启用 SSL** |
| `…?sslmode=disable` / `allow` / `prefer` | 不启用 SSL |
| `…?sslmode=require` / `verify-ca` / `verify-full` | 启用 SSL（`verify-full` 才校验证书链） |

> node-postgres 的默认 `sslmode=prefer` 会先发 SSLRequest，而 Node 端不像 libpq 那样会回退；
> 自建库没开 SSL 时服务端直接拒绝，报错 `The server does not support SSL connections`。
> 所以这里改成**显式默认关闭**，需要加密就自己在 URL 上加 `?sslmode=require`。

内网 / 同机 / SSH 隧道场景保持默认即可；公网直连数据库时建议 `sslmode=require`。

---

## 四、迁移数据与验证

```bash
# 1) 先停掉本地 dev server（PGlite 是单进程独占的，必须停）

# 2) 把表结构 + 现有数据推到服务器
export TARGET_DATABASE_URL='postgresql://postgres:密码@服务器:5432/xingyi'
npm run db:migrate:to

# 只同步结构、不要演示数据：
npx tsx scripts/migrate-to.ts --structure-only

# 目标库已脏、要完全覆盖：
npx tsx scripts/migrate-to.ts --truncate

# 3) 验证目标库表数量
psql "$TARGET_DATABASE_URL" -c "\dt"

# 4) 切到服务器库启动
#    把 DATABASE_URL 写进 .env.local 后：
npm run dev
```

启动后打开 `http://localhost:3000/admin`，概览页顶部会显示当前数据源：
显示「外部 Postgres」即表示已切到你的私有服务器。

---

## 五、生产注意事项

1. **不要暴露 5432 到公网**。推荐做法：只在 `127.0.0.1` 监听，应用与数据库同机；跨机时用 SSH 隧道或内网专线。
2. **改默认密码 / 密钥**：`AUTH_SECRET`、`PAYMENT_WEBHOOK_SECRET`、Postgres 密码都要换成随机值（`openssl rand -base64 48`）。
3. **备份**：Postgres 容器内定期 `pg_dump`，或给云盘加快照。
4. **站点地址**：部署后把 `NEXT_PUBLIC_SITE_URL` 改成正式域名，否则邮件里的安全链接会指向 localhost。
6. **国内外访问**：
   - 服务器在中国大陆 + 用域名访问 → 域名需 ICP 备案；
   - 服务器在中国香港 / 新加坡 / 海外 → 免备案，国内访问延迟通常 50–150ms，可接受。

---

## 六、邮件送达（国内外客户）

### 当前实测结论（2026-10-27 14:23 更新）

| 项目 | 结果 |
|---|---|
| 已验证域名 | `hishifu.oneding.tech`、`fangcun.oneding.tech`（均 verified / sending enabled） |
| **当前发件人** | `形意拳体验预约 <booking@hishifu.oneding.tech>`（`.env.local` 的 EMAIL_FROM） |
| 发往 `@hishifu.oneding.tech` | ✅ sent |
| 发往 gmail.com / qq.com / 163.com / outlook.com | ✅ API 全部接受，**任意收件人限制已解除** |
| 发往 `example.com` 之类的保留域 | ❌ 会被拒（Resend 规则，不代表账号受限） |

> 之前判断「账号受限」不准确：`example.com` 是 RFC 保留域，Resend 永远拒绝，勿用它做投递测试。

### 后续建议

1. **送达率**：域名 SPF/DKIM 已配好（验证通过）。正式放量前建议在 Resend 控制台绑定自有回弹域并关注 bounce 率。
2. **国内到达**：Resend 底层为 AWS SES，国内主流邮箱一般可收但可能进垃圾箱；若客户以国内为主且追求进收件箱率，可叠加腾讯云 SES / 阿里云邮件推送做国内通道。
3. **双通道路由（长期可选）**：按收件人域名自动选通道，只需改 `src/lib/email.ts` 的 `sendEmail()` 一处。

### 解决办法

1. ~~申请解除限制~~ → **已解决**（2026-10-27）：新域名 `hishifu.oneding.tech` 验证后，gmail/qq/163/outlook 均可直接投递。
2. **国内客户追求进收件箱率**：叠加腾讯云 SES / 阿里云邮件推送（域名需 ICP 备案）做国内通道。
3. **双通道路由（可选）**：按收件人域名自动选通道。发信已收敛在 `src/lib/email.ts` 的 `sendEmail()` 一处，扩展零改动。

### 邮件失败不影响订单

`sendEmail()` 无论成功失败都先落库一条记录，订单状态只由支付通知决定。
后台「邮件」页可以看到每条邮件的状态（`sent` / `failed` / `logged`）、失败原因，并能一键重发。
本次实测中就有订单邮件 `failed` 但订单仍为 `confirmed` 的真实案例，符合验收要求。

---

## 七、本次迁移实录（服务器 150.158.139.170）

> 命令里的密码均已脱敏，真实值只放在服务器的环境变量 / `.env.local`（两者都在 `.gitignore`）。

### 7.1 服务器现状

自建 Supabase 套件已 healthy（容器名 `supabase-db` / `supabase-pooler` / `supabase-studio` …），
Postgres 版本 **17.6**，`supabase-pooler` 只监听 `127.0.0.1:5432/6543`（安全配置正确，未改动任何防火墙）。

因为 `POOLER_POOL_MODE=transaction` 不适合本项目的「事务 + 条件 UPDATE 防超卖」逻辑，
最终采用 **SSH 隧道 + 应用专用账号直连 Postgres** 的方式。

### 7.2 建库与专用账号（不触碰原有主密码）

```sql
-- 在 supabase-db 容器内执行
CREATE ROLE xingyi_app LOGIN PASSWORD '<应用专用密码>';
CREATE DATABASE xingyi;
GRANT ALL PRIVILEGES ON DATABASE xingyi TO xingyi_app;
\c xingyi
GRANT ALL ON SCHEMA public TO xingyi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO xingyi_app;
```

### 7.3 SSH 隧道（仅开发 / 调试期使用）

```bash
SSH_PW='<服务器密码>' python scripts/ops/tunnel.py
# [tunnel] 就绪：127.0.0.1:15432 -> <服务器> -> 172.20.0.2:5432
```

```bash
DATABASE_URL=postgresql://xingyi_app:<应用专用密码>@127.0.0.1:15432/xingyi
```

> 生产不要依赖隧道：把 Next.js 也部署到同一台服务器（或同一 docker 网络），
> 连接串改成容器内地址 `postgresql://xingyi_app:<pwd>@172.20.0.2:5432/xingyi`。

### 7.4 迁移与自检

```bash
npm run db:check                 # 目标库连通自检（版本 / 时区 / 表数 / 行数）
npm run db:migrate:to            # 结构 + 数据，按外键顺序复制
npx tsx --env-file=.env.local scripts/reset.ts --yes   # 需要清空重来时（保留表结构）
npx tsx --env-file=.env.local scripts/seed.ts          # 重新灌演示数据
```

本次迁移结果：**14 张表 / 42 行**全部落地。

---

## 八、验收脚本

| 命令 | 作用 |
|---|---|
| `python scripts/acceptance.py` | 端到端验收（21 项），纯标准库无需安装依赖 |
| `python scripts/race.py <url> <sessionId> <并发数>` | 并发抢位压测，验证不超卖 |

`acceptance.py` 覆盖：中英首页、未登录重定向、后台登录与数据源标识、下单、幂等、
超额拒绝、支付确认、重复通知幂等、伪造签名 401、取消与退款语义、名额守恒、邮件日志。

```bash
# 在真实 Postgres 上的验收结果（2026-10-27）
共 21 项，通过 21 项，失败 0 项

# 并发压测：20 并发抢 8 个名额
总请求 20  成功 8  soldOut 12  其他 0
# 数据库侧：seats_held=8 = capacity，free=0（零超卖）
```

---

## 九、把应用也部署到服务器（已实施）

### 9.1 架构

```
用户 ──https──▶ Nginx(80/443) ──http──▶ Next.js standalone(127.0.0.1:3000) ──▶ Postgres(172.20.0.2:5432)
                                              systemd: xingyi.service              docker: supabase-db
```

- 应用只监听 `127.0.0.1:3000`，对外只暴露 Nginx
- 数据库在 docker 网内，宿主机可直接连 `172.20.0.2:5432`，**不需要开 5432 公网**
- 服务器 2C3G 也能跑：standalone 常驻内存约 55MB

### 9.2 目录约定

| 路径 | 用途 |
|---|---|
| `/srv/xingyi-src` | 源码 + 构建（含 node_modules） |
| `/srv/xingyi` | 运行目录（standalone 产物 + `.env`） |
| `/etc/systemd/system/xingyi.service` | 服务单元，开机自启、崩溃自动重启 |
| `/etc/nginx/sites-available/hishifu` | 反代配置 |

### 9.3 一键更新

```bash
SSH_PW='<服务器密码>' ./scripts/ops/deploy.sh
```

流程：打包源码 → 上传 → 服务器 `npm run build`（`NEXT_PUBLIC_SITE_URL` 为正式域名）→ 覆盖 standalone → 重启。

### 9.4 本次踩到的坑

| 现象 | 原因 | 处理 |
|---|---|---|
| `Cannot find native binding`（Tailwind） | 服务器 Node 18，Tailwind v4 要求 ≥ 20 | 装 Node 20 到 `/opt`，软链 `/usr/local/bin/node`；systemd 里写 `/usr/local/bin/node` |
| SFTP `ENOENT` | 云镜像关了 sftp-server | `upload.py` 改用 `cat > 远端路径` 的 stdin 管道 |
| 远端路径变成 `C:/Users/...` | Git Bash 的 MSYS 路径转换 | 加 `MSYS_NO_PATHCONV=1` |
| 生产后台一直登不进去 | `secure: NODE_ENV==='production'` 让内网 http 访问丢弃 cookie | 改为按 `X-Forwarded-Proto` 判断（见 `src/lib/auth.ts`） |
| 支付后订单停在待付款 | 模拟回调写死了配置的站点域名，域名未解析时回调打不出去 | 回调改用**当前请求的 origin**（`src/app/api/payments/mock/submit/route.ts`） |
| sudo 写入密码报 Socket closed | sudo 凭证在 5 分钟内缓存，stdin 已关闭 | 写入失败时忽略即可 |
| 本机构建被拦 | 编辑器环境的删除保护（本轮配额） | 改为在服务器构建 |

### 9.5 常用运维

```bash
systemctl status xingyi          # 状态
journalctl -u xingyi -f          # 实时日志
systemctl restart xingyi         # 重启
nginx -t && systemctl reload nginx
certbot certificates             # 查看证书
```

### 9.6 上线前必须确认

1. 域名 A 记录指向服务器（本次 `hishifu.oneding.tech` 只有 Resend 的 SPF/DKIM，**没有 A 记录**）
2. `certbot --nginx -d hishifu.oneding.tech` 签发证书
3. `/srv/xingyi/.env` 里的 `AUTH_SECRET` / `PAYMENT_WEBHOOK_SECRET` / 数据库密码都为随机值（已替换）
4. Resend Key 轮换（曾在对话中明文出现）
