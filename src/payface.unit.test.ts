import { expectTypeOf } from 'vitest';
import * as Public_api from '../index';
import type { NotifyAck, NotifyEnvelope, PayfaceApp, PayfaceClosable, PayfaceCore, PayfaceQr } from './payface';

describe('payface public exports', () => {
  it('should expose provider constructors and math helper from package entry', () => {
    expect(Public_api.Alipay).toBeTypeOf('function');
    expect(Public_api.Tenpay).toBeTypeOf('function');
    expect(Public_api.Stripe).toBeTypeOf('function');
    expect(Public_api.round_cny('1.235')).toBe('1.24');
  });

  it('should preserve payface core type contracts', () => {
    expectTypeOf<NotifyEnvelope>().toMatchTypeOf<{
      provider: 'alipay' | 'tenpay' | 'stripe';
      kind: 'payment' | 'refund' | 'subscription' | 'transfer' | 'unknown';
      status: string;
      raw: unknown;
    }>();

    expectTypeOf<PayfaceCore['build_notify_ack']>().returns.toEqualTypeOf<NotifyAck>();
    expectTypeOf<PayfaceCore['parse_notify']>().returns.toEqualTypeOf<Promise<NotifyEnvelope>>();
    expectTypeOf<PayfaceQr['pay_qrcode']>().returns.toMatchTypeOf<Promise<{ url: string }>>();
    expectTypeOf<PayfaceApp['pay_app']>().returns.toMatchTypeOf<Promise<any>>();
    expectTypeOf<PayfaceClosable['close']>().returns.toEqualTypeOf<Promise<void>>();
  });
});
