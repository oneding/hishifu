# 上海零基础形意拳体验课 · 预约网站（V1.0 测试版）

面向国内外客户的体验课预约站点：中英双语、邮箱注册登录、邮件通知、**模拟支付**（不产生真实扣款）。
数据层为标准 PostgreSQL，本地零安装可跑，也可一键切到自有云服务器的私有 Supabase。

---

## 一、快速开始

```bash
npm install
cp .env.example .env.local     # 按需填写，可先留空
npm run setup                  # 建表 + 灌演示数据
npm run dev                    # http://localhost:3000
```

首次访问 `/` 会按浏览器语言自动跳到 `/zh` 或 `/en`。

**默认后台账号**：`admin@xingyi-test.local` / `Xingyi@2026`
（在后台「注册」也可用邮箱自建管理员，会发验证邮件；没配 Resend 时验证链接可从后台「邮件」页查看）

---

## 二、环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 否 | **留空** → 用内置 PGlite（数据落 `./.data/pg`，零安装）；填写 → 连接外部 Postgres |
| `RESEND_API_KEY` | 否 | 留空则邮件只入库不实发（状态 `logged`），后台「邮件」页可查看与重发 |
| `EMAIL_FROM` | 否 | 形如 `形意拳体验预约 <booking@已验证域名.com>`，域名需先在 Resend 验证 |
| `NEXT_PUBLIC_SITE_URL` | 是 | 邮件里安全链接的域名，**上线必须改成正式域名**，否则链接指向 localhost |
| `AUTH_SECRET` | 是 | 会话签名密钥，`openssl rand -base64 48` |
| `PAYMENT_WEBHOOK_SECRET` | 是 | 支付通知 HMAC 校验密钥 |
| `HOLD_MINUTES` | 否 | 下单后名额锁定时长，默认 15 分钟，超时自动释放 |

---

## 三、常用命令

```bash
npm run dev              # 开发（:3000）
npm run build && npm start   # 生产构建并启动
npm run typecheck        # 类型检查
npm run setup            # 建表 + 演示数据
npm run db:seed          # 只灌演示数据
npm run db:reset         # 清空数据（保留表结构），需加 --yes
npm run db:check         # 目标库连通自检
npm run db:migrate:to    # 把本地库迁移到外部 Postgres

python scripts/acceptance.py          # 端到端验收（21 项）
python scripts/race.py <url> <sid> 20 # 并发抢位压测
```

---

## 四、业务流程

```
浏览课程 → 选场次 → 填写姓名邮箱 → 创建订单（锁定名额 15 分钟）
  → 模拟收银台付款 → 渠道异步通知（HMAC 签名） → 订单确认 + 发确认邮件
  → 邮件里的安全链接可查看/取消订单
```

- **取消**：开课前 24 小时（可配置）之外可自助取消，产生**退款申请**（`requested`），
  后台确认后才置为 `refunded`（申请 ≠ 已退）。
- **找回订单**：首页「查询我的预约」，输入邮箱后系统发送订单链接。

---

## 五、关键设计

| 主题 | 做法 |
|---|---|
| **防超卖** | 单条条件更新 `UPDATE … WHERE seats_confirmed + seats_held + $qty <= capacity RETURNING *`，由数据库原子判定，不做先查后写 |
| **幂等** | `bookings.idempotency_key` 唯一索引；支付 `payments.event_id` 唯一索引，重复通知不重复确认、不重复发信 |
| **付款可信** | 只认服务端签名通知（HMAC-SHA256 + 金额比对），用户跳回成功页不产生"已付款" |
| **安全链接** | URL 用明文 token，库里存 sha256；同时存 AES-256-GCM 密文供原样重发 |
| **邮件降级** | 发信失败不影响订单状态，全部留痕可重发 |
| **i18n** | 自建轻量方案（`src/i18n/messages.ts`），已含 zh/en，结构预留 fr/es/ru/ar 与 RTL |
| **时间** | 库里存 UTC，展示统一 Asia/Shanghai（UTC+8） |

---

## 六、切换到自有云服务器的私有 Supabase

见 `docs/SELFHOST-SUPABASE.md`（含部署方案、连接串、SSL 处理、迁移步骤、生产注意事项）。
最简路径：把 `DATABASE_URL` 指向服务器上的 Postgres，重启即可；后台概览页会显示「外部 Postgres」。

---

## 七、V1.0 已知限制

1. **支付为模拟**：无真实收款。接真实渠道时只需替换 `src/app/api/payments/mock/*`，
   保留"只认服务端通知"的约定即可，`src/lib/booking.ts` 的 `applyPaymentNotification()` 不用改。
2. **退款为标记流程**：后台手动置为已退，未对接渠道退款 API。
3. **管理员为自建认证**：未使用 Supabase Auth，便于私有化部署；已含邮箱验证、找回密码、验证码登录。
4. 演示数据中的场地、地址、价格均为示例，上线前需在后台「课程」「场次」里替换。
