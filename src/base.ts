import { trim } from 'lodash';
import { Invalid_argument } from './error/invalid_argument';
import { T_opt_payface } from './payface';

export class Base {
  constructor(opt: T_opt_payface) {
    this.validate_opt(opt);
  }

  protected validate_opt({ id, secret, notify_url }: T_opt_payface) {
    this.assert_optional_string('id', id);
    this.assert_optional_string('secret', secret);
    this.assert_optional_string('notify_url', notify_url);
  }

  protected assert_optional_string(name: string, value?: string) {
    if (value === undefined) return;
    if (typeof value !== 'string') {
      throw new Invalid_argument(`Invalid "${name}", expected string`);
    }
    if (!trim(value)) {
      throw new Invalid_argument(`Empty "${name}"`);
    }
  }
}
