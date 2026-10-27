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
npm run db:apply -- drizzle/0001_xxx.sql   # 应用单个迁移（幂等）
npm run admin:create     # 建/改后台管理员（ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME / ADMIN_ROLE）

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

## 六、管理后台（`/admin`）

登录入口 `/admin/login`（支持密码登录 / 邮箱验证码登录 / 找回密码）。

| 路由 | 作用 |
|---|---|
| `/admin` | 概览：已确认、待付款、待退款、邮件异常 + 客户数、交易笔数、GMV，以及各模块快捷入口 |
| `/admin/products` | **产品管理**：新建/编辑产品（中英双语、标价、时长、授课语言、封面、上下架），并展示场次数、已确认人数、成交额 |
| `/admin/sessions` | 场次与名额：开课时间、价格、容量、锁位情况 |
| `/admin/orders` | 订单：筛选、取消、重发邮件、标记退款 |
| `/admin/transactions` | **交易查询**：按时间/状态/关键词查支付流水，汇总成功笔数、成功金额、失败与放弃、已退款金额 |
| `/admin/users` | **用户管理**：客户（以下单邮箱为唯一键，含订单数/已付/累计消费/最近下单，可拉黑、编辑备注）+ 管理员账号（启用停用、角色、新增） |
| `/admin/payments` | **支付渠道**：Stripe / PayPal / 微信支付 的启用开关、配置状态、回调地址（密钥只放环境变量，不入库） |
| `/admin/course` | 前台详情页文案与场地（中英双语） |
| `/admin/settings` | 锁位时长、取消时限、联系邮箱、**修改当前账号密码**、操作审计 |

- **黑名单**：客户被拉黑后，该邮箱在下单接口直接被拒（`createBooking` 返回 `blocked`，HTTP 403）。
- **客户建档**：下单成功后按邮箱自动建档（`customers` 表），历史订单邮箱即使未建档也会出现在用户列表。
- **权限**：任何已启用（`is_active`）的管理员均可访问全部后台；角色 `owner/admin` 仅作标记，不影响可见范围。

---

## 七、切换到自有云服务器的私有 Supabase

见 `docs/SELFHOST-SUPABASE.md`（含部署方案、连接串、SSL 处理、迁移步骤、生产注意事项）。
最简路径：把 `DATABASE_URL` 指向服务器上的 Postgres，重启即可；后台概览页会显示「外部 Postgres」。

---

## 八、版本与发布

代码托管在 **https://github.com/oneding/hishifu**，每次更新一条命令：

```bash
python scripts/ops/github_sync.py -m "本次改动说明"      # 自动 bump patch：1.0.1 → 1.0.2
python scripts/ops/github_sync.py --bump minor -m "新功能" # 次版本递增
python scripts/ops/github_sync.py --bump none -m "小改"    # 不改版本号
```

脚本会：递增 `package.json` 版本号 → 提交 → 打 tag → 推送。
（git 协议不通时会自动改用 GitHub API 提交，代理抖动会重试。）

版本号在**每个页面的页脚**展示，形如：

```
v1.0.2 · a1b2c3d · 2026-10-27 16:53
```

`a1b2c3d` 是构建时对应的 commit，用它就能确认线上跑的是哪份代码。

| 发布目标 | 方式 |
|---|---|
| 自有服务器 | `SSH_PW='...' ./scripts/ops/deploy.sh`（见 `docs/SELFHOST-SUPABASE.md`） |
| Vercel | 从 GitHub 导入后手动 Deploy（见 `docs/VERCEL.md`） |

---

## 九、V1.0 已知限制

1. **支付渠道**：已接入 Stripe / PayPal / 微信支付（Native 扫码），另有 `mock` 测试渠道。
   接入方式见 `docs/PAYMENTS.md`；未配密钥的渠道不会出现在收银台。
2. **退款为标记流程**：后台手动置为已退，未对接渠道退款 API（Stripe/PayPal/微信的退款接口均未接）。
3. **管理员为自建认证**：未使用 Supabase Auth，便于私有化部署；已含邮箱验证、找回密码、验证码登录。
4. 演示数据中的场地、地址、价格均为示例，上线前需在后台「产品」「场次」里替换。
5. 微信支付仅支持 CNY，且需要大陆主体商户号；H5/JSAPI 还需域名 ICP 备案。
