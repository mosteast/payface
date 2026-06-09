import { get_header_value, random_unique } from './util';

describe('util helpers', () => {
  it('random_unique should generate auto_id prefix', () => {
    const value = random_unique();

    expect(value.startsWith('auto_id_')).toBe(true);
    expect(value.length).toBeGreaterThan('auto_id_'.length);
  });

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

  it('get_header_value should return undefined when key is missing', () => {
    expect(
      get_header_value(
        {
          'x-test': 'value_1',
        },
        'x-missing',
      ),
    ).toBeUndefined();
  });
});
