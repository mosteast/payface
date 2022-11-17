import debug from "debug";
import { Optional } from "utility-types";
import Wx from "wechatpay-node-v3";
import { Iapp, Ih5, Inative } from "wechatpay-node-v3/dist/lib/interface";
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

const _ = debug("payface:tenpay");

export class Tenpay extends Base implements Payface {
  public sdk!: Wx;
  protected opt!: T_opt_tenpay;

  constructor(opt: T_opt_tenpay) {
    super(opt);
    this.opt = opt;

    this.sdk = new Wx({
      appid: opt.id,
      mchid: opt.mch_id,
      publicKey: opt.tenpay_cert_content_public as any, // 公钥
      privateKey: opt.tenpay_cert_content_private as any, // 秘钥
    });
  }

  async pay_qrcode({
    unique,
    subject,
    fee,
    client_ip,
  }: I_pay_qrcode_tenpay): Promise<T_url_payment> {
    const params: Inative = {
      out_trade_no: unique || random_unique(),
      description: subject || "Quick pay",
      amount: {
        total: tenpay_fee(fee as number),
      },
      notify_url: this.opt.notify_url as string,
      scene_info: {
        payer_client_ip: client_ip as string,
      },
    };

    const r = (await this.sdk.transactions_native(params)) as O_tenpay_qrcode;
    return { url: r.code_url } as any;
  }

  async pay_mobile_web({
    unique,
    subject,
    fee,
    client_ip,
  }: I_pay_mobile_web_tenpay): Promise<T_url_payment> {
    const params: Ih5 = {
      out_trade_no: unique || random_unique(),
      description: subject || "Quick pay",
      amount: {
        total: tenpay_fee(fee as number),
      },
      notify_url: this.opt.notify_url as string,
      scene_info: {
        payer_client_ip: client_ip as string,
        h5_info: {
          type: "Wap",
          app_name: "Payface",
          app_url: "https://www.mosteast.com",
        },
      },
    };

    const r = (await this.sdk.transactions_h5(params)) as O_tenpay_mweb;
    return { url: r.h5_url } as any;
  }

  async pay_app({
    unique,
    subject,
    fee,
    client_ip,
  }: I_pay_mobile_web_tenpay): Promise<O_tenpay_pay_app> {
    const params: Iapp = {
      out_trade_no: unique || random_unique(),
      description: subject || "Quick pay",
      amount: {
        total: tenpay_fee(fee as number),
      },
      notify_url: this.opt.notify_url as string,
      scene_info: {
        payer_client_ip: client_ip as string,
      },
    };

    const r = (await this.sdk.transactions_app(params)) as O_tenpay_app;

    _("transactions_app, O: %o", r);

    return {
      mch_id: this.opt.mch_id,
      appid: this.opt.id,
      nonce_str: r.noncestr,
      sign: r.sign,
      prepay_id: r.prepayid,
      /**
       * Timestamp to sign
       */
      timestamp_sign: r.timestamp,
    };
  }

  // async pay_common(
  //   trade_type: N_trade_type.mweb,
  //   opt: I_pay_common,
  // ): Promise<T_url_payment>;
  // async pay_common(
  //   trade_type: N_trade_type.native,
  //   opt: I_pay_common,
  // ): Promise<T_url_payment>;
  // async pay_common(
  //   trade_type: N_trade_type.app,
  //   opt: I_pay_common,
  // ): Promise<O_tenpay_pay_app>;
  // async pay_common(
  //   trade_type: N_trade_type,
  //   { unique, subject, fee, product_id, client_ip }: I_pay_common,
  // ): Promise<any> {
  //   require_all({ fee });
  //   let r: any;
  //   const params: any = {
  //     out_trade_no: unique || random_unique(),
  //     body: subject || 'Quick pay',
  //     total_fee: tenpay_fee(fee),
  //     product_id: product_id || 'default',
  //     notify_url: this.opt.notify_url,
  //     trade_type,
  //     spbill_create_ip: client_ip,
  //     signType: 'MD5',
  //   };
  //
  //   const order = await this.sdk.unifiedOrder(params);
  //   const detail = this.sdk.getPayParamsByPrepay(order, params.signType);
  //   const { timestamp: timestamp_sign } = detail;
  //
  //   switch (trade_type) {
  //     case N_trade_type.native:
  //       r = { url: order.code_url, timestamp_sign } as T_url_payment;
  //       break;
  //     case N_trade_type.mweb:
  //       r = { url: order.mweb_url, timestamp_sign } as T_url_payment;
  //       break;
  //     case N_trade_type.app:
  //       r = {
  //         ...pick(order, ['mch_id', 'appid', 'nonce_str', 'sign', 'prepay_id']),
  //         timestamp_sign,
  //       } as O_tenpay_pay_app;
  //       break;
  //   }
  //
  //   if (!r) {
  //     throw new E(
  //       `Could not get payment data from order result for trade_type: "${trade_type}", result: ${JSON.stringify(
  //         r,
  //       )}`,
  //     );
  //   }
  //
  //   return r;
  // }

  async verify_notify_sign(data: any): Promise<boolean> {
    try {
      // About this 'middleware_pay', @see:
      // https://github.com/befinal/node-tenpay/blob/0729ebb018b620d64d2b5dde203843546c9f8beb/lib/index.js#L217
      return !!this.sdk.verifySign(data);
    } catch (e) {
      return false;
    }
  }

  async query({
    unique,
  }: I_query): Promise<T_receipt<T_order_tenpay> | undefined> {
    const raw = (await this.sdk.query({
      out_trade_no: unique,
    })) as O_tenpay_query;

    _("query, O: %o", raw);

    let patch: Partial<T_receipt<T_order_tenpay>> = {};
    const ok = raw.trade_state === "SUCCESS";
    if (ok) {
      patch = {
        unique: raw.out_trade_no,
        fee: round_money(n(raw.amount.total).div(100)).toString(),
        created_at: raw.success_time,
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
    const { mch_id, tenpay_cert_content_private, tenpay_cert_content_public } =
      opt;
    require_all({
      mch_id,
      tenpay_cert_content_private,
      tenpay_cert_content_public,
    });
  }
}

export interface T_opt_tenpay extends T_opt_payface {
  id: string; // appid 公众号ID
  mch_id: string; // mchid 微信商户号
  tenpay_cert_content_public: string | Buffer; // typically called "apiclient_cert.pem"
  tenpay_cert_content_private: string | Buffer; // typically called "apiclient_key.pem"
  secret?: string; // partnerKey 微信支付安全密钥
  opt_common?: any;
}

export interface I_pay_common extends I_pay {
  client_ip?: string;
  product_id?: number;
}

export interface I_pay_qrcode_tenpay extends Optional<I_pay_common> {}

export interface I_pay_mobile_web_tenpay extends Optional<I_pay_common> {
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
  /**
   * Timestamp to sign
   */
  timestamp_sign?: string;
}

/**
 {
  status: 200,
  appid: 'wx41d141be52130624',
  partnerid: '1373091502',
  package: 'Sign=WXPay',
  timestamp: '1668684236',
  noncestr: 'aq26zljyc4c',
  prepayid: 'wx17192356724129d89ec3f1c29ac6e70000',
  sign: 'Trgkyu8VQz/f+QLwyf7gl4B61ti0z8T4FQpBRxzHY9XlY1StfaauPsA46kWvkzWS6WjhQZbxhTFqVCy9ZQYOh0HRJ/SxWeL/6ecPUuKOkfQFSL+K3c1L5xzT7+NX++Pk/7nuayYh4dPF1aDktDE1FSQRvnshS8RBzdx4QnZBapJZ6EGkrKyTfD1G1eBJ/TnpMATLHenLn/kf93E93kOcyZnGJULn9zZFGQDj7U3tJqhloq5ZySJMAnJ5oIhIpxSTA0Sxf6pDzpi3SWtRF46+KcOV4g2MkFa5TMIOa+HTAemD+IEDfu6R81dfQP0LrxX9dZBBotmMOYUAiINFsNVhyA=='
}
 */
export interface O_tenpay_app {
  status: number;
  appid: string;
  partnerid: string;
  package: string;
  timestamp: string;
  noncestr: string;
  prepayid: string;
  sign: string;
}

export interface O_tenpay_mweb {
  status: number;
  h5_url: string;
}

/**
 { status: 200, code_url: 'weixin://wxpay/bizpayurl?pr=wPO2oKkzz' }
 */
export interface O_tenpay_qrcode {
  status: number;
  code_url: string;
}

/**
 {
    status: 200,
    amount: {
      currency: 'CNY',
      payer_currency: 'CNY',
      payer_total: 4900,
      total: 4900
    },
    appid: 'wx41d141be52130624',
    attach: '',
    bank_type: 'OTHERS',
    mchid: '1373091502',
    out_trade_no: 'B3KH5937KT7UH13286UT3PH0PT84',
    payer: {
      openid: 'oIYGjt4kQCrCBG4kiolES4fjJzcw'
    },
    promotion_detail: [],
    success_time: '2019-10-28T15:34:08+08:00',
    trade_state: 'SUCCESS',
    trade_state_desc: '支付成功',
    trade_type: 'NATIVE',
    transaction_id: '4200000404201910288390439123'
  }
 */
export interface O_tenpay_query {
  status: number;
  amount: {
    currency: string;
    payer_currency: string;
    payer_total: number;
    total: number;
  };
  appid: string;
  attach: string;
  bank_type: string;
  mchid: string;
  out_trade_no: string;
  payer: { openid: string };
  promotion_detail: [];
  success_time: string;
  trade_state: string;
  trade_state_desc: string;
  trade_type: string;
  transaction_id: string;
}
