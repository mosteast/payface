import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { Alipay, N_alipay_auth_type, T_opt_alipay } from './alipay';
import { Verification_error } from './error/verification_error';

const should_run_integration = process.env.PAYFACE_RUN_INTEGRATION === '1';
const key = process.env.alipay_id;
const secret = process.env.alipay_secret;
const alipay_pk = process.env.alipay_public_key;
const notify_url = process.env.notify_url;

const has_secret_env = Boolean(key && secret && alipay_pk);
const describe_secret = should_run_integration && has_secret_env ? describe : describe.skip;

describe_secret('secret', () => {
  it('pay_qrcode() using secret', async () => {
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
const describe_cert = should_run_integration && has_cert_env ? describe : describe.skip;

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

describe_cert('cert', () => {
  const fee = process.env.alipay_fee;

  it('pay_qrcode', async () => {
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

  it('pay_mobile_web', async () => {
    const client = cert_client();
    const r = await client.pay_mobile_web({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    expect(r.url).toBeTruthy();
    console.info('Payment URL: \n', r);
  });

  it('pay_app', async () => {
    const client = cert_client();
    const r = await client.pay_app({
      fee: 0.1,
      unique: 'test_' + nanoid(),
      subject: 'Test order',
    });
    expect(r.url).toBeTruthy();
    console.info('Payment URL: \n', r);
  });

  it('transfer', async () => {
    const client = cert_client();
    const r = await client.transfer({
      fee: fee! || '0.1',
      subject: 'Test order',
      legal_name: legal_name!,
      tid: tid!,
    });
    expect(r).toBeTruthy();
  });

  it('get_balance', async () => {
    const client = cert_client();
    const r = await client.get_balance();
    expect(r.total.length).toBeTruthy();
    expect(r.frozen?.length).toBeTruthy();
  });

  const unique = process.env.alipay_order_id;
  const has_order_env = Boolean(has_cert_env && unique);
  const describe_order = should_run_integration && has_order_env ? describe : describe.skip;

  describe_order('order', () => {
    it('query', async () => {
      const client = cert_client();
      const r = await client.query({ unique: unique! });
      expect(r?.ok).toBeTruthy();
      expect(r?.unique).toBeTruthy();
      expect(r?.created_at).toBeTruthy();
      expect(r?.fee).toBeTruthy();
    });

    it('verify', async () => {
      const client = cert_client();
      await expect(client.verify({ unique: unique! })).resolves.not.toThrow();
      await expect(client.verify({ unique: 'invalid_order_90971234' })).rejects.toThrow(Verification_error);
    });
  });

  const refund_unique = process.env.alipay_refund_unique;
  const refund_refund = process.env.alipay_refund_fee;
  const has_refund_env = Boolean(has_cert_env && refund_unique && refund_refund);
  const describe_refund = should_run_integration && has_refund_env ? describe : describe.skip;

  describe_refund('refund', () => {
    it('common', async () => {
      const client = cert_client();
      await client.refund({ unique: refund_unique!, refund: refund_refund! });
    });
  });

  describe_refund('refund_query', () => {
    it('common', async () => {
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
