import { Tenpay } from './tenpay';

it('pay_qrcode', async () => {
  const id = process.env.test_tenpay_id;
  const secret = process.env.test_tenpay_secret;
  const mchid = process.env.test_tenpay_mchid;

  if ( ! id || ! secret || ! mchid) {
    console.warn('Empty env: test_tenpay_id or test_tenpay_secret or test_tenpay_mchid');
    return;
  }

  const row = new Tenpay({ id, secret, mchid });
  const r = await row.pay_qrcode();
  expect(r).toBeTruthy();
});
