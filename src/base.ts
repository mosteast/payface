import { require_all } from './error/util/lack_argument';
import { T_opt_payface } from './payface';

export class Base {
  constructor(opt: T_opt_payface) {
    this.validate_opt(opt);
  }

  protected validate_opt({ id, secret, notify_url }: T_opt_payface) {
    require_all({ id, secret, notify_url });
  }
}
