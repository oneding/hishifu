# 支付渠道接入说明（Stripe / PayPal / 微信支付）

站点已内置三个真实支付渠道 + 一个测试渠道，全部走同一套约定：

```
收银台选择渠道
  → POST /api/payments/intent 创建支付意图
      ├─ redirect：跳渠道收银台（Stripe Checkout / PayPal 审批页）
      └─ qrcode ：渲染二维码（微信 Native）＋ 前端每 3 秒轮询订单状态
  → 渠道异步通知（必须验签）
      ├─ POST /api/payments/stripe/webhook
      ├─ POST /api/payments/paypal/webhook
      └─ POST /api/payments/wechat/webhook
  → applyPaymentNotification() 落单：确认名额、发确认邮件
```

## 三条铁律（接真实渠道也没变）

1. **订单「已付款」只由服务端通知产生** —— 用户跳回成功页、前端轮询都不算数。
2. **通知必须验签**，验签失败直接 401（微信返回 `FAIL` 让渠道重试）。
3. **`eventId` 唯一 + 金额币种比对** —— 重复通知幂等，金额被篡改直接拒绝。

> 微信回调有 5 秒超时且会重试 15 次，所以 webhook 只做「验签 → 解密 → 落单」，不干别的。

---

## 一、Stripe（信用卡 / Apple Pay / Google Pay）

1. [Stripe Dashboard](https://dashboard.stripe.com/apikeys) 取 **Secret key**（`sk_live_…` / `sk_test_…`）。
2. Developers → Webhooks → Add endpoint：
   - URL：`https://hishifu.oneding.tech/api/payments/stripe/webhook`
   - 监听事件：`checkout.session.completed`、`checkout.session.async_payment_succeeded`、
     `checkout.session.async_payment_failed`、`checkout.session.expired`
   - 创建后复制 **Signing secret**（`whsec_…`）。
3. 写入服务器 `/srv/xingyi/.env`：
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. 后台「支付渠道」→ Stripe → 启用。

**对账**：Stripe 侧金额 = `amount_total`（最小货币单位），与订单 `amount_cents` 一致才落单；
币种用订单的 `currency`（小写传给 Stripe，回调里转回大写比对）。

---

## 二、PayPal

1. [PayPal Developer](https://developer.paypal.com/dashboard/applications) 建 App，取 **Client ID** 与 **Secret**。
2. 同一 App 里加 Webhook：
   - URL：`https://hishifu.oneding.tech/api/payments/paypal/webhook`
   - 事件：`PAYMENT.CAPTURE.COMPLETED`、`PAYMENT.CAPTURE.DENIED`
   - 创建后复制 **Webhook ID**。
3. 写入 `/srv/xingyi/.env`：
   ```
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_WEBHOOK_ID=...
   PAYPAL_MODE=live        # sandbox 为沙盒，不真扣款
   ```
4. 后台「支付渠道」→ PayPal → 启用。

**流程特点**：用户审批后回跳 `/{locale}/pay/{code}/paypal`，服务端**立即 capture**（真实扣款在这里发生），
再跳结果页。即使 webhook 没配，这条路径也能保证订单被确认；webhook 只会因为 `eventId` 不同而重复触发幂等逻辑。
未配 `PAYPAL_WEBHOOK_ID` 时不做签名复核，只处理 `PAYMENT.CAPTURE.*` 事件 —— **生产环境务必配上**。

---

## 三、微信支付（Native 扫码）

### 前置条件（硬门槛）

- 大陆主体**商户号**（微信支付商户平台开通），且已开通 **Native 支付**。
- 回调域名需可公网 HTTPS 访问；若后续要用 JSAPI / H5，域名还需 **ICP 备案**。
- 仅支持 **CNY**；订单币种不是 CNY 时该渠道直接返回 `wechat_cny_only`。

### 商户平台准备

1. 账户中心 → API 安全 → 申请 **API 证书**，得到：
   - `apiclient_cert.pem` / `apiclient_key.pem`（**私钥**用于请求签名）
   - 证书**序列号**（`WECHAT_SERIAL_NO`）
2. 同页设置 **APIv3 密钥**（32 位，`WECHAT_API_V3_KEY`，用于解密通知）。
3. 下载**微信支付平台证书**（`WECHAT_PLATFORM_CERT`，用于通知验签）。
   可用官方工具 `wechatpay-apache-httpclient` 或 `证书下载工具` 获取；
   也支持改用**平台公钥**（`WECHAT_PLATFORM_PUBLIC_KEY`）。
4. 产品中心 → 开发配置 → 支付回调地址填：
   `https://hishifu.oneding.tech/api/payments/wechat/webhook`

### 环境变量

```
WECHAT_APPID=wx...
WECHAT_MCHID=1234567890
WECHAT_SERIAL_NO=...
WECHAT_API_V3_KEY=32位密钥
WECHAT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
WECHAT_PLATFORM_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
```

PEM 里有换行，两种写法都支持：

- 直接写一行、用 `\n` 转义（脚本会自动还原）；
- 或写到文件，用 `WECHAT_PRIVATE_KEY_PATH=/srv/xingyi/certs/apiclient_key.pem`
  （`WECHAT_PLATFORM_CERT_PATH` 同理）。

> ⚠️ systemd 的 `EnvironmentFile` 不支持引号包裹，值里有空格/换行会解析失败。
> 建议 PEM **一律走 `*_PATH`**，把证书文件放 `/srv/xingyi/certs/` 并 `chmod 600`。

### 支付时序

1. 收银台点「微信支付」→ `POST /v3/pay/transactions/native`，`out_trade_no` = 订单号。
2. 返回 `code_url`，服务端渲染成 SVG 二维码（用 `qrcode` 包），前端每 3 秒查订单状态。
3. 用户扫码付款 → 微信 POST 通知 → 验签 → `AEAD_AES_256_GCM` 解密 → 落单。
4. `trade_state` 映射：`SUCCESS`→已付款，`CLOSED/REVOKED`→放弃，`PAYERROR/NOTPAY`→失败；
   `USERPAYING` 不落库（等用户付款）。

---

## 四、测试渠道

`mock` 渠道始终可配置（`PAYMENT_ENABLE_MOCK`，默认开），复刻「提交 → 延迟 → 带 HMAC 签名的异步通知」，
用于验收和演示，不产生真实扣款。**上线真实渠道后建议把它停掉。**

---

## 五、开关优先级

渠道是否出现在收银台 = **密钥配齐（环境变量）** AND **后台开关打开（settings 表）**。

- 密钥只存在服务器环境变量里，**不入库**，后台只显示「已配置 / 缺少哪些环境变量」。
- 改完 `/srv/xingyi/.env` 必须 `systemctl restart xingyi` 才生效。
- 后台「支付渠道」页会直接给出每个渠道的回调地址，照抄到渠道控制台即可。

## 六、验收清单

| 项 | 方法 |
|---|---|
| 渠道不配置不出现 | 清空某渠道环境变量 → 收银台看不到它，后台显示「缺少密钥」 |
| 通知验签 | 用错误签名 POST webhook → 401（微信返回 `FAIL`） |
| 幂等 | 同一条通知重复 POST → `duplicated:true`，不重复确认/发信 |
| 金额篡改 | 通知金额改成别的值 → `amount_mismatch` |
| 真实付款 | 各渠道沙盒/小额实测 → 订单 confirmed、名额 held→confirmed、收到确认邮件 |
