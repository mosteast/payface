# Payface

TypeScript payment SDK for Alipay, Wechat Pay v3, and Stripe.

## Install

```bash
npm i payface
```

## What it does

- Create payment intents for QR / H5 / app / JSAPI flows, depending on provider
- Query and verify orders with normalized status fields
- Refund with provider-safe `refund_unique` support
- Parse payment notifications into a shared envelope
- Build provider-specific notify ACK payloads
- Close unpaid orders
- Expose thin operational helpers for bills, transfers, and payouts

## Unified receipt model

`query()` and `verify()` return a receipt with:

- `ok`: `true` only when the payment is confirmed as paid
- `status`: `pending | paid | closed | refunded | failed | unknown`
- `raw_status`: provider-native status
- `channel`: `alipay | tenpay | stripe`
- `fee`, `currency`, `created_at`, `paid_at`, `raw`

`refund_query()` returns:

- `ok`
- `pending`
- `status`: `pending | succeeded | canceled | failed | unknown`
- `raw_status`
- `channel`
- `refund`

## Quick examples

### Stripe Checkout

```ts
import { Stripe } from "payface";

const stripe = new Stripe({
  secret: process.env.stripe_secret!,
  webhook_secret: process.env.stripe_webhook_secret,
  currency: "usd",
});

const checkout = await stripe.pay_mobile_web({
  unique: "order_1001",
  fee: "10.99",
  subject: "Pro plan",
  success_url: "https://example.com/success",
  cancel_url: "https://example.com/cancel",
});
```

### Alipay refund with `refund_unique`

```ts
import { Alipay, N_alipay_auth_type } from "payface";

const alipay = new Alipay({
  auth_type: N_alipay_auth_type.secret,
  id: process.env.alipay_id!,
  secret: process.env.alipay_secret!,
  alipay_public_key: process.env.alipay_public_key!,
  notify_url: process.env.notify_url,
});

await alipay.refund({
  unique: "order_1001",
  refund_unique: "refund_1001_part_1",
  refund: "5.00",
});
```

### Wechat Pay notify parsing

```ts
import { Tenpay } from "payface";

const tenpay = new Tenpay({
  id: process.env.tenpay_id!,
  mch_id: process.env.tenpay_mchid!,
  notify_url: process.env.notify_url,
  h5_app_name: "Example Store",
  h5_app_url: "https://example.com",
  tenpay_cert_content_public: process.env.tenpay_cert_content_public!,
  tenpay_cert_content_private: process.env.tenpay_cert_content_private!,
  key_v3: process.env.tenpay_secret,
});

const envelope = await tenpay.parse_notify({
  body: rawBody,
  headers: req.headers as Record<string, string | string[] | undefined>,
});

return tenpay.build_notify_ack();
```

## Notification handling

Keep `verify_notify_sign()` only if you need the provider-native verification primitive. It is preserved for compatibility and should be treated as deprecated.

Prefer `parse_notify()` for new integrations. It returns a normalized envelope:

```ts
type NotifyEnvelope = {
  provider: "alipay" | "tenpay" | "stripe";
  kind: "payment" | "refund" | "subscription" | "transfer" | "unknown";
  unique?: string;
  refund_unique?: string;
  status: string;
  raw_status?: string;
  fee?: string;
  refund?: string;
  currency?: string;
  event_id?: string;
  occurred_at?: string;
  raw: unknown;
};
```

ACK helpers:

- Alipay: `{ statusCode: 200, body: "success" }`
- Wechat Pay v3: `{ statusCode: 200, body: { code: "SUCCESS", message: "成功" } }`
- Stripe: `{ statusCode: 200, body: "" }`

## Operational helpers

- `close({ unique })` on all three providers
- Alipay `download_bill({ bill_type, bill_date })`
- Tenpay `download_trade_bill(...)`, `download_fundflow_bill(...)`, `transfer(...)`, `query_transfer(...)`
- Stripe `create_payout(...)`, `get_payout(...)`, `cancel_payout(...)`, `create_transfer(...)`, `get_transfer(...)`

Provider-specific config worth setting explicitly:

- Alipay `return_url`
- Tenpay `h5_app_name`, `h5_app_url`

## Development

```bash
npm install --package-lock=false
npm run typecheck
npm run test:run
npm run coverage
npm run pack:check
```

This repo intentionally does not commit `package-lock.json`, so local setup and CI use `npm install --package-lock=false`.

See `.env.example` for integration-test variables and `examples/` for usage samples.
