import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { Alipay, N_alipay_auth_type, T_opt_alipay } from './alipay';
import { Verification_error } from './error/verification_error';

describe('secret', () => {
  const key = process.env.alipay_id;
  const secret = process.env.alipay_secret;
  const alipay_pk = process.env.alipay_public_key;
  const notify_url = process.env.notify_url;

  if (!key || !secret || !alipay_pk) {
    console.warn('Require env: alipay_id, alipay_secret, alipay_pk');
    return;
  }

  const client = new Alipay({
    auth_type: N_alipay_auth_type.secret,
    id: key,
    secret,
    alipay_public_key: alipay_pk,
    notify_url: notify_url || 'https://payment.feature.giao.test.mosteast.com/payment/notify/aliapy',
  });

  it('pay_qrcode() using secret', async () => {
    const r = await client.pay_qrcode({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    console.info('Payment url:', r);
    expect(r).toBeTruthy();
  });
});

describe('cert', () => {
  const key = process.env.alipay_id;
  const secret = process.env.alipay_secret;
  const fee = process.env.alipay_fee;
  const tid = process.env.alipay_tid!;
  const legal_name = process.env.alipay_legal_name!;
  const notify_url = process.env.notify_url;
  if (!key || !secret || !tid || !legal_name) {
    console.warn('Require env: alipay_id, alipay_secret, alipay_tid, alipay_legal_name');
    return;
  }
  const opt = {
    auth_type: N_alipay_auth_type.cert,
    id: process.env.alipay_id!,
    secret: process.env.alipay_secret!,
    alipay_cert_content_root: readFileSync(__dirname + '/test_asset/alipay/alipayRootCert.crt'),
    alipay_cert_content_public: readFileSync(__dirname + '/test_asset/alipay/alipayCertPublicKey.crt'),
    alipay_cert_content_app: readFileSync(__dirname + '/test_asset/alipay/appCertPublicKey.crt'),
    notify_url: notify_url || 'https://payment.feature.giao.test.mosteast.com/payment/notify/aliapy',
  } as T_opt_alipay;

  const client = new Alipay(opt);

  it('pay_qrcode', async () => {
    const r = await client.pay_qrcode({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
      qrcode: {
        width: 200,
      },
    });
    expect(r.url).toBeTruthy();
    console.info('Payment URL: \n', r);
  });

  it('pay_mobile_web', async () => {
    const r = await client.pay_mobile_web({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    expect(r.url).toBeTruthy();
    console.info('Payment URL: \n', r);
  });

  it('pay_app', async () => {
    const r = await client.pay_app({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    expect(r.url).toBeTruthy();
    console.info('Payment URL: \n', r);
  });

  it('transfer', async () => {
    const r = await client.transfer({
      fee: fee! || '0.1',
      subject: 'Test order',
      legal_name,
      tid,
    });
    expect(r).toBeTruthy();
  });

  it('get_balance', async () => {
    const r = await client.get_balance();
    expect(r.total.length).toBeTruthy();
    expect(r.frozen?.length).toBeTruthy();
  });

  describe('order', () => {
    const unique = process.env.alipay_order_id;
    if (!unique) {
      console.warn('Require env: alipay_order_id');
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
      const refund_unique = process.env.alipay_refund_unique as string;
      const refund_refund = process.env.alipay_refund_fee as string;
      await client.refund({ unique: refund_unique, refund: refund_refund });
    });
  });

  describe('refund_query', () => {
    it('common', async () => {
      const refund_unique = process.env.alipay_refund_unique as string;
      const refund_refund = process.env.alipay_refund_fee as any;
      const r = await client.refund_query({
        unique: refund_unique,
        refund: refund_refund,
      });
      expect(r.ok).toBeTruthy();
      expect(r.refund).toBe(refund_refund);
      expect(r.pending).toBeFalsy();
      expect(r.raw).toBeTruthy();
    });
  });
});

it('holder', async () => {});
