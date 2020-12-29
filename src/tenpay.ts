import { AlipaySdkConfig } from 'alipay-sdk';
import { Base } from './base';
import { Invalid_argument_external } from './error/invalid_argument';
import { Payface, T_opt_payface } from './payface';

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

  async pay_qrcode(): Promise<string> {
    let result = await this.sdk.getNativeUrl({
      // todo
      product_id: '商品ID',
    });

    return result;
  }
}

export interface T_opt_tenpay extends T_opt_payface {
  id: string
  secret: string
  mchid: string
  opt_common?: AlipaySdkConfig
}

