import { Invalid_argument } from '../invalid_argument';
import { require_any } from './lack_argument';

describe('require_any', () => {
  it('should throw when all values are undefined', () => {
    expect(() =>
      require_any({
        fee: undefined,
        refund: undefined,
      }),
    ).toThrow(Invalid_argument);
    expect(() =>
      require_any({
        fee: undefined,
        refund: undefined,
      }),
    ).toThrow('Missing one of these arguments');
  });

  it('should allow any defined value', () => {
    expect(() =>
      require_any({
        fee: undefined,
        refund: '1.00',
      }),
    ).not.toThrow();
  });
});
