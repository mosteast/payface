import { E } from "@mosteast/e";
import { AlipaySdkConfig } from "alipay-sdk";
import { parse } from "date-fns";
import { pick } from "lodash";
import { Optional } from "utility-types";
import { Base } from "./base";
import { require_all } from "./error/util/lack_argument";
import { Verification_error } from "./error/verification_error";
import { n, round_money } from "./lib/math";
import {
  I_pay,
  I_query,
  I_verify,
  Payface,
  T_opt_payface,
  T_receipt,
} from "./payface";
import { T_url_payment } from "./type";
import { random_unique } from "./util";

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

  async pay_qrcode(opt: I_pay_qrcode_tenpay): Promise<T_url_payment> {
    return this.pay_common(N_trade_type.native, opt as I_pay_common);
  }

  async pay_mobile_web(opt: I_pay_mobile_web_tenpay): Promise<T_url_payment> {
    return this.pay_common(N_trade_type.mweb, opt as I_pay_common);
  }

  async pay_app(opt: I_pay_mobile_web_tenpay): Promise<O_tenpay_pay_app> {
    return this.pay_common(N_trade_type.app, opt as I_pay_common);
  }

  async pay_common(
    trade_type: N_trade_type.mweb,
    opt: I_pay_common
  ): Promise<T_url_payment>;
  async pay_common(
    trade_type: N_trade_type.native,
    opt: I_pay_common
  ): Promise<T_url_payment>;
  async pay_common(
    trade_type: N_trade_type.app,
    opt: I_pay_common
  ): Promise<O_tenpay_pay_app>;
  async pay_common(
    trade_type: N_trade_type,
    { unique, subject, fee, product_id, client_ip }: I_pay_common
  ): Promise<any> {
    require_all({ fee });
    let r: any;
    const res = await this.sdk.unifiedOrder({
      out_trade_no: unique || random_unique(),
      body: subject || "Quick pay",
      total_fee: tenpay_fee(fee),
      product_id: product_id || "default",
      notify_url: this.opt.notify_url,
      trade_type,
      spbill_create_ip: client_ip,
    });

    switch (trade_type) {
      case N_trade_type.native:
        r = { url: res.code_url };
        break;
      case N_trade_type.mweb:
        r = { url: res.mweb_url };
        break;
      case N_trade_type.app:
        r = pick(res, ["mch_id", "appid", "nonce_str", "sign", "prepay_id"]);
        break;
    }

    if (!r) {
      throw new E(
        `Could not get payment data from order result for trade_type: "${trade_type}", result: ${JSON.stringify(
          r
        )}`
      );
    }

    return r;
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

  async query({
    unique,
  }: I_query): Promise<T_receipt<T_order_tenpay> | undefined> {
    const raw = (await this.sdk.orderQuery({
      out_trade_no: unique,
    })) as T_order_tenpay;

    if (!raw) {
      return;
    }

    let patch: Partial<T_receipt<T_order_tenpay>> = {};
    const ok = raw.result_code.toLowerCase() === "success";
    if (ok) {
      patch = {
        unique: raw.out_trade_no,
        fee: round_money(n(raw.cash_fee).div(100)).toString(),
        created_at: parse(
          raw.time_end,
          "yyyyMMddHHmmss",
          new Date()
        ).toISOString(),
      };
    }

    return { ok, raw, ...patch } as T_receipt<T_order_tenpay>;
  }

  async verify(opt: I_verify): Promise<T_receipt<T_order_tenpay>> {
    let r;
    try {
      r = await this.query(opt);
    } catch (e: any) {
      throw new Verification_error(e);
    }

    if (!r?.ok) {
      throw new Verification_error(r);
    }

    return r;
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

export enum N_trade_type {
  native = "NATIVE",
  mweb = "MWEB",
  app = "APP",
}

export interface I_pay_common extends I_pay {
  client_ip?: string;
  product_id?: number;
  trade_type: N_trade_type;
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

/**
 * Example:
 * {
 *   "return_code": "SUCCESS",
 *   "return_msg": "OK",
 *   "result_code": "SUCCESS",
 *   "mch_id": "1373091502",
 *   "appid": "wx41d141be52130624",
 *   "openid": "oIYGjt4kQCrCBG4kiolES4fjJzcw",
 *   "is_subscribe": "N",
 *   "trade_type": "NATIVE",
 *   "trade_state": "SUCCESS",
 *   "bank_type": "OTHERS",
 *   "total_fee": "4900",
 *   "fee_type": "CNY",
 *   "cash_fee": "4900",
 *   "cash_fee_type": "CNY",
 *   "transaction_id": "4200000404201910288390439123",
 *   "out_trade_no": "B3KH5937KT7UH13286UT3PH0PT84",
 *   "attach": "",
 *   "time_end": "20191028153408",
 *   "trade_state_desc": "支付成功",
 *   "nonce_str": "kPkI21nT5PeiNiwW",
 *   "sign": "0455A09561E1FDA27043453E1A36AD2B"
 * }
 */
export interface T_order_tenpay {
  return_code: string;
  return_msg: string;
  result_code: string;
  mch_id: string;
  appid: string;
  openid: string;
  is_subscribe: string;
  trade_type: string;
  trade_state: string;
  bank_type: string;
  total_fee: string;
  fee_type: string;
  cash_fee: string;
  cash_fee_type: string;
  transaction_id: string;
  out_trade_no: string;
  attach: string;
  time_end: string;
  trade_state_desc: string;
  nonce_str: string;
  sign: string;
}

export interface O_tenpay_pay_app {
  mch_id: string;
  appid: string;
  nonce_str: string;
  sign: string;
  prepay_id: string;
}
