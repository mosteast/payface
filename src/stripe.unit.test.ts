import { Invalid_argument_external } from './error/invalid_argument';
import { Verification_error } from './error/verification_error';
import { N_stripe_checkout_mode, Stripe } from './stripe';

function create_client(trusted_event_types?: string[]) {
  return new Stripe({
    secret: 'sk_test_123',
    webhook_secret: 'whsec_123',
    currency: 'usd',
    trusted_event_types,
  });
}

describe('stripe wrapper unit', () => {
  function search_mocks() {
    return {
      paymentIntents: {
        search: vi.fn().mockResolvedValue({ data: [] }),
      },
      subscriptions: {
        search: vi.fn().mockResolvedValue({ data: [] }),
      },
    };
  }

  it('pay_qrcode should throw not supported', async () => {
    const client = create_client();
    await expect(client.pay_qrcode({})).rejects.toThrow(Invalid_argument_external);
  });

  it('pay_mobile_web should create checkout session in payment mode', async () => {
    const client = create_client();
    const create = vi.fn().mockResolvedValue({
      id: 'cs_test_100',
      url: 'https://checkout.stripe.com/c/pay/cs_test_100',
    });
    (client as any).sdk = {
      checkout: {
        sessions: { create },
      },
    };

    const r = await client.pay_mobile_web({
      unique: 'order_100',
      subject: 'Premium',
      fee: '10.5',
      success_url: 'https://app.example.com/success',
      cancel_url: 'https://app.example.com/cancel',
      product_id: 'p_1',
      client_ip: '1.2.3.4',
    });

    expect(r.url).toBe('https://checkout.stripe.com/c/pay/cs_test_100');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        client_reference_id: 'order_100',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      }),
      { idempotencyKey: 'order_100' },
    );
  });

  it('pay_mobile_web should require price_id in subscription mode', async () => {
    const client = create_client();
    (client as any).sdk = {
      checkout: {
        sessions: { create: vi.fn() },
      },
    };

    await expect(
      client.pay_mobile_web({
        unique: 'order_200',
        mode: N_stripe_checkout_mode.subscription,
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      }),
    ).rejects.toThrow(/price_id/i);
  });

  it('query should map paid checkout session into receipt', async () => {
    const client = create_client();
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'cs_test_300',
          mode: 'payment',
          status: 'complete',
          payment_status: 'paid',
          created: 1730000000,
          currency: 'usd',
          amount_total: 1099,
          client_reference_id: 'order_300',
          payment_intent: {
            id: 'pi_300',
            status: 'succeeded',
            created: 1730000000,
            currency: 'usd',
            amount_received: 1099,
          },
        },
      ],
    });
    (client as any).sdk = {
      ...search_mocks(),
      checkout: {
        sessions: { list },
      },
    };

    const r = await client.query({ unique: 'order_300' });
    expect(r?.ok).toBe(true);
    expect(r?.status).toBe('paid');
    expect(r?.channel).toBe('stripe');
    expect(r?.unique).toBe('order_300');
    expect(r?.fee).toBe('10.99');
    expect(r?.paid_at).toBe('2024-10-27T03:33:20.000Z');
  });

  it('verify should throw when session is unpaid', async () => {
    const client = create_client();
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'cs_test_400',
          mode: 'payment',
          status: 'open',
          payment_status: 'unpaid',
          created: 1730000000,
          currency: 'usd',
          amount_total: 1000,
          client_reference_id: 'order_400',
          payment_intent: null,
        },
      ],
    });
    (client as any).sdk = {
      ...search_mocks(),
      checkout: {
        sessions: { list },
      },
    };

    await expect(client.verify({ unique: 'order_400' })).rejects.toThrow(Verification_error);
  });

  it('query should map unpaid checkout session to pending status', async () => {
    const client = create_client();
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'cs_test_401',
          mode: 'payment',
          status: 'open',
          payment_status: 'unpaid',
          created: 1730000000,
          currency: 'usd',
          amount_total: 1000,
          client_reference_id: 'order_401',
          payment_intent: null,
        },
      ],
    });
    (client as any).sdk = {
      ...search_mocks(),
      checkout: {
        sessions: { list },
      },
    };

    const r = await client.query({ unique: 'order_401' });
    expect(r?.ok).toBe(false);
    expect(r?.status).toBe('pending');
  });

  it('verify_notify_sign should verify by stripe-signature header', async () => {
    const client = create_client();
    const constructEvent = vi.fn().mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
    });
    (client as any).sdk = {
      webhooks: { constructEvent },
    };

    const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
    const r = await client.verify_notify_sign({
      body: payload,
      headers: {
        'stripe-signature': 't=1,v1=abc',
      },
    });

    expect(constructEvent).toHaveBeenCalledWith(payload, 't=1,v1=abc', 'whsec_123');
    expect(r.type).toBe('checkout.session.completed');
  });

  it('verify_notify_sign should reject untrusted event type from constructor option', async () => {
    const client = create_client(['checkout.session.completed']);
    const constructEvent = vi.fn().mockReturnValue({
      id: 'evt_2',
      type: 'invoice.paid',
    });
    (client as any).sdk = {
      webhooks: { constructEvent },
    };

    await expect(
      client.verify_notify_sign({
        body: '{"id":"evt_2","type":"invoice.paid"}',
        headers: {
          'stripe-signature': 't=1,v1=abc',
        },
      }),
    ).rejects.toThrow(/Untrusted Stripe webhook event type/i);
  });

  it('verify_notify_sign should allow per-call trusted_event_types override', async () => {
    const client = create_client(['checkout.session.completed']);
    const constructEvent = vi.fn().mockReturnValue({
      id: 'evt_3',
      type: 'invoice.paid',
    });
    (client as any).sdk = {
      webhooks: { constructEvent },
    };

    const r = await client.verify_notify_sign({
      body: '{"id":"evt_3","type":"invoice.paid"}',
      headers: {
        'stripe-signature': 't=1,v1=abc',
      },
      trusted_event_types: ['invoice.paid'],
    });
    expect(r.type).toBe('invoice.paid');
  });

  it('refund should create refund with unique idempotency key', async () => {
    const client = create_client();
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'cs_test_500',
          mode: 'payment',
          payment_status: 'paid',
          created: 1730000000,
          currency: 'usd',
          amount_total: 1000,
          client_reference_id: 'order_500',
          payment_intent: 'pi_500',
          invoice: null,
        },
      ],
    });
    const create_refund = vi.fn().mockResolvedValue({
      id: 're_500',
      status: 'succeeded',
      amount: 100,
      currency: 'usd',
    });
    (client as any).sdk = {
      ...search_mocks(),
      checkout: {
        sessions: { list },
      },
      refunds: {
        create: create_refund,
      },
    };

    await client.refund({
      unique: 'order_500',
      refund: '1',
    });

    expect(create_refund).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_500',
        amount: 100,
        metadata: {
          unique: 'order_500',
        },
      },
      {
        idempotencyKey: 'order_500_refund_100',
      },
    );
  });

  it('refund should use refund_unique in metadata and idempotency key when provided', async () => {
    const client = create_client();
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'cs_test_501',
          mode: 'payment',
          payment_status: 'paid',
          created: 1730000000,
          currency: 'usd',
          amount_total: 1000,
          client_reference_id: 'order_501',
          payment_intent: 'pi_501',
          invoice: null,
        },
      ],
    });
    const create_refund = vi.fn().mockResolvedValue({
      id: 're_501',
      status: 'succeeded',
      amount: 100,
      currency: 'usd',
    });
    (client as any).sdk = {
      ...search_mocks(),
      checkout: {
        sessions: { list },
      },
      refunds: {
        create: create_refund,
      },
    };

    await client.refund({
      unique: 'order_501',
      refund_unique: 'refund_501',
      refund: '1',
    });

    expect(create_refund).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          unique: 'order_501',
          refund_unique: 'refund_501',
        },
      }),
      { idempotencyKey: 'refund_501' },
    );
  });

  it('refund_query should map refund status', async () => {
    const client = create_client();
    const list_sessions = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'cs_test_600',
          mode: 'payment',
          payment_status: 'paid',
          created: 1730000000,
          currency: 'usd',
          amount_total: 1000,
          client_reference_id: 'order_600',
          payment_intent: 'pi_600',
          invoice: null,
        },
      ],
    });
    const list_refunds = vi.fn().mockResolvedValue({
      data: [
        {
          id: 're_600',
          amount: 100,
          currency: 'usd',
          status: 'pending',
        },
      ],
    });
    (client as any).sdk = {
      ...search_mocks(),
      checkout: {
        sessions: { list: list_sessions },
      },
      refunds: {
        list: list_refunds,
      },
    };

    const r = await client.refund_query({ unique: 'order_600' });
    expect(r.ok).toBe(false);
    expect(r.pending).toBe(true);
    expect(r.status).toBe('pending');
    expect(r.channel).toBe('stripe');
    expect(r.refund).toBe('1');
  });

  it('refund_query should select refund by refund_unique metadata when provided', async () => {
    const client = create_client();
    const list_sessions = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'cs_test_601',
          mode: 'payment',
          payment_status: 'paid',
          created: 1730000000,
          currency: 'usd',
          amount_total: 1000,
          client_reference_id: 'order_601',
          payment_intent: 'pi_601',
          invoice: null,
        },
      ],
    });
    const list_refunds = vi.fn().mockResolvedValue({
      data: [
        {
          id: 're_wrong',
          amount: 100,
          currency: 'usd',
          status: 'succeeded',
          metadata: { refund_unique: 'other_refund' },
        },
        {
          id: 're_right',
          amount: 200,
          currency: 'usd',
          status: 'succeeded',
          metadata: { refund_unique: 'refund_601' },
        },
      ],
    });
    (client as any).sdk = {
      ...search_mocks(),
      checkout: {
        sessions: { list: list_sessions },
      },
      refunds: {
        list: list_refunds,
      },
    };

    const r = await client.refund_query({ unique: 'order_601', refund_unique: 'refund_601' });
    expect(r.ok).toBe(true);
    expect(r.refund).toBe('2');
  });

  it('parse_notify should normalize a checkout completion event', async () => {
    const client = create_client();
    const constructEvent = vi.fn().mockReturnValue({
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      created: 1730000000,
      data: {
        object: {
          id: 'cs_notify_1',
          mode: 'payment',
          payment_status: 'paid',
          status: 'complete',
          amount_total: 1099,
          currency: 'usd',
          client_reference_id: 'order_notify_1',
          metadata: {
            unique: 'order_notify_1',
          },
        },
      },
    });
    (client as any).sdk = {
      webhooks: { constructEvent },
    };

    const r = await client.parse_notify({
      body: '{"id":"evt_checkout_1"}',
      headers: {
        'stripe-signature': 't=1,v1=abc',
      },
    });

    expect(r.provider).toBe('stripe');
    expect(r.kind).toBe('payment');
    expect(r.unique).toBe('order_notify_1');
    expect(r.status).toBe('paid');
  });

  it('build_notify_ack should return a no-body 200 response for stripe', () => {
    const client = create_client();
    expect(client.build_notify_ack()).toEqual({
      statusCode: 200,
      body: '',
      headers: {},
    });
  });

  it('supports should expose provider capabilities', () => {
    const client = create_client();
    expect(client.supports('pay_mobile_web')).toBe(true);
    expect(client.supports('close')).toBe(true);
    expect(client.supports('pay_qrcode')).toBe(false);
  });

  it('close should expire the checkout session for session ids', async () => {
    const client = create_client();
    const expire = vi.fn().mockResolvedValue({ id: 'cs_test_close', status: 'expired' });
    (client as any).sdk = {
      checkout: {
        sessions: { expire },
      },
    };

    await client.close({ unique: 'cs_test_close' });

    expect(expire).toHaveBeenCalledWith('cs_test_close');
  });

  it('create_payout should create a payout with converted amount', async () => {
    const client = create_client();
    const create = vi.fn().mockResolvedValue({
      id: 'po_1',
      amount: 1000,
      currency: 'usd',
      status: 'pending',
    });
    (client as any).sdk = {
      payouts: { create },
    };

    const r = await client.create_payout({
      unique: 'payout_1',
      fee: '10',
      currency: 'usd',
      subject: 'Withdraw',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        currency: 'usd',
        description: 'Withdraw',
      }),
      { idempotencyKey: 'payout_1' },
    );
    expect(r.raw.id).toBe('po_1');
  });

  it('get_payout should retrieve a payout by id', async () => {
    const client = create_client();
    const retrieve = vi.fn().mockResolvedValue({ id: 'po_2', status: 'paid' });
    (client as any).sdk = {
      payouts: { retrieve },
    };

    const r = await client.get_payout('po_2');

    expect(retrieve).toHaveBeenCalledWith('po_2');
    expect(r.id).toBe('po_2');
  });

  it('cancel_payout should cancel a payout by id', async () => {
    const client = create_client();
    const cancel = vi.fn().mockResolvedValue({ id: 'po_3', status: 'canceled' });
    (client as any).sdk = {
      payouts: { cancel },
    };

    const r = await client.cancel_payout('po_3');

    expect(cancel).toHaveBeenCalledWith('po_3');
    expect(r.status).toBe('canceled');
  });

  it('create_transfer should create a transfer with converted amount', async () => {
    const client = create_client();
    const create = vi.fn().mockResolvedValue({
      id: 'tr_1',
      amount: 1500,
      currency: 'usd',
    });
    (client as any).sdk = {
      transfers: { create },
    };

    const r = await client.create_transfer({
      unique: 'transfer_1',
      tid: 'acct_123',
      fee: '15',
      subject: 'Marketplace payout',
      currency: 'usd',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500,
        currency: 'usd',
        destination: 'acct_123',
        description: 'Marketplace payout',
      }),
      { idempotencyKey: 'transfer_1' },
    );
    expect(r.raw.id).toBe('tr_1');
  });

  it('get_transfer should retrieve a transfer by id', async () => {
    const client = create_client();
    const retrieve = vi.fn().mockResolvedValue({ id: 'tr_2' });
    (client as any).sdk = {
      transfers: { retrieve },
    };

    const r = await client.get_transfer('tr_2');

    expect(retrieve).toHaveBeenCalledWith('tr_2');
    expect(r.id).toBe('tr_2');
  });
});
