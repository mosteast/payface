import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { Alipay, N_alipay_auth_type, T_opt_alipay } from './alipay';
import { Verification_error } from './error/verification_error';

const key = process.env.alipay_id;
const secret = process.env.alipay_secret;
const alipay_pk = process.env.alipay_public_key;
const notify_url = process.env.notify_url;

const has_secret_env = Boolean(key && secret && alipay_pk);
if (!has_secret_env) {
  console.warn('Require env: alipay_id, alipay_secret, alipay_pk');
}

describe('secret', () => {
  const it_secret = has_secret_env ? it : it.skip;
  it_secret('pay_qrcode() using secret', async () => {
    const client = new Alipay({
      auth_type: N_alipay_auth_type.secret,
      id: key!,
      secret: secret!,
      alipay_public_key: alipay_pk!,
      notify_url: notify_url || 'https://payment.feature.giao.test.mosteast.com/payment/notify/aliapy',
    });

    const r = await client.pay_qrcode({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    console.info('Payment url:', r);
    expect(r).toBeTruthy();
  });
});

const tid = process.env.alipay_tid;
const legal_name = process.env.alipay_legal_name;
const has_cert_env = Boolean(key && secret && tid && legal_name);
if (!has_cert_env) {
  console.warn('Require env: alipay_id, alipay_secret, alipay_tid, alipay_legal_name');
}

const cert_client = () =>
  new Alipay({
    auth_type: N_alipay_auth_type.cert,
    id: key!,
    secret: secret!,
    alipay_cert_content_root: readFileSync(__dirname + '/test_asset/alipay/alipayRootCert.crt'),
    alipay_cert_content_public: readFileSync(__dirname + '/test_asset/alipay/alipayCertPublicKey.crt'),
    alipay_cert_content_app: readFileSync(__dirname + '/test_asset/alipay/appCertPublicKey.crt'),
    notify_url: notify_url || 'https://payment.feature.giao.test.mosteast.com/payment/notify/aliapy',
  } as T_opt_alipay);

describe('cert', () => {
  const fee = process.env.alipay_fee;
  const it_cert = has_cert_env ? it : it.skip;

  it_cert('pay_qrcode', async () => {
    const client = cert_client();
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

  it_cert('pay_mobile_web', async () => {
    const client = cert_client();
    const r = await client.pay_mobile_web({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    expect(r.url).toBeTruthy();
    console.info('Payment URL: \n', r);
  });

  it_cert('pay_app', async () => {
    const client = cert_client();
    const r = await client.pay_app({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    expect(r.url).toBeTruthy();
    console.info('Payment URL: \n', r);
  });

  it_cert('transfer', async () => {
    const client = cert_client();
    const r = await client.transfer({
      fee: fee! || '0.1',
      subject: 'Test order',
      legal_name: legal_name!,
      tid: tid!,
    });
    expect(r).toBeTruthy();
  });

  it_cert('get_balance', async () => {
    const client = cert_client();
    const r = await client.get_balance();
    expect(r.total.length).toBeTruthy();
    expect(r.frozen?.length).toBeTruthy();
  });

  const unique = process.env.alipay_order_id;
  const has_order_env = Boolean(has_cert_env && unique);
  if (!unique) {
    console.warn('Require env: alipay_order_id');
  }

  describe('order', () => {
    const it_order = has_order_env ? it : it.skip;

    it_order('query', async () => {
      const client = cert_client();
      const r = await client.query({ unique: unique! });
      expect(r?.ok).toBeTruthy();
      expect(r?.unique).toBeTruthy();
      expect(r?.created_at).toBeTruthy();
      expect(r?.fee).toBeTruthy();
    });

    it_order('verify', async () => {
      const client = cert_client();
      await expect(client.verify({ unique: unique! })).resolves.not.toThrow();
      await expect(client.verify({ unique: 'invalid_order_90971234' })).rejects.toThrow(Verification_error);
    });
  });

  const refund_unique = process.env.alipay_refund_unique;
  const refund_refund = process.env.alipay_refund_fee;
  const has_refund_env = Boolean(has_cert_env && refund_unique && refund_refund);
  if (!refund_unique || !refund_refund) {
    console.warn('Require env: alipay_refund_unique, alipay_refund_fee');
  }

  describe('refund', () => {
    const it_refund = has_refund_env ? it : it.skip;
    it_refund('common', async () => {
      const client = cert_client();
      await client.refund({ unique: refund_unique!, refund: refund_refund! });
    });
  });

  describe('refund_query', () => {
    const it_refund_query = has_refund_env ? it : it.skip;
    it_refund_query('common', async () => {
      const client = cert_client();
      const r = await client.refund_query({
        unique: refund_unique!,
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
