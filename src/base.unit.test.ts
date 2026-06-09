import { Base } from './base';
import { Invalid_argument } from './error/invalid_argument';

class Test_base extends Base {
  public assert_optional_string_public(name: string, value?: string) {
    return this.assert_optional_string(name, value);
  }
}

describe('Base', () => {
  function create_base() {
    return new Test_base({});
  }

  it('assert_optional_string should allow undefined values', () => {
    const base = create_base();

    expect(base.assert_optional_string_public('notify_url')).toBeUndefined();
  });

  it('assert_optional_string should reject non-string values', () => {
    const base = create_base();

    expect(() => base.assert_optional_string_public('notify_url', 1 as any)).toThrow(Invalid_argument);
    expect(() => base.assert_optional_string_public('notify_url', 1 as any)).toThrow('Invalid "notify_url"');
  });

  it('assert_optional_string should reject blank strings', () => {
    const base = create_base();

    expect(() => base.assert_optional_string_public('notify_url', '   ')).toThrow(Invalid_argument);
    expect(() => base.assert_optional_string_public('notify_url', '   ')).toThrow('Empty "notify_url"');
  });

  it('assert_optional_string should accept non-empty strings', () => {
    const base = create_base();

    expect(base.assert_optional_string_public('notify_url', 'https://example.com')).toBeUndefined();
  });
});
