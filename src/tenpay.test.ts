import { nanoid } from 'nanoid';
import { Tenpay } from './tenpay';

it('pay_qrcode', async () => {
  const id = process.env.tenpay_id;
  const secret = process.env.tenpay_secret;
  const mchid = process.env.tenpay_mchid;

  if ( ! id || ! secret || ! mchid) {
    console.warn('Empty env: tenpay_id or tenpay_secret or tenpay_mchid');
    return;
  }

  const row = new Tenpay({ id, secret, mchid, notify_url: 'https://example.com' });
  const r = await row.pay_qrcode({ fee: 0.1, order_id: 'test_' + nanoid(), subject: 'Test order' });
  console.info('Payment url:', r);
  expect(r).toBeTruthy();
});
