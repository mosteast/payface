import { Alipay } from './alipay';

it('pay_qrcode', async () => {
  const key = process.env.test_alipay_key;
  const secret = process.env.test_alipay_secret;

  if ( ! key || ! secret) {
    console.warn('Empty env: test_alipay_key or test_alipay_secret');
    return;
  }

  const row = new Alipay({ key, secret });
  const r = await row.pay_qrcode();
  expect(r).toBeTruthy();
});
