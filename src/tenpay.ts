import { AlipaySdkConfig } from "alipay-sdk";
import { Optional } from "utility-types";
import { Base } from "./base";
import { require_all } from "./error/util/lack_argument";
import { I_pay, Payface, T_opt_payface } from "./payface";
import { random_oid } from "./util";

const TenpaySdk = require("tenpay");

export class Tenpay extends Base implements Payface {
  public sdk!: any;
  protected opt!: T_opt_tenpay;

  constructor(opt: T_opt_tenpay) {
    super(opt);
    this.opt = opt;
    this.sdk = new TenpaySdk(
      {
        appid: opt.id,
        partnerKey: opt.secret,
        mchid: opt.mchid,
      },
      opt.debug
    );
  }

  async pay_qrcode(opt: I_pay_qrcode_tenpay): Promise<string> {
    opt.trade_type = "NATIVE";
    return this.pay_common(opt as I_pay_common);
  }

  async pay_mobile_web(opt: I_pay_mobile_web_tenpay): Promise<string> {
    opt.trade_type = "MWEB";
    return this.pay_common(opt as I_pay_common);
  }

  async pay_common({
    order_id,
    subject,
    fee,
    product_id,
    trade_type,
    client_ip,
  }: I_pay_common): Promise<string> {
    require_all({ fee });

    let { code_url } = await this.sdk.unifiedOrder({
      out_trade_no: order_id || random_oid(),
      body: subject || "Quick pay",
      total_fee: tenpay_fee(fee),
      product_id: product_id || "default",
      notify_url: this.opt.notify_url,
      trade_type,
      spbill_create_ip: client_ip,
    });

    return code_url;
  }

  async verify_notify_sign(data: any): Promise<boolean> {
    try {
      // About this 'middleware_pay', @see:
      // https://github.com/befinal/node-tenpay/blob/0729ebb018b620d64d2b5dde203843546c9f8beb/lib/index.js#L217
      return !!this.sdk._parse(data, "middleware_pay");
    } catch (e) {
      return false;
    }
  }

  protected validate_opt(opt: T_opt_tenpay) {
    super.validate_opt(opt);
    require_all({ mchid: opt.mchid });
  }
}

export interface T_opt_tenpay extends T_opt_payface {
  id: string; // appid 公众号ID
  secret: string; // partnerKey 微信支付安全密钥
  mchid: string; // mchid 微信商户号
  opt_common?: AlipaySdkConfig;
}

export interface I_pay_common extends I_pay {
  client_ip?: string;
  product_id?: number;
  trade_type: "NATIVE" | "MWEB";
}

export interface I_pay_qrcode_tenpay
  extends Optional<I_pay_common, "trade_type"> {}

export interface I_pay_mobile_web_tenpay
  extends Optional<I_pay_common, "trade_type"> {
  client_ip: string;
}

export function tenpay_fee(fee: number) {
  return fee * 100;
}
