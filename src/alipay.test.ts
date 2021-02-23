import { nanoid } from 'nanoid';
import { Alipay } from './alipay';

it('pay_qrcode', async () => {
  const key = process.env.alipay_id;
  const secret = process.env.alipay_secret;
  const alipay_pk = process.env.alipay_pk;
  const notify_url = process.env.notify_url;

  if ( ! key || ! secret || ! alipay_pk) {
    console.warn('Require env: alipay_id, alipay_secret, alipay_pk');
    return;
  }

  const row = new Alipay({ id: key, secret, alipay_pk, notify_url: notify_url || 'https://payment.feature.giao.test.mosteast.com/payment/notify/aliapy' });
  const r = await row.pay_qrcode({ fee: 0.1, order_id: 'test_' + nanoid(), subject: 'Test order' });
  console.info('Payment url:', r);
  expect(r).toBeTruthy();
});
