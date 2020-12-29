import { nanoid } from 'nanoid';
import { Alipay } from './alipay';

it('pay_qrcode', async () => {
  const key = process.env.alipay_id;
  const secret = process.env.alipay_secret;

  if ( ! key || ! secret) {
    console.warn('Empty env: alipay_id or alipay_secret');
    return;
  }

  const row = new Alipay({ id: key, secret, notify_url: 'https://example.com' });
  const r = await row.pay_qrcode({ fee: 0.1, order_id: 'test_' + nanoid(), subject: 'Test order' });
  console.info('Payment url:', r);
  expect(r).toBeTruthy();
});
