import { Alipay, N_alipay_auth_type } from './alipay';
import { Invalid_state_external } from './error/invalid_state';
import { Verification_error } from './error/verification_error';

function create_client() {
  return new Alipay({
    auth_type: N_alipay_auth_type.secret,
    id: 'app_123',
    secret: 'private-key',
    alipay_public_key: 'public-key',
    notify_url: 'https://example.com/notify',
  });
}

describe('alipay wrapper unit', () => {
  it('query should treat WAIT_BUYER_PAY as unpaid', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
      outTradeNo: 'order_100',
      totalAmount: '10.00',
      tradeStatus: 'WAIT_BUYER_PAY',
    });
    (client as any).sdk = { exec };

    const r = await client.query({ unique: 'order_100' });

    expect(exec).toHaveBeenCalledWith('alipay.trade.query', {
      bizContent: { out_trade_no: 'order_100' },
    });
    expect(r?.ok).toBe(false);
    expect(r?.status).toBe('pending');
    expect(r?.raw_status).toBe('WAIT_BUYER_PAY');
    expect(r?.channel).toBe('alipay');
    expect(r?.unique).toBe('order_100');
    expect(r?.fee).toBe('10');
  });

  it('query should treat TRADE_SUCCESS as paid', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
      outTradeNo: 'order_101',
      totalAmount: '10.00',
      sendPayDate: '2026-02-23 12:00:00',
      tradeStatus: 'TRADE_SUCCESS',
    });
    (client as any).sdk = { exec };

    const r = await client.query({ unique: 'order_101' });

    expect(r?.ok).toBe(true);
    expect(r?.status).toBe('paid');
    expect(r?.unique).toBe('order_101');
    expect(r?.created_at).toBe('2026-02-23T04:00:00.000Z');
  });

  it('query should map TRADE_CLOSED to closed status', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
      outTradeNo: 'order_101b',
      totalAmount: '10.00',
      tradeStatus: 'TRADE_CLOSED',
    });
    (client as any).sdk = { exec };

    const r = await client.query({ unique: 'order_101b' });

    expect(r?.ok).toBe(false);
    expect(r?.status).toBe('closed');
  });

  it('query should return undefined for ACQ.TRADE_NOT_EXIST', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '40004',
      msg: 'Business Failed',
      subCode: 'ACQ.TRADE_NOT_EXIST',
      subMsg: 'Trade not exists',
    });
    (client as any).sdk = { exec };

    await expect(client.query({ unique: 'missing_order' })).resolves.toBeUndefined();
  });

  it('query should throw for malformed gateway responses', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({});
    (client as any).sdk = { exec };

    await expect(client.query({ unique: 'broken_order' })).rejects.toThrow(Invalid_state_external);
  });

  it('verify should throw for unpaid trade status', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
      outTradeNo: 'order_102',
      totalAmount: '10.00',
      tradeStatus: 'WAIT_BUYER_PAY',
    });
    (client as any).sdk = { exec };

    await expect(client.verify({ unique: 'order_102' })).rejects.toThrow(Verification_error);
  });

  it('refund should use alipay.trade.refund with out_request_no', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
      refundFee: '1.00',
    });
    (client as any).sdk = { exec };

    await client.refund({
      unique: 'order_103',
      refund: '1',
      refund_unique: 'refund_103',
    });

    expect(exec).toHaveBeenCalledWith('alipay.trade.refund', {
      bizContent: {
        out_trade_no: 'order_103',
        refund_amount: '1',
        out_request_no: 'refund_103',
      },
    });
  });

  it('refund_query should use the dedicated refund query API', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
      outRequestNo: 'refund_104',
      refundAmount: '1.00',
      refundStatus: 'REFUND_SUCCESS',
    });
    (client as any).sdk = { exec };

    const r = await client.refund_query({
      unique: 'order_104',
      refund_unique: 'refund_104',
    });

    expect(exec).toHaveBeenCalledWith('alipay.trade.fastpay.refund.query', {
      bizContent: {
        out_trade_no: 'order_104',
        out_request_no: 'refund_104',
      },
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('succeeded');
    expect(r.channel).toBe('alipay');
    expect(r.refund).toBe('1');
  });

  it('parse_notify should normalize a verified payment notification', async () => {
    const client = create_client();
    const checkNotifySign = vi.fn().mockResolvedValue(true);
    (client as any).sdk = { checkNotifySign };

    const raw = {
      out_trade_no: 'order_notify_1',
      total_amount: '10.00',
      trade_status: 'TRADE_SUCCESS',
      notify_time: '2026-02-23 12:00:00',
    };

    const r = await client.parse_notify(raw);

    expect(checkNotifySign).toHaveBeenCalledWith(raw);
    expect(r.provider).toBe('alipay');
    expect(r.kind).toBe('payment');
    expect(r.unique).toBe('order_notify_1');
    expect(r.status).toBe('paid');
  });

  it('build_notify_ack should return alipay success body', () => {
    const client = create_client();
    expect(client.build_notify_ack()).toEqual({
      statusCode: 200,
      body: 'success',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  });

  it('supports should expose provider capabilities', () => {
    const client = create_client();
    expect(client.supports('pay_qrcode')).toBe(true);
    expect(client.supports('pay_app')).toBe(true);
    expect(client.supports('close')).toBe(true);
    expect(client.supports('pay_jsapi')).toBe(false);
  });

  it('close should call alipay.trade.close', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
    });
    (client as any).sdk = { exec };

    await client.close({ unique: 'order_close_1' });

    expect(exec).toHaveBeenCalledWith('alipay.trade.close', {
      bizContent: { out_trade_no: 'order_close_1' },
    });
  });

  it('download_bill should call the alipay bill download API', async () => {
    const client = create_client();
    const exec = vi.fn().mockResolvedValue({
      code: '10000',
      msg: 'Success',
      billDownloadUrl: 'https://alipay.example.com/bill.csv',
    });
    (client as any).sdk = { exec };

    const r = await client.download_bill({
      bill_type: 'trade',
      bill_date: '2026-02-23',
    });

    expect(exec).toHaveBeenCalledWith('alipay.data.dataservice.bill.downloadurl.query', {
      bizContent: {
        bill_type: 'trade',
        bill_date: '2026-02-23',
      },
    });
    expect(r.url).toBe('https://alipay.example.com/bill.csv');
  });
});
