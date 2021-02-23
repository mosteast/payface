import AlipaySdk, { AlipaySdkConfig } from 'alipay-sdk';
import { sign } from 'alipay-sdk/lib/util';
import { URLSearchParams } from 'url';
import { Base } from './base';
import { require_all } from './error/util/lack_argument';
import { I_pay_qrcode, Payface, T_opt_payface } from './payface';
import { random_oid } from './util';

export class Alipay extends Base implements Payface {
  protected opt!: T_opt_alipay;
  protected sdk!: AlipaySdk;

  constructor(opt: T_opt_alipay) {
    super(opt);
    this.opt = opt;
    this.sdk = new AlipaySdk({
      appId: opt.id!,
      privateKey: opt.secret!,
    });
  }

  sign(action: string, params: any) {
    const config = this.sdk.config;
    const data = sign(action, params, config);
    return config.gateway + '?' + new URLSearchParams(data).toString();
  }

  async pay_qrcode({ order_id, fee, subject, return_url }: I_pay_qrcode_alipay) {
    require_all({ fee });
    return this.sign('alipay.trade.page.pay', {
      notify_url: this.opt.notify_url,
      return_url: return_url || 'https://alipay.com',
      bizContent: {
        total_amount: fee,
        out_trade_no: order_id || random_oid(),
        product_code: 'FAST_INSTANT_TRADE_PAY',
        subject: subject || 'Quick pay',
      },
    });
  }

  verify_notify_sign(data: any): boolean {
    // todo see: https://github.com/alipay/alipay-sdk-nodejs-all/issues/45
    data = encodeURIComponent(data);
    return this.sdk.checkNotifySign(data);
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
