import AlipaySdk, { AlipaySdkConfig } from 'alipay-sdk';
import { sign } from 'alipay-sdk/lib/util';
import { URLSearchParams } from 'url';
import { Base } from './Base';
import { Invalid_argument_external } from './error/invalid_argument';
import { Payface, T_opt_payface } from './payface';

export class Alipay extends Base implements Payface {
  protected opt!: T_opt_alipay;
  protected sdk!: AlipaySdk;

  constructor(opt: T_opt_alipay) {
    super();
    this.validate_opt(opt);
    this.opt = opt;
    this.sdk = new AlipaySdk({
      appId: opt.key!,
      privateKey: opt.secret!,
    });
  }

  protected validate_opt({ key, secret }: T_opt_alipay) {
    if ( ! key || ! secret) {
      throw new Invalid_argument_external({ key, secret });
    }
  }

  sign(action: string, params: any) {
    const config = this.sdk.config;
    const data = sign(action, params, config);
    return config.gateway + '?' + new URLSearchParams(data).toString();
  }

  async pay_qrcode() {
    return this.sign('alipay.trade.page.pay', {
      notify_url: 'http://api.test.alipay.net/atinterface/receive_notify.htm',
      return_url: 'https://xxx.com',
      bizContent: {
        out_trade_no: 'moonrating_test_' + Date.now(),
        product_code: 'FAST_INSTANT_TRADE_PAY',
        total_amount: 0.01,
        subject: 'moonrating test',
      },
    });
  }
}

export interface T_opt_alipay extends T_opt_payface {
  key: string
  secret: string
  opt_common?: AlipaySdkConfig
}
