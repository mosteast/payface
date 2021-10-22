import { AlipaySdkConfig } from 'alipay-sdk';
import { Base } from './base';
import { require_all } from './error/util/lack_argument';
import { I_pay_qrcode, Payface, T_opt_payface } from './payface';
import { random_oid } from './util';

const TenpaySdk = require('tenpay');

export class Tenpay extends Base implements Payface {
  protected opt!: T_opt_tenpay;
  public sdk!: any;

  constructor(opt: T_opt_tenpay) {
    super(opt);
    this.opt = opt;
    this.sdk = new TenpaySdk({
      appid: opt.id,
      partnerKey: opt.secret,
      mchid: opt.mchid,
    }, opt.debug);
  }

  protected validate_opt(opt: T_opt_tenpay) {
    super.validate_opt(opt);
    require_all({ mchid: opt.mchid });
  }

  async pay_qrcode({ order_id, subject, fee, product_id }: I_pay_qrcode_tenpay): Promise<string> {
    require_all({ fee });

    let { prepay_id, code_url } = await this.sdk.unifiedOrder({
      out_trade_no: order_id || random_oid(),
      body: subject || 'Quick pay',
      total_fee: tenpay_fee(fee),
      trade_type: 'NATIVE',
      product_id: product_id || 'default',
      notify_url: this.opt.notify_url,
    });

    return code_url;
  }

  async verify_notify_sign(data: any): Promise<boolean> {
    try {
      // About this 'middleware_pay', @see:
      // https://github.com/befinal/node-tenpay/blob/0729ebb018b620d64d2b5dde203843546c9f8beb/lib/index.js#L217
      return !! this.sdk._parse(data, 'middleware_pay');
    } catch (e) {
      return false;
    }
  }
}

export interface T_opt_tenpay extends T_opt_payface {
  id: string; // appid 公众号ID
  secret: string; // partnerKey 微信支付安全密钥
  mchid: string; // mchid 微信商户号
  opt_common?: AlipaySdkConfig;
}

export interface I_pay_qrcode_tenpay extends I_pay_qrcode {
  product_id?: number;
}

export function tenpay_fee(fee: number) {
  return fee * 100;
}

