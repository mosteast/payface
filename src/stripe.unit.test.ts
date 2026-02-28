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
    expect(r.refund).toBe('1');
  });
});
