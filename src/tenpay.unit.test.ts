import { readFileSync } from 'fs';
import { Invalid_argument_external } from './error/invalid_argument';
import { Tenpay } from './tenpay';

const tenpay_cert_content_public = readFileSync(__dirname + '/test_asset/tenpay/apiclient_cert.pem');
const tenpay_cert_content_private = readFileSync(__dirname + '/test_asset/tenpay/apiclient_key.pem');
const key_v3 = '12345678901234567890123456789012';

function create_client() {
  return new Tenpay({
    id: 'wx_test_appid',
    mch_id: '1230000109',
    notify_url: 'https://example.com/notify',
    tenpay_cert_content_public,
    tenpay_cert_content_private,
    key_v3,
  });
}

describe('tenpay wrapper unit', () => {
  it('query should unwrap sdk response {status, data}', async () => {
    const client = create_client();
    const query = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        trade_state: 'SUCCESS',
        out_trade_no: 'order_100',
        amount: { total: 123 },
        success_time: '2026-02-23T12:00:00+08:00',
      },
    });
    (client as any).sdk = { query };

    const r = await client.query({ unique: 'order_100' });
    expect(query).toHaveBeenCalledWith({ out_trade_no: 'order_100' });
    expect(r?.ok).toBe(true);
    expect(r?.unique).toBe('order_100');
    expect(r?.fee).toBe('1.23');
    expect(r?.created_at).toBe('2026-02-23T12:00:00+08:00');
  });

  it('refund_query should query by out_refund_no and unwrap data', async () => {
    const client = create_client();
    const find_refunds = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        status: 'SUCCESS',
        amount: {
          refund: 10,
        },
      },
    });
    (client as any).sdk = { find_refunds };

    const r = await client.refund_query({ unique: 'order_200' });
    expect(find_refunds).toHaveBeenCalledWith('order_200_refund');
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(false);
    expect(r.refund).toBe('0.1');
  });

  it('refund should query status when create-refund request returns non-200', async () => {
    const client = create_client();
    const refunds = vi.fn().mockResolvedValue({
      status: 500,
      error: '{"code":"SYSTEM_ERROR","message":"busy"}',
    });
    const find_refunds = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        status: 'PROCESSING',
        amount: {
          refund: 100,
        },
      },
    });
    (client as any).sdk = { refunds, find_refunds };

    await expect(
      client.refund({
        unique: 'order_300',
        fee: '1',
        refund: '1',
      }),
    ).resolves.toBeUndefined();

    expect(refunds).toHaveBeenCalled();
    expect(find_refunds).toHaveBeenCalledWith('order_300_refund');
  });

  it('refund should reject when refund amount is greater than total fee', async () => {
    const client = create_client();
    (client as any).sdk = {
      refunds: vi.fn(),
      find_refunds: vi.fn(),
    };

    await expect(
      client.refund({
        unique: 'order_301',
        fee: '1',
        refund: '1.01',
      }),
    ).rejects.toThrow(Invalid_argument_external);
  });

  it('verify_notify_sign should verify signature before decryption', async () => {
    const client = create_client();
    const verifySign = vi.fn().mockResolvedValue(true);
    const decipher_gcm = vi.fn().mockReturnValue({
      trade_state: 'SUCCESS',
      out_trade_no: 'order_400',
      amount: { total: 100 },
    });
    (client as any).sdk = { verifySign, decipher_gcm };

    const body = {
      id: 'notify_1',
      create_time: '2026-02-23T12:00:00+08:00',
      resource_type: 'encrypt-resource',
      event_type: 'TRANSACTION.SUCCESS',
      summary: 'Payment success',
      resource: {
        original_type: 'transaction',
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext: 'cipher',
        associated_data: 'transaction',
        nonce: 'nonce123',
      },
    };

    const r = await client.verify_notify_sign({
      body,
      headers: {
        'wechatpay-timestamp': '1730000000',
        'wechatpay-nonce': 'nonce-sign',
        'wechatpay-serial': 'serial-1',
        'wechatpay-signature': 'signature-1',
      },
    });

    expect(verifySign).toHaveBeenCalledWith({
      timestamp: '1730000000',
      nonce: 'nonce-sign',
      serial: 'serial-1',
      signature: 'signature-1',
      body: JSON.stringify(body),
      apiSecret: key_v3,
    });
    expect(decipher_gcm).toHaveBeenCalled();
    expect(r.trade_state).toBe('SUCCESS');
  });

  it('verify_notify_sign should reject invalid signature', async () => {
    const client = create_client();
    const verifySign = vi.fn().mockResolvedValue(false);
    const decipher_gcm = vi.fn();
    (client as any).sdk = { verifySign, decipher_gcm };

    await expect(
      client.verify_notify_sign({
        body: '{"id":"notify_2","resource":{"ciphertext":"x","associated_data":"y","nonce":"z"}}' as any,
        headers: {
          'wechatpay-timestamp': '1730000000',
          'wechatpay-nonce': 'nonce-sign',
          'wechatpay-serial': 'serial-1',
          'wechatpay-signature': 'invalid',
        },
      }),
    ).rejects.toThrow(Invalid_argument_external);

    expect(decipher_gcm).not.toHaveBeenCalled();
  });
});
