import { get_header_value } from './util';

describe('util helpers', () => {
  it('get_header_value should find case-insensitive header values', () => {
    const headers = {
      'stripe-signature': 'sig_1',
      'Wechatpay-Nonce': 'nonce_1',
    };

    expect(get_header_value(headers, 'Stripe-Signature')).toBe('sig_1');
    expect(get_header_value(headers, 'wechatpay-nonce')).toBe('nonce_1');
  });

  it('get_header_value should unwrap string arrays', () => {
    expect(
      get_header_value(
        {
          'x-test': ['value_1'],
        },
        'x-test',
      ),
    ).toBe('value_1');
  });
});
