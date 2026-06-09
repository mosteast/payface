import { round_cny, round_money } from './lib/math';

describe('math helpers', () => {
  it('round_cny should keep cents precision', () => {
    expect(round_cny('10')).toBe('10');
    expect(round_cny('10.126')).toBe('10.13');
  });

  it('round_money should default to 2 decimals for money values', () => {
    expect(round_money('10.126')).toBe('10.13');
    expect(round_money('10.1')).toBe('10.1');
  });
});
