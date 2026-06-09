import { readFileSync } from 'fs';
import { Invalid_argument_external } from './error/invalid_argument';
import { Invalid_state_external } from './error/invalid_state';
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
    expect(r?.status).toBe('paid');
    expect(r?.channel).toBe('tenpay');
    expect(r?.unique).toBe('order_100');
    expect(r?.fee).toBe('1.23');
    expect(r?.created_at).toBe('2026-02-23T12:00:00+08:00');
  });

  it('query should map NOTPAY to pending status', async () => {
    const client = create_client();
    const query = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        trade_state: 'NOTPAY',
        out_trade_no: 'order_100b',
        amount: { total: 123 },
      },
    });
    (client as any).sdk = { query };

    const r = await client.query({ unique: 'order_100b' });
    expect(r?.ok).toBe(false);
    expect(r?.status).toBe('pending');
  });

  it('query should return undefined for 404 not found', async () => {
    const client = create_client();
    const query = vi.fn().mockResolvedValue({
      status: 404,
      data: {},
    });
    (client as any).sdk = { query };

    await expect(client.query({ unique: 'missing_order' })).resolves.toBeUndefined();
  });

  it('verify should preserve provider query errors', async () => {
    const client = create_client();
    const query = vi.fn().mockResolvedValue({
      status: 500,
      error: '{"code":"SYSTEM_ERROR","message":"busy"}',
    });
    (client as any).sdk = { query };

    await expect(client.verify({ unique: 'broken_order' })).rejects.toThrow(Invalid_state_external);
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
    expect(r.status).toBe('succeeded');
    expect(r.channel).toBe('tenpay');
    expect(r.refund).toBe('0.1');
  });

  it('refund should use custom refund_unique when provided', async () => {
    const client = create_client();
    const refunds = vi.fn().mockResolvedValue({ status: 200, data: { status: 'SUCCESS' } });
    (client as any).sdk = { refunds };

    await client.refund({
      unique: 'order_201',
      refund_unique: 'refund_201',
      fee: '1',
      refund: '1',
    });

    expect(refunds).toHaveBeenCalledWith(
      expect.objectContaining({
        out_trade_no: 'order_201',
        out_refund_no: 'refund_201',
      }),
    );
  });

  it('refund_query should use custom refund_unique when provided', async () => {
    const client = create_client();
    const find_refunds = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        status: 'PROCESSING',
        amount: { refund: 10 },
      },
    });
    (client as any).sdk = { find_refunds };

    const r = await client.refund_query({ unique: 'order_202', refund_unique: 'refund_202' });

    expect(find_refunds).toHaveBeenCalledWith('refund_202');
    expect(r.pending).toBe(true);
    expect(r.status).toBe('pending');
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

  it('pay_mobile_web should use configured h5 app metadata', async () => {
    const client = new Tenpay({
      id: 'wx_test_appid',
      mch_id: '1230000109',
      notify_url: 'https://example.com/notify',
      h5_app_name: 'Example Store',
      h5_app_url: 'https://example.com',
      tenpay_cert_content_public,
      tenpay_cert_content_private,
      key_v3,
    });
    const transactions_h5 = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        h5_url: 'https://wx.tenpay.com/pay',
      },
    });
    (client as any).sdk = { transactions_h5 };

    await client.pay_mobile_web({
      unique: 'order_350',
      subject: 'Pro plan',
      fee: '10',
      client_ip: '127.0.0.1',
    });

    expect(transactions_h5).toHaveBeenCalledWith(
      expect.objectContaining({
        scene_info: expect.objectContaining({
          h5_info: {
            type: 'Wap',
            app_name: 'Example Store',
            app_url: 'https://example.com',
          },
        }),
      }),
    );
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

  it('parse_notify should normalize decrypted payment notification', async () => {
    const client = create_client();
    const verifySign = vi.fn().mockResolvedValue(true);
    const decipher_gcm = vi.fn().mockReturnValue({
      trade_state: 'SUCCESS',
      out_trade_no: 'order_401',
      amount: { total: 100 },
    });
    (client as any).sdk = { verifySign, decipher_gcm };

    const r = await client.parse_notify({
      body: {
        resource: {
          ciphertext: 'cipher',
          associated_data: 'transaction',
          nonce: 'nonce123',
        },
      } as any,
      headers: {
        'wechatpay-timestamp': '1730000000',
        'wechatpay-nonce': 'nonce-sign',
        'wechatpay-serial': 'serial-1',
        'wechatpay-signature': 'signature-1',
      },
    });

    expect(r.provider).toBe('tenpay');
    expect(r.kind).toBe('payment');
    expect(r.unique).toBe('order_401');
    expect(r.status).toBe('paid');
  });

  it('build_notify_ack should return tenpay success body', () => {
    const client = create_client();
    expect(client.build_notify_ack()).toEqual({
      statusCode: 200,
      body: { code: 'SUCCESS', message: '成功' },
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  });

  it('supports should expose provider capabilities', () => {
    const client = create_client();
    expect(client.supports('pay_qrcode')).toBe(true);
    expect(client.supports('pay_jsapi')).toBe(true);
    expect(client.supports('close')).toBe(true);
    expect(client.supports('transfer')).toBe(true);
  });

  it('close should call the sdk close method', async () => {
    const client = create_client();
    const close = vi.fn().mockResolvedValue({ status: 204 });
    (client as any).sdk = { close };

    await client.close({ unique: 'order_close_tenpay' });

    expect(close).toHaveBeenCalledWith('order_close_tenpay');
  });

  it('download_trade_bill should call the tradebill sdk method', async () => {
    const client = create_client();
    const tradebill = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        download_url: 'https://wechat.example.com/tradebill',
      },
    });
    (client as any).sdk = { tradebill };

    const r = await client.download_trade_bill({
      bill_date: '2026-02-23',
      bill_type: 'ALL',
    });

    expect(tradebill).toHaveBeenCalledWith({
      bill_date: '2026-02-23',
      bill_type: 'ALL',
    });
    expect(r.url).toBe('https://wechat.example.com/tradebill');
  });

  it('download_fundflow_bill should call the fundflowbill sdk method', async () => {
    const client = create_client();
    const fundflowbill = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        download_url: 'https://wechat.example.com/fundflowbill',
      },
    });
    (client as any).sdk = { fundflowbill };

    const r = await client.download_fundflow_bill({
      bill_date: '2026-02-23',
      account_type: 'BASIC',
    });

    expect(fundflowbill).toHaveBeenCalledWith({
      bill_date: '2026-02-23',
      account_type: 'BASIC',
    });
    expect(r.url).toBe('https://wechat.example.com/fundflowbill');
  });

  it('transfer should create a one-detail transfer batch', async () => {
    const client = create_client();
    const batches_transfer = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        out_batch_no: 'batch_1',
        batch_id: 'wx_batch_1',
      },
    });
    (client as any).sdk = { batches_transfer };

    const r = await client.transfer({
      unique: 'batch_1',
      tid: 'openid_1',
      fee: '10',
      subject: 'Withdraw',
    });

    expect(batches_transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        out_batch_no: 'batch_1',
        total_amount: 1000,
        total_num: 1,
        transfer_detail_list: [
          expect.objectContaining({
            out_detail_no: 'batch_1_detail_1',
            openid: 'openid_1',
            transfer_amount: 1000,
            transfer_remark: 'Withdraw',
          }),
        ],
      }),
    );
    expect(r.raw.batch_id).toBe('wx_batch_1');
  });

  it('query_transfer should query by out_batch_no', async () => {
    const client = create_client();
    const query_batches_transfer_list = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        transfer_batch: {
          out_batch_no: 'batch_2',
          batch_status: 'FINISHED',
        },
      },
    });
    (client as any).sdk = { query_batches_transfer_list };

    const r = await client.query_transfer({ unique: 'batch_2' });

    expect(query_batches_transfer_list).toHaveBeenCalledWith({
      out_batch_no: 'batch_2',
      need_query_detail: false,
    });
    expect(r.raw.transfer_batch.out_batch_no).toBe('batch_2');
  });
});
