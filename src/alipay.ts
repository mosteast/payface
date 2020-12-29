import AlipaySdk, { AlipaySdkConfig } from 'alipay-sdk';
import { sign } from 'alipay-sdk/lib/util';
import { nanoid } from 'nanoid';
import { URLSearchParams } from 'url';
import { Base } from './base';
import { Invalid_argument_external } from './error/invalid_argument';
import { I_pay_qrcode, Payface, T_opt_payface } from './payface';

export class Alipay extends Base implements Payface {
  protected opt!: T_opt_alipay;
  protected sdk!: AlipaySdk;

  constructor(opt: T_opt_alipay) {
    super();
    this.validate_opt(opt);
    this.opt = opt;
    this.sdk = new AlipaySdk({
      appId: opt.id!,
      privateKey: opt.secret!,
    });
  }

  protected validate_opt({ id, secret }: T_opt_alipay) {
    if ( ! id || ! secret) {
      throw new Invalid_argument_external({ id, secret });
    }
  }

  sign(action: string, params: any) {
    const config = this.sdk.config;
    const data = sign(action, params, config);
    return config.gateway + '?' + new URLSearchParams(data).toString();
  }

  async pay_qrcode({ order_id, fee, subject, return_url }: I_pay_qrcode_alipay) {
    return this.sign('alipay.trade.page.pay', {
      notify_url: this.opt.notify_url,
      return_url: return_url || 'https://alipay.com',
      bizContent: {
        out_trade_no: order_id || 'auto_id_' + nanoid(),
        product_code: 'FAST_INSTANT_TRADE_PAY',
        total_amount: fee,
        subject: subject || 'Quick pay',
      },
    });
  }
}

export interface T_opt_alipay extends T_opt_payface {
  id: string // appid 应用id
  secret: string // app private key 应用私钥
  opt_common?: AlipaySdkConfig
}

export interface I_pay_qrcode_alipay extends I_pay_qrcode {
  return_url?: string
}
