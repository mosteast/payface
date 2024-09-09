import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import { Verification_error } from './error/verification_error';
import { Tenpay } from './tenpay';

const id = process.env.tenpay_id as string;
const mchid = process.env.tenpay_mchid as string;
const secret = process.env.tenpay_secret as string;
const tenpay_cert_content_public = readFileSync(__dirname + '/test_asset/tenpay/apiclient_cert.pem');
const tenpay_cert_content_private = readFileSync(__dirname + '/test_asset/tenpay/apiclient_key.pem');
const openid = process.env.tenpay_openid as string;

if (!id || !mchid || !secret) {
  console.warn(`Empty env: {tenpay_id:${id}} or {tenpay_mchid:${mchid}} or {tenpay_secret:${secret}}`);
}

let client: Tenpay;
beforeEach(() => {
  client = new Tenpay({
    id,
    secret,
    mch_id: mchid,
    notify_url: 'https://example.com',
    tenpay_cert_content_public,
    tenpay_cert_content_private,
  });
});

it('pay_qrcode', async () => {
  const r = await client.pay_qrcode({
    fee: '0.1',
    unique: 'test_' + nanoid(),
    subject: 'Test order',
    client_ip: '123.139.93.107',
  });
  expect(r.url).toBeTruthy();
  console.info('Payment url:', r.url);
});

it('mobile_web', async () => {
  const r = await client.pay_mobile_web({
    fee: '0.1',
    unique: 'test_' + nanoid(),
    subject: 'Test order',
    client_ip: '123.139.93.107',
  });
  expect(r).toBeTruthy();
  expect(r.url).toBeTruthy();
  console.info('Payment url:', r.url);
});

it('pay_app', async () => {
  const r = await client.pay_app({
    fee: '0.1',
    unique: 'test_' + nanoid(),
    subject: 'Test order',
    client_ip: '123.139.93.107',
  });
  expect(r.prepay_id).toBeTruthy();
  expect(r.timestamp_sign).toBeTruthy();
  expect(parseInt(r.timestamp_sign as string)).toBeTruthy();
  console.info('prepay_id', r.prepay_id);
});
it('pay_jsapi', async () => {
  const r = await client.pay_jsapi({
    fee: '0.1',
    unique: 'test_' + nanoid(),
    subject: 'Test order',
    client_ip: '123.139.93.107',
    openid,
  });
  expect(r.prepay_id).toBeTruthy();
  expect(r.timestamp_sign).toBeTruthy();
  expect(parseInt(r.timestamp_sign as string)).toBeTruthy();
  console.info('prepay_id', r.prepay_id);
});

describe('order', () => {
  const unique = process.env.tenpay_order_id;
  if (!unique) {
    console.warn('Require env: tenpay_order_id');
    return;
  }

  it('query', async () => {
    const r = await client.query({ unique });
    expect(r?.ok).toBeTruthy();
    expect(r?.unique).toBeTruthy();
    expect(r?.created_at).toBeTruthy();
    expect(r?.fee).toBeTruthy();
  });

  it('verify', async () => {
    await expect(client.verify({ unique })).resolves.not.toThrow();
    await expect(client.verify({ unique: 'invalid_order_90971234' })).rejects.toThrow(Verification_error);
  });
});

describe('refund', () => {
  it('common', async () => {
    const refund_unique = process.env.tenpay_refund_unique as string;
    const refund_fee = process.env.tenpay_refund_fee as any;
    const refund_refund = process.env.tenpay_refund_fee as any;
    if (!refund_unique || !refund_fee || !refund_refund) {
      console.warn('Require env: tenpay_refund_unique, tenpay_refund_fee, tenpay_refund_refund');
      return;
    }
    await client.refund({
      unique: refund_unique,
      fee: refund_fee,
      refund: refund_refund,
    });
  });
});

describe('refund_query', () => {
  it('common', async () => {
    const refund_unique = process.env.tenpay_refund_unique as string;
    const refund_refund = process.env.tenpay_refund_fee as any;
    if (!refund_unique || !refund_refund) {
      console.warn('Require env: tenpay_refund_unique, tenpay_refund_fee, tenpay_refund_refund');
      return;
    }

    const r = await client.refund_query({ unique: refund_unique });
    expect(r.ok).toBeTruthy();
    expect(r.refund).toBe(refund_refund);
    expect(r.pending).toBeFalsy();
    expect(r.raw).toBeTruthy();
  });
});

// describe('parse_notification/verify_notify_sign', () => {
//   const raw = {
//     id: 'c3f65444-8a57-5b56-869e-92cbddc1df33',
//     create_time: '2022-11-17T20:38:59+08:00',
//     resource_type: 'encrypt-resource',
//     event_type: 'TRANSACTION.SUCCESS',
//     summary: '支付成功',
//     resource: {
//       original_type: 'transaction',
//       aithm: 'AEAD_AES_256_GCM',
//       ciphertext:
//         '8budXaFzlY4cZaNnwovQTwOJjSSY1TulSVGAtnP2bh9Oc/09e+9MnEK+OJF047va3BlMhdDnfmXysmilO/Xf6LpksZfYBNn2w0hzOWIwk7vtRW9hk1S/8+rwj8Aj6+NH0PvFxzBqAsOVMvvMYCvt/FI5SVKefzgHNfJ74UGNezARztqZt/BZFQF+XTFgEduwanvWR6HrCcpy5n1frB9B+HjfKS3ZCsqVhHSvURAS+Gc45Pgv/uGDFBM/sogoYrlf5kezM5mZchPDuZjkQp7+fyl6ONW8b/34RYTlHCxq5LB1octHknGMdD9iC7BgHYG6rqnCUIA//al3hHngXyK1urnIfmi3iFNfDRIxNXHRZJ2pDmwXuxAQEqpJ6sz6vNCcSPazQwqRqKQD3m889qzKpC9yX73xOd1AwUyDKkqkUWtcNP/S82G2eizFMKIqrp4pOaSBUIbxIitAAxtyFeqVefxad1HcZnPmI6C4cgPW5+k/YRvFIUaCapT16PV3PEZVRvesQRA5ney5S3NXcz9KtWNQaePpxqzr1+LSRZtONizXFDm7oAYCnS2uT7s=',
//       associated_data: 'transaction',
//       nonce: 'b43YbME3roU2',
//     },
//   };
//
//   it('parse_notification', async () => {
//     const r = await client.parse_notification(raw);
//     expect(r).toBeTruthy();
//     expect(r.amount).toBeTruthy();
//     expect(r.out_trade_no).toBeTruthy();
//   });
//
//   it('verify_notify_sign', async () => {
//     const r = await client.verify_notify_sign(raw);
//     expect(r).toBeTruthy();
//   });
// });
