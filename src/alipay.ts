import AlipaySdk, { AlipaySdkConfig } from 'alipay-sdk';
import { sign } from 'alipay-sdk/lib/util';
import { values } from 'lodash';
import { URLSearchParams } from 'url';
import { Base } from './base';
import { Api_error } from './error/api_error';
import { Invalid_argument, Invalid_argument_external } from './error/invalid_argument';
import { require_all } from './error/util/lack_argument';
import { I_pay_qrcode, I_transfer, Payface, T_opt_payface } from './payface';
import { random_oid } from './util';

export class Alipay extends Base implements Payface {
  protected opt!: T_opt_alipay;
  protected sdk!: AlipaySdk;

  constructor(opt: T_opt_alipay) {
    super(opt);
    this.opt = opt;
    const { id, secret, alipay_public_cert, alipay_root_cert, alipay_public_key, app_cert, auth_type } = opt;
    switch (auth_type) {
      case N_alipay_auth_type.secret:
        require_all({ id, secret, alipay_public_key });
        this.sdk = new AlipaySdk({
          appId: id,
          privateKey: secret,
          alipayPublicKey: alipay_public_key,
        });
        break;
      case N_alipay_auth_type.cert:
        require_all({ id, secret, alipay_root_cert, alipay_public_cert, app_cert });

        this.sdk = new AlipaySdk({
          appId: id,
          privateKey: secret,
          alipayRootCertContent: alipay_root_cert,
          alipayPublicCertContent: alipay_public_cert,
          appCertContent: app_cert,
        });
        break;
      default:
        throw new Invalid_argument_external('Invalid {auth_type}, should be one of: ' + JSON.stringify(values(N_alipay_auth_type)));
    }

  }

  sign(action: string, params: any): string {
    const config = this.sdk.config;
    const data = sign(action, params, config);
    return config.gateway + '?' + new URLSearchParams(data).toString();
  }

  async pay_qrcode({ order_id, fee, subject, return_url }: I_pay_qrcode_alipay): Promise<string> {
    require_all({ fee });

    const notify_url = this.opt.notify_url;
    if ( ! notify_url) { throw new Invalid_argument('Empty {notify_url}'); }

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

  /**
   * Transfer money to an alipay account (could withdraw money for user)
   */
  async transfer({ legal_name, fee, tid, order_id, subject }: I_transfer_alipay): Promise<boolean> {
    require_all({ fee });
    const r: any = await this.sdk.exec('alipay.fund.trans.uni.transfer', {
      bizContent: {
        out_biz_no: order_id || random_oid(),
        trans_amount: fee,
        product_code: 'TRANS_ACCOUNT_NO_PWD',
        payee_info: {
          identity_type: 'ALIPAY_LOGON_ID',
          identity: tid,
          name: legal_name,
        },
        order_title: subject || 'Direct Transfer',
        biz_scene: 'DIRECT_TRANSFER',
      },
    });

    if (r.status !== 'SUCCESS') {
      throw new Api_error('Transfer rejected by Alipay: ' + JSON.stringify(r), r);
    }

    return true;
  }

  async verify_notify_sign(data: any): Promise<boolean> {
    return this.sdk.checkNotifySign(data);
  }
}

export enum N_alipay_auth_type {
  secret = 'secret',
  cert   = 'cert',
}

export interface T_opt_alipay extends T_opt_payface {
  id: string // appid 应用id
  secret: string // app private key 应用私钥
  auth_type: N_alipay_auth_type,
  alipay_public_key?: string  // alipay public key 支付宝公钥
  alipay_root_cert?: string | Buffer // alipay root cert content 支付宝根证书内容
  alipay_public_cert?: string | Buffer // alipay public cert content 支付宝公钥证书内容
  app_cert?: string | Buffer // app cert content 应用证书内容
  opt_common?: AlipaySdkConfig
}

export interface I_pay_qrcode_alipay extends I_pay_qrcode {
  return_url?: string
}

export interface I_transfer_alipay extends I_transfer {
  legal_name: string
}
