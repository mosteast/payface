import debug from 'debug';
import { Optional } from 'utility-types';
import Wx from 'wechatpay-node-v3';
import { Iapp, Ih5, Ijsapi, Inative, Irefunds2 } from 'wechatpay-node-v3/dist/lib/interface';
import { Base } from './base';
import { Invalid_state_external } from './error/invalid_state';
import { require_all } from './error/util/lack_argument';
import { Verification_error } from './error/verification_error';
import { n, round_int, round_money } from './lib/math';
import {
  I_pay,
  I_query,
  I_refund,
  I_refund_query,
  I_verify,
  Payface,
  T_opt_payface,
  T_receipt,
  T_refund,
} from './payface';
import { T_url_payment } from './type';
import { random_unique } from './util';

const _ = debug('payface:tenpay');

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

  async pay_qrcode({ unique, subject, fee, client_ip }: I_pay_qrcode_tenpay): Promise<T_url_payment> {
    require_all({ fee, client_ip });
    const params: Inative = {
      out_trade_no: unique || random_unique(),
      description: subject || 'Quick pay',
      amount: {
        total: to_tenpay_fee(fee!),
      },
      notify_url: this.opt.notify_url as string,
      scene_info: {
        payer_client_ip: client_ip as string,
      },
    };

    const r = (await this.sdk.transactions_native(params)) as any;
    // { status: 200, code_url: 'weixin://wxpay/bizpayurl?pr=9xFPmlUzz' }
    _('transactions_native, O: %o', r);
    if (r.status !== 200) {
      console.error(r);
      throw new Invalid_state_external(r.code + ': ' + r.message);
    }
    return { url: r.code_url } as any;
  }

  async pay_mobile_web({ unique, subject, fee, client_ip }: I_pay_mobile_web_tenpay): Promise<T_url_payment> {
    const params: Ih5 = {
      out_trade_no: unique || random_unique(),
      description: subject || 'Quick pay',
      amount: {
        total: to_tenpay_fee(fee!),
      },
      notify_url: this.opt.notify_url as string,
      scene_info: {
        payer_client_ip: client_ip as string,
        h5_info: {
          type: 'Wap',
          app_name: 'Payface',
          app_url: 'https://www.mosteast.com',
        },
      },
    };

    const r = (await this.sdk.transactions_h5(params)) as any;
    // {
    // status: 200,
    // h5_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx051840206120147833cf4bcfcef12b0000&package=2056162962'
    // }
    _('transactions_h5, O: %o', r);
    if (r.status !== 200) {
      console.error(r);
      throw new Invalid_state_external(r.code + ': ' + r.message);
    }
    return { url: r.h5_url } as any;
  }

  async pay_app({ unique, subject, fee, client_ip }: I_pay_app_tenpay): Promise<O_tenpay_pay_app> {
    const params: Iapp = {
      out_trade_no: unique || random_unique(),
      description: subject || 'Quick pay',
      amount: {
        total: to_tenpay_fee(fee!),
      },
      notify_url: this.opt.notify_url as string,
      scene_info: {
        payer_client_ip: client_ip as string,
      },
    };

    const r = (await this.sdk.transactions_app(params)) as any;
    //   {
    //     status: 200,
    //     appid: 'appid',
    //     partnerid: '商户号',
    //     prepayid: 'wx061559014727156ae9554bb17af9d30000',
    //     package: 'Sign=WXPay',
    //     noncestr: 'm8dbyuytqul',
    //     timestamp: '1609919941',
    //     sign: 'PLENslMbldtSbtj5mDpX0N78vMMSw7CFPEptSpm+6YktXDa5Qso6KJ/uRCbNCmvM7z5adLoEdTmzjB/mjr5Ow=='
    //   }
    _('transactions_app, O: %o', r);
    if (r.status !== 200) {
      console.error(r);
      throw new Invalid_state_external(r.code + ': ' + r.message);
    }
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

  async pay_jsapi({ unique, subject, fee, client_ip, openid }: I_pay_jsapi_tenpay): Promise<O_tenpay_pay_jsapi> {
    const params: Ijsapi = {
      out_trade_no: unique || random_unique(),
      description: subject || 'Quick pay',
      amount: {
        total: to_tenpay_fee(fee!),
      },
      notify_url: this.opt.notify_url as string,
      scene_info: {
        payer_client_ip: client_ip as string,
      },
      payer: {
        openid,
      },
    };

    const r = (await this.sdk.transactions_jsapi(params)) as any;
    //   {
    //     appId: 'appid',
    //     timeStamp: '1609918952',
    //     nonceStr: 'y8aw9vrmx8c',
    //     package: 'prepay_id=wx0615423208772665709493edbb4b330000',
    //     signType: 'RSA',
    //     paySign: 'JnFXsT4VNzlcamtmgOHhziw7JqdnUS9qJ5W6vmAluk3Q2nska7rxYB4hvcl0BTFAB1PBEnHEhCsUbs5zKPEig=='
    //   }
    _('transactions_jsapi, O: %o', r);

    if (r.status !== 200) {
      console.error(r);
      throw new Invalid_state_external(r.code + ': ' + r.message);
    }

    return {
      mch_id: this.opt.mch_id,
      appid: this.opt.id,
      nonce_str: r.nonceStr,
      sign: r.paySign,
      prepay_id: r.package.replace('prepay_id=', ''),
      sign_type: r.signType,
      /**
       * Timestamp to sign
       */
      timestamp_sign: r.timeStamp,
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

  async verify_notify_sign(data: T_tenpay_notification): Promise<boolean> {
    try {
      // About this 'middleware_pay', @see:
      // https://github.com/befinal/node-tenpay/blob/0729ebb018b620d64d2b5dde203843546c9f8beb/lib/index.js#L217
      const r: O_tenpay_decipher = this.parse_notification(data);
      return r.trade_state === 'SUCCESS';
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  parse_notification({ resource }: T_tenpay_notification): O_tenpay_decipher {
    return this.sdk.decipher_gcm(resource.ciphertext, resource.associated_data, resource.nonce, this.opt.secret);
  }

  async query({ unique }: I_query): Promise<T_receipt<T_order_tenpay> | undefined> {
    const raw = (await this.sdk.query({
      out_trade_no: unique,
    })) as O_tenpay_query;

    _('query, O: %o', raw);

    let patch: Partial<T_receipt<T_order_tenpay>> = {};
    const ok = raw.trade_state === 'SUCCESS';
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

  async refund({ unique, fee, refund }: I_refund_tenpay): Promise<void> {
    require_all({ unique, fee });
    let r: any;
    r = await this.sdk.refunds({
      out_trade_no: unique,
      out_refund_no: `${unique}_refund`,
      amount: {
        total: to_tenpay_fee(refund),
        refund: to_tenpay_fee(fee),
        currency: 'CNY',
      },
    } as Irefunds2);

    if (!['PROCESSING', 'SUCCESS'].includes(r.status)) {
      throw new Invalid_state_external(`[${r.status}], ${r.message}`);
    }
  }

  async refund_query({ unique }: I_refund_query): Promise<T_refund<T_tenpay_refund>> {
    require_all({ unique });
    const raw = (await this.sdk.find_refunds(unique)) as any;
    return {
      raw,
      refund: from_tenpay_fee(raw.amount.refund.toString()),
      ok: raw.status === 'SUCCESS',
      pending: raw.status === 'PROCESSING',
    };
  }

  protected validate_opt(opt: T_opt_tenpay) {
    super.validate_opt(opt);
    const { mch_id, tenpay_cert_content_private, tenpay_cert_content_public } = opt;
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
  client_ip: string;
  product_id?: number;
}

export interface I_pay_qrcode_tenpay extends Optional<I_pay_common> {}

export interface I_pay_mobile_web_tenpay extends Optional<I_pay_common> {
  client_ip: string;
}

export interface I_pay_app_tenpay extends I_pay_mobile_web_tenpay {}

export interface I_pay_jsapi_tenpay extends I_pay_mobile_web_tenpay {
  openid: string;
}

export function to_tenpay_fee(fee: string) {
  return round_int(n(fee).times(100));
}

export function from_tenpay_fee(fee: string) {
  return round_money(n(fee).div(100));
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

export interface O_tenpay_pay_jsapi extends O_tenpay_pay_app {
  sign_type: string;
  sign: string;
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

/**
 {
 id: "c3f65444-8a57-5b56-869e-92cbddc1df33",
 create_time: "2022-11-17T20:38:59+08:00",
 resource_type: "encrypt-resource",
 event_type: "TRANSACTION.SUCCESS",
 summary: "支付成功",
 resource: {
 original_type: "transaction",
 aithm: "AEAD_AES_256_GCM",
 ciphertext:
 "8budXaFzlY4cZaNnwovQTwOJjSSY1TulSVGAtnP2bh9Oc/09e+9MnEK+OJF047va3BlMhdDnfmXysmilO/Xf6LpksZfYBNn2w0hzOWIwk7vtRW9hk1S/8+rwj8Aj6+NH0PvFxzBqAsOVMvvMYCvt/FI5SVKefzgHNfJ74UGNezARztqZt/BZFQF+XTFgEduwanvWR6HrCcpy5n1frB9B+HjfKS3ZCsqVhHSvURAS+Gc45Pgv/uGDFBM/sogoYrlf5kezM5mZchPDuZjkQp7+fyl6ONW8b/34RYTlHCxq5LB1octHknGMdD9iC7BgHYG6rqnCUIA//al3hHngXyK1urnIfmi3iFNfDRIxNXHRZJ2pDmwXuxAQEqpJ6sz6vNCcSPazQwqRqKQD3m889qzKpC9yX73xOd1AwUyDKkqkUWtcNP/S82G2eizFMKIqrp4pOaSBUIbxIitAAxtyFeqVefxad1HcZnPmI6C4cgPW5+k/YRvFIUaCapT16PV3PEZVRvesQRA5ney5S3NXcz9KtWNQaePpxqzr1+LSRZtONizXFDm7oAYCnS2uT7s=",
 associated_data: "transaction",
 nonce: "b43YbME3roU2",
 },
 }
 */
export interface T_tenpay_notification {
  id: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource: {
    original_type: string;
    aithm: string;
    ciphertext: string;
    associated_data: string;
    nonce: string;
  };
}

/**
 {
 mchid: '1373091502',
 appid: 'wx4ba9f9e08a7898a3',
 out_trade_no: 'R139326100',
 transaction_id: '4200001640202211171860369532',
 trade_type: 'NATIVE',
 trade_state: 'SUCCESS',
 trade_state_desc: '支付成功',
 bank_type: 'OTHERS',
 attach: '',
 success_time: '2022-11-17T20:38:59+08:00',
 payer: { openid: 'oC3QX6kArsXfGyjRKwVnEOB0hgVY' },
 amount: {
 total: 10,
 payer_total: 10,
 currency: 'CNY',
 payer_currency: 'CNY'
 }
 }
 */
export interface O_tenpay_decipher {
  mchid: string;
  appid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: string;
  trade_state_desc: string;
  bank_type: string;
  attach: string;
  success_time: string;
  payer: { openid: string };
  amount: {
    total: number;
    payer_total: number;
    currency: string;
    payer_currency: string;
  };
}

export interface T_tenpay_refund {
  status: string;
  amount: {
    currency: string;
    discount_refund: number;
    from: [];
    payer_refund: number;
    payer_total: number;
    refund: number;
    refund_fee: string;
    settlement_refund: number;
    settlement_total: number;
    total: number;
  };
  channel: string;
  create_time: string;
  funds_account: string;
  out_refund_no: string;
  out_trade_no: string;
  promotion_detail: [];
  refund_id: string;
  success_time: string;
  transaction_id: string;
  user_received_account: string;
}

export interface I_refund_tenpay extends I_refund {
  /**
   * Total fee
   */
  fee: string;
}
