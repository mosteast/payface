import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import { Alipay, N_alipay_auth_type } from './alipay';

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
    const r = await client.pay_qrcode({ fee: 0.1, order_id: 'test_' + nanoid(), subject: 'Test order' });
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
    alipay_root_cert: readFileSync(__dirname + '/test_asset/alipayRootCert.crt'),
    alipay_public_cert: readFileSync(__dirname + '/test_asset/alipayCertPublicKey.crt'),
    app_cert: readFileSync(__dirname + '/test_asset/appCertPublicKey.crt'),
    notify_url: notify_url || 'https://payment.feature.giao.test.mosteast.com/payment/notify/aliapy',
  };
  // console.log(opt);

  const client = new Alipay(opt);

  it('pay_qrcode()', async () => {
    const r = await client.pay_qrcode({ fee: 0.1, order_id: 'test_' + nanoid(), subject: 'Test order' });
    console.info('Payment URL: \n', r);
  });

  it('transfer()', async () => {
    const r = await client.transfer({ fee: parseFloat(fee!) || 0.1, subject: 'Test order', legal_name, tid });
    expect(r).toBeTruthy();
  });

  it('get_balance', async () => {
    const r = await client.get_balance();
    expect(r.total.length).toBeTruthy();
    expect(r.frozen?.length).toBeTruthy();
  });
});

it('holder', async () => {
});
