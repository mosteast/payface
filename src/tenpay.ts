import debug from 'debug';
import { Optional } from 'utility-types';
import Wx from 'wechatpay-node-v3';
import {
  Iapp,
  Ifundflowbill,
  Ih5,
  Ijsapi,
  Inative,
  Ipay,
  Irefunds2,
  Itradebill,
} from 'wechatpay-node-v3/dist/lib/interface';
import { Base } from './base';
import { Invalid_argument_external } from './error/invalid_argument';
import { Invalid_state_external } from './error/invalid_state';
import { require_all } from './error/util/lack_argument';
import { Verification_error } from './error/verification_error';
import { n, round_int, round_money } from './lib/math';
import {
  I_close,
  I_pay,
  I_query,
  I_refund,
  I_refund_query,
  I_transfer,
  I_verify,
  NotifyAck,
  NotifyEnvelope,
  O_pay,
  Payface,
  PaymentStatus,
  PayfaceCapability,
  RefundStatus,
  T_opt_payface,
  T_receipt,
  T_refund,
} from './payface';
import { T_url_payment } from './type';
import { get_header_value, random_unique } from './util';

const _ = debug('payface:tenpay');

interface I_tenpay_sdk_output<T> {
  status?: number;
  data?: T;
  error?: string;
  errRaw?: any;
}

function unwrap_tenpay_sdk_data<T>(res: I_tenpay_sdk_output<T> | T): T {
  if (res && typeof res === 'object' && 'status' in (res as any)) {
    return ((res as I_tenpay_sdk_output<T>).data || {}) as unknown as T;
  }
  return (res || {}) as unknown as T;
}

function parse_tenpay_sdk_error(res: any): string {
  const from_data = [res?.data?.code, res?.data?.message].filter(Boolean).join(': ');
  if (from_data) return from_data;

  if (typeof res?.error === 'string') {
    try {
      const parsed = JSON.parse(res.error);
      const from_error_json = [parsed?.code, parsed?.message].filter(Boolean).join(': ');
      if (from_error_json) return from_error_json;
      return res.error;
    } catch {
      return res.error;
    }
  }

  return 'Unknown Wechat Pay SDK error';
}

function to_refund_no(unique: string, refund_unique?: string): string {
  if (refund_unique) return refund_unique;
  return unique.endsWith('_refund') ? unique : `${unique}_refund`;
}

function is_verify_notify_sign_input(data: any): data is I_tenpay_verify_notify_sign {
  return !!data && typeof data === 'object' && 'headers' in data && 'body' in data;
}

function to_tenpay_payment_status(trade_state?: string): PaymentStatus {
  switch (trade_state) {
    case 'NOTPAY':
    case 'USERPAYING':
      return 'pending';
    case 'SUCCESS':
      return 'paid';
    case 'CLOSED':
    case 'REVOKED':
      return 'closed';
    case 'REFUND':
      return 'refunded';
    case 'PAYERROR':
      return 'failed';
    default:
      return 'unknown';
  }
}

function to_tenpay_refund_status(status?: string): RefundStatus {
  switch (status) {
    case 'PROCESSING':
      return 'pending';
    case 'SUCCESS':
      return 'succeeded';
    case 'CLOSED':
      return 'canceled';
    case 'ABNORMAL':
      return 'failed';
    default:
      return 'unknown';
  }
}

export class Tenpay extends Base implements Payface {
  public sdk!: Wx;
  protected opt!: T_opt_tenpay;

  constructor(opt: T_opt_tenpay) {
    super(opt);
    this.opt = opt;
    _('constructor.I: %o', opt);
    const opt_sdk: Ipay = {
      appid: opt.id,
      mchid: opt.mch_id,
      publicKey: opt.tenpay_cert_content_public as any, // 公钥
      privateKey: opt.tenpay_cert_content_private as any, // 秘钥
      key: opt.key_v3,
    };
    // _('constructor.opt_sdk: %o', opt_sdk);
    this.sdk = new Wx(opt_sdk);
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

    _('transactions_native, I: %o', params);

    const res = (await this.sdk.transactions_native(params)) as any;
    const r = res.data || {};
    // { status: 200, data: { code_url: 'weixin://wxpay/bizpayurl?pr=mESVwYIz1' } }
    _('transactions_native, O: %o', r);
    if (res.status !== 200) {
      _('transactions_native.E: %o', res);
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
    return { url: r?.code_url } as any;
  }

  async pay_mobile_web({ unique, subject, fee, client_ip }: I_pay_mobile_web_tenpay): Promise<T_url_payment> {
    require_all({ fee, client_ip });
    const app_name = this.opt.h5_app_name || subject || 'Quick pay';
    const app_url = this.opt.h5_app_url || this.opt.notify_url;
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
          app_name,
          app_url: app_url as string,
        },
      },
    };
    _('transactions_h5, I: %o', params);

    const res = (await this.sdk.transactions_h5(params)) as any;
    const r = res.data || {};
    // {
    // status: 200,
    // h5_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx051840206120147833cf4bcfcef12b0000&package=2056162962'
    // }
    _('transactions_h5, O: %o', r);
    if (res.status !== 200) {
      _('transactions_h5.E: %o', res);
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
    return { url: r.h5_url, raw: r };
  }

  async pay_app({ unique, subject, fee, client_ip }: I_pay_app_tenpay): Promise<O_tenpay_pay_app> {
    require_all({ fee, client_ip });

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
    _('transactions_app, I: %o', params);

    const res = (await this.sdk.transactions_app(params)) as any;
    const r = res.data || {};
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
    if (res.status !== 200) {
      _('transactions_app.E: %o', res);
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
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
      raw: r,
    };
  }

  async pay_jsapi({ unique, subject, fee, client_ip, openid }: I_pay_jsapi_tenpay): Promise<O_tenpay_pay_jsapi> {
    require_all({ fee, client_ip, openid });
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
    _('transactions_jsapi, I: %o', params);

    const res = (await this.sdk.transactions_jsapi(params)) as any;
    const r = res.data || {};
    //   {
    //     appId: 'appid',
    //     timeStamp: '1609918952',
    //     nonceStr: 'y8aw9vrmx8c',
    //     package: 'prepay_id=wx0615423208772665709493edbb4b330000',
    //     signType: 'RSA',
    //     paySign: 'JnFXsT4VNzlcamtmgOHhziw7JqdnUS9qJ5W6vmAluk3Q2nska7rxYB4hvcl0BTFAB1PBEnHEhCsUbs5zKPEig=='
    //   }
    _('transactions_jsapi, O: %o', r);

    if (res.status !== 200) {
      _('transactions_jsapi.E: %o', res);
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }

    return {
      mch_id: this.opt.mch_id,
      appid: this.opt.id,
      nonce_str: r.nonceStr,
      sign: r.paySign,
      package: r.package,
      prepay_id: r.package.replace('prepay_id=', ''),
      sign_type: r.signType,
      /**
       * Timestamp to sign
       */
      timestamp_sign: r.timeStamp,
      raw: r,
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

  async verify_notify_sign(data: I_tenpay_verify_notify_sign | T_tenpay_notification): Promise<O_tenpay_decipher> {
    return this.verify_notify_sign_common(data, true);
  }

  async parse_notify(
    data: I_tenpay_verify_notify_sign | T_tenpay_notification,
  ): Promise<NotifyEnvelope<O_tenpay_decipher>> {
    const raw = await this.verify_notify_sign_common(data, false);
    return {
      provider: 'tenpay',
      kind: 'payment',
      unique: raw.out_trade_no,
      status: to_tenpay_payment_status(raw.trade_state),
      raw_status: raw.trade_state,
      fee: raw?.amount?.total === undefined ? undefined : from_tenpay_fee(String(raw.amount.total)),
      currency: raw?.amount?.currency?.toLowerCase() || 'cny',
      occurred_at: raw.success_time,
      raw,
    };
  }

  build_notify_ack(): NotifyAck {
    return {
      statusCode: 200,
      body: { code: 'SUCCESS', message: '成功' },
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    };
  }

  private async verify_notify_sign_common(
    data: I_tenpay_verify_notify_sign | T_tenpay_notification,
    require_success: boolean,
  ): Promise<O_tenpay_decipher> {
    if (!is_verify_notify_sign_input(data)) {
      throw new Invalid_argument_external(
        'Invalid notification input, require { headers, body } for signature verification',
      );
    }

    const body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body);
    const timestamp = get_header_value(data.headers, 'wechatpay-timestamp');
    const nonce = get_header_value(data.headers, 'wechatpay-nonce');
    const serial = get_header_value(data.headers, 'wechatpay-serial');
    const signature = get_header_value(data.headers, 'wechatpay-signature');
    const key_v3 = this.opt.key_v3;

    require_all({ timestamp, nonce, serial, signature, key_v3 });

    const verified = await this.sdk.verifySign({
      timestamp: timestamp as string,
      nonce: nonce as string,
      serial: serial as string,
      signature: signature as string,
      body,
      apiSecret: key_v3,
    });
    if (!verified) {
      throw new Invalid_argument_external('Invalid notification signature');
    }

    const payload = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
    const r = this.parse_notification(payload);
    _('verify_notify_sign, parsed: %o', r);

    if (require_success && r?.trade_state !== 'SUCCESS') {
      throw new Invalid_argument_external(`Trade fail, state: ${r?.trade_state}`);
    }

    return r;
  }

  parse_notification({ resource }: T_tenpay_notification): O_tenpay_decipher {
    if (!this.opt.key_v3) {
      throw new Invalid_argument_external('Missing "key_v3", required for callback decryption');
    }

    return this.sdk.decipher_gcm(resource.ciphertext, resource.associated_data, resource.nonce, this.opt.key_v3);
  }

  async query({ unique }: I_query): Promise<T_receipt<O_tenpay_query> | undefined> {
    const res = (await this.sdk.query({
      out_trade_no: unique,
    })) as I_tenpay_sdk_output<O_tenpay_query>;
    const raw = unwrap_tenpay_sdk_data<O_tenpay_query>(res);

    _('query, O: %o', raw);

    if (res.status && res.status !== 200) {
      if (res.status === 404) {
        return;
      }
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }

    const created_at = raw.success_time;
    const total = raw?.amount?.total;
    const fee = total === undefined ? '0' : round_money(n(total).div(100)).toString();
    const status = to_tenpay_payment_status(raw.trade_state);
    return {
      ok: status === 'paid',
      status,
      raw_status: raw.trade_state,
      channel: 'tenpay',
      unique: raw.out_trade_no || unique,
      fee,
      currency: raw?.amount?.currency?.toLowerCase() || 'cny',
      created_at,
      paid_at: created_at,
      raw,
    };
  }

  async verify(opt: I_verify): Promise<T_receipt<O_tenpay_query>> {
    const r = await this.query(opt);
    if (!r?.ok) {
      throw new Verification_error(r);
    }

    return r;
  }

  async refund({ unique, fee, refund, refund_unique }: I_refund_tenpay): Promise<void> {
    require_all({ unique, fee, refund });
    if (n(refund).greaterThan(n(fee as string))) {
      throw new Invalid_argument_external(`Refund should <= fee, got fee: ${fee}, refund: ${refund}`);
    }

    const out_refund_no = to_refund_no(unique, refund_unique);
    const res = (await this.sdk.refunds({
      out_trade_no: unique,
      out_refund_no,
      amount: {
        total: to_tenpay_fee(fee as string),
        refund: to_tenpay_fee(refund),
        currency: 'CNY',
      },
    } as Irefunds2)) as I_tenpay_sdk_output<T_tenpay_refund>;

    _('refunds, O: %o', res);
    if (res.status !== 200) {
      // Retry-safe handling: when create-refund fails, query refund status first by out_refund_no.
      const refund_data = await this.query_refund_data(out_refund_no);
      if (refund_data?.status === 'SUCCESS' || refund_data?.status === 'PROCESSING') return;

      _('refunds.E: %o', res);
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
  }

  async refund_query({ unique, refund_unique }: I_refund_query): Promise<T_refund<T_tenpay_refund>> {
    require_all({ unique });
    const out_refund_no = to_refund_no(unique, refund_unique);
    const raw = await this.query_refund_data(out_refund_no);
    if (!raw) {
      throw new Invalid_state_external(`Could not query refund by out_refund_no: "${out_refund_no}"`);
    }
    const status = to_tenpay_refund_status(raw.status);

    return {
      raw,
      refund: from_tenpay_fee((raw?.amount?.refund || 0).toString()),
      ok: status === 'succeeded',
      pending: status === 'pending',
      status,
      raw_status: raw.status,
      channel: 'tenpay',
    };
  }

  private async query_refund_data(out_refund_no: string): Promise<T_tenpay_refund | undefined> {
    const res = (await this.sdk.find_refunds(out_refund_no)) as I_tenpay_sdk_output<T_tenpay_refund>;
    if (res.status !== 200) return undefined;
    return unwrap_tenpay_sdk_data<T_tenpay_refund>(res);
  }

  protected validate_opt(opt: T_opt_tenpay) {
    super.validate_opt(opt);
    const { mch_id, tenpay_cert_content_private, tenpay_cert_content_public, key_v3 } = opt;
    require_all({
      mch_id,
      tenpay_cert_content_private,
      tenpay_cert_content_public,
    });
    if (!key_v3) {
      _('validate_opt.W: missing key_v3, callback signature verification/decryption will not work');
    }
  }

  async close({ unique }: I_close): Promise<void> {
    const res = await this.sdk.close(unique);
    if (res?.status && res.status >= 400) {
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
  }

  supports(capability: PayfaceCapability): boolean {
    return new Set<PayfaceCapability>([
      'pay_qrcode',
      'pay_mobile_web',
      'pay_app',
      'pay_jsapi',
      'close',
      'transfer',
      'parse_notify',
    ]).has(capability);
  }

  async download_trade_bill(params: Itradebill): Promise<O_tenpay_bill_download> {
    const res = (await this.sdk.tradebill(params)) as I_tenpay_sdk_output<{ download_url?: string }>;
    const raw = unwrap_tenpay_sdk_data<{ download_url?: string }>(res);
    if (res.status !== 200) {
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
    return {
      url: raw.download_url as string,
      raw,
    };
  }

  async download_fundflow_bill(params: Ifundflowbill): Promise<O_tenpay_bill_download> {
    const res = (await this.sdk.fundflowbill(params)) as I_tenpay_sdk_output<{ download_url?: string }>;
    const raw = unwrap_tenpay_sdk_data<{ download_url?: string }>(res);
    if (res.status !== 200) {
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
    return {
      url: raw.download_url as string,
      raw,
    };
  }

  async transfer({
    fee,
    tid,
    unique,
    subject,
    user_name,
    transfer_scene_id,
  }: I_transfer_tenpay): Promise<O_tenpay_transfer> {
    require_all({ fee, tid });
    const out_batch_no = unique || random_unique();
    const transfer_remark = subject || 'Payface transfer';
    const params = {
      out_batch_no,
      batch_name: transfer_remark,
      batch_remark: transfer_remark,
      total_amount: to_tenpay_fee(fee),
      total_num: 1,
      transfer_detail_list: [
        {
          out_detail_no: `${out_batch_no}_detail_1`,
          transfer_amount: to_tenpay_fee(fee),
          transfer_remark,
          openid: tid,
          user_name,
        },
      ],
      transfer_scene_id,
    };
    const res = (await this.sdk.batches_transfer(params as any)) as I_tenpay_sdk_output<any>;
    const raw = unwrap_tenpay_sdk_data<any>(res);
    if (res.status !== 200) {
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
    return {
      out_batch_no,
      raw,
    };
  }

  async query_transfer({
    unique,
    need_query_detail = false,
    offset,
    limit,
    detail_status,
  }: I_query_transfer_tenpay): Promise<O_tenpay_query_transfer> {
    const res = (await this.sdk.query_batches_transfer_list({
      out_batch_no: unique,
      need_query_detail,
      offset,
      limit,
      detail_status,
    } as any)) as I_tenpay_sdk_output<any>;
    const raw = unwrap_tenpay_sdk_data<any>(res);
    if (res.status !== 200) {
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
    return { raw };
  }

  async query_transfer_detail({
    unique,
    detail_unique,
  }: I_query_transfer_detail_tenpay): Promise<O_tenpay_query_transfer_detail> {
    const res = (await this.sdk.query_batches_transfer_detail({
      out_batch_no: unique,
      out_detail_no: detail_unique,
    } as any)) as I_tenpay_sdk_output<any>;
    const raw = unwrap_tenpay_sdk_data<any>(res);
    if (res.status !== 200) {
      throw new Invalid_state_external(parse_tenpay_sdk_error(res));
    }
    return { raw };
  }
}

export interface T_opt_tenpay extends T_opt_payface {
  id: string; // appid 公众号ID
  mch_id: string; // mchid 微信商户号
  tenpay_cert_content_public: string | Buffer; // typically called "apiclient_cert.pem"
  tenpay_cert_content_private: string | Buffer; // typically called "apiclient_key.pem"
  secret?: string; // partnerKey 微信支付安全密钥
  key_v3?: string; // APIv3密钥，参考：https://kf.qq.com/faq/180830E36vyQ180830AZFZvu.html
  h5_app_name?: string;
  h5_app_url?: string;
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

export interface I_transfer_tenpay extends I_transfer {
  user_name?: string;
  transfer_scene_id?: string;
}

export interface I_query_transfer_tenpay extends I_query {
  need_query_detail?: boolean;
  offset?: number;
  limit?: number;
  detail_status?: 'ALL' | 'SUCCESS' | 'FAIL';
}

export interface I_query_transfer_detail_tenpay extends I_query {
  detail_unique: string;
}

export interface I_tenpay_verify_notify_sign {
  /**
   * Original request body (raw string is recommended for stable signature verification)
   */
  body: string | T_tenpay_notification;
  /**
   * Request headers (Node lower-case keys and canonical keys are both accepted)
   */
  headers: Record<string, string | string[] | undefined>;
}

export function to_tenpay_fee(fee: string | number) {
  return round_int(n(fee).times(100));
}

export function from_tenpay_fee(fee: string | number) {
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

export interface O_tenpay_pay_app extends O_pay {
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
  package: string;
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

export interface O_tenpay_qrcode {
  status: number;
  data: {
    code_url: string;
  };
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
    algorithm?: string;
    aithm?: string;
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

export interface O_tenpay_bill_download {
  url: string;
  raw: any;
}

export interface O_tenpay_transfer {
  out_batch_no: string;
  raw: any;
}

export interface O_tenpay_query_transfer {
  raw: any;
}

export interface O_tenpay_query_transfer_detail {
  raw: any;
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
    refund_fee: number;
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

export interface I_refund_tenpay extends I_refund {}
