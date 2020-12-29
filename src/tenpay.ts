import { AlipaySdkConfig } from 'alipay-sdk';
import { Base } from './base';
import { Invalid_argument_external } from './error/invalid_argument';
import { I_pay_qrcode, Payface, T_opt_payface } from './payface';

const TenpaySdk = require('tenpay');

export class Tenpay extends Base implements Payface {
  protected opt!: T_opt_tenpay;
  protected sdk!: any;

  constructor(opt: T_opt_tenpay) {
    super();
    this.validate_opt(opt);
    this.opt = opt;
    this.sdk = new TenpaySdk({
      appid: opt.id,
      partnerKey: opt.secret,
      mchid: opt.mchid,
    });
  }

  protected validate_opt({ id, secret, mchid }: T_opt_tenpay) {
    if ( ! id || ! secret || ! mchid) {
      throw new Invalid_argument_external({ id, secret, mchid });
    }
  }

  async pay_qrcode({ order_id, subject, fee, product_id }: I_pay_qrcode_tenpay): Promise<string> {
    let { prepay_id, code_url } = await this.sdk.unifiedOrder({
      out_trade_no: order_id,
      body: subject,
      total_fee: tenpay_fee(fee),
      trade_type: 'NATIVE',
      product_id: product_id || 'default',
      notify_url: this.opt.notify_url,
    });
    // let result = await this.sdk.getNativeUrl({
    //   // todo
    //   product_id: 'product id',
    // });

    return code_url;
  }
}

export interface T_opt_tenpay extends T_opt_payface {
  id: string // appid 公众号ID
  secret: string // partnerKey 微信支付安全密钥
  mchid: string // mchid 微信商户号
  opt_common?: AlipaySdkConfig
}

export interface I_pay_qrcode_tenpay extends I_pay_qrcode {
  product_id?: number
}

export function tenpay_fee(fee: number) {
  return fee * 100;
}

