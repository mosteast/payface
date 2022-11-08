import AlipaySdk, { AlipaySdkConfig } from "alipay-sdk";
import AlipayFormData from "alipay-sdk/lib/form";
import { sign } from "alipay-sdk/lib/util";
import { parse } from "date-fns";
import { values } from "lodash";
import { URLSearchParams } from "url";
import { Base } from "./base";
import { Api_error } from "./error/api_error";
import {
  Invalid_argument,
  Invalid_argument_external,
} from "./error/invalid_argument";
import { require_all } from "./error/util/lack_argument";
import { Verification_error } from "./error/verification_error";
import { n, round_money } from "./lib/math";
import {
  I_query,
  I_transfer,
  I_verify,
  Payface,
  T_opt_payface,
  T_receipt,
} from "./payface";
import { T_url } from "./type";
import { random_unique } from "./util";

export class Alipay extends Base implements Payface {
  public sdk!: AlipaySdk;
  protected opt!: T_opt_alipay;

  constructor(opt: T_opt_alipay) {
    super(opt);
    this.opt = opt;
    const {
      id,
      secret,
      alipay_public_cert,
      alipay_root_cert,
      alipay_public_key,
      app_cert,
      auth_type,
    } = opt;
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
        require_all({
          id,
          secret,
          alipay_root_cert,
          alipay_public_cert,
          app_cert,
        });

        this.sdk = new AlipaySdk({
          appId: id,
          privateKey: secret,
          alipayRootCertContent: alipay_root_cert,
          alipayPublicCertContent: alipay_public_cert,
          appCertContent: app_cert,
        });
        break;
      default:
        throw new Invalid_argument_external(
          "Invalid {auth_type}, should be one of: " +
            JSON.stringify(values(N_alipay_auth_type))
        );
    }
  }

  sign(action: string, params: any): string {
    const config = this.sdk.config;
    const data = sign(action, params, config);
    return config.gateway + "?" + new URLSearchParams(data).toString();
  }

  async pay_qrcode(opt: I_pay_qrcode_alipay): Promise<T_url> {
    const { qrcode } = opt;
    opt.product_code = "FAST_INSTANT_TRADE_PAY";
    opt.content = {
      qr_pay_mode: 4,
      qrcode_width: qrcode?.width || 200,
    };
    return this.pay_common(opt);
  }

  async pay_mobile_web(opt: I_pay_alipay): Promise<T_url> {
    opt.product_code = "FAST_INSTANT_TRADE_PAY";
    opt.method = "alipay.trade.wap.pay";
    return this.pay_common(opt);
  }

  async pay_app(opt: I_pay_alipay): Promise<T_url> {
    const p = this.build_params(opt);
    p.bizContent.ProductCode = "QUICK_MSECURITY_PAY";
    const formData = new AlipayFormData();
    formData.setMethod("get");
    formData.addField("bizContent", p.bizContent);
    formData.addField("notifyUrl", p.notify_url);
    const url = (await this.sdk.exec(
      "alipay.trade.app.pay",
      {},
      { formData }
    )) as string;
    return { url }; // https://openapi.alipay.com/gateway.do?app_cert_sn=31...
  }

  async pay_common(opt: I_pay_alipay): Promise<T_url> {
    const { fee } = opt;
    let { method } = opt;
    require_all({ fee });

    const notify_url = this.opt.notify_url;
    if (!notify_url) {
      throw new Invalid_argument("Empty {notify_url}");
    }
    method = method || "alipay.trade.page.pay";

    return { url: this.sign(method, this.build_params(opt)) };
  }

  build_params({
    unique,
    fee,
    subject,
    return_url,
    content,
    product_code,
  }: I_pay_alipay) {
    return {
      notify_url: this.opt.notify_url,
      return_url: return_url || "https://alipay.com",
      bizContent: {
        total_amount: fee,
        out_trade_no: unique || random_unique(),
        product_code,
        subject: subject || "Quick pay",
        ...content,
      },
    };
  }

  /**
   * Transfer money to an alipay account (could withdraw money for user)
   */
  async transfer({
    legal_name,
    fee,
    tid,
    unique,
    subject,
  }: I_transfer_alipay): Promise<boolean> {
    require_all({ fee });
    const r: any = await this.sdk.exec("alipay.fund.trans.uni.transfer", {
      bizContent: {
        out_biz_no: unique || random_unique(),
        trans_amount: fee,
        product_code: "TRANS_ACCOUNT_NO_PWD",
        payee_info: {
          identity_type: "ALIPAY_LOGON_ID",
          identity: tid,
          name: legal_name,
        },
        order_title: subject || "Direct Transfer",
        biz_scene: "DIRECT_TRANSFER",
      },
    });

    if (r.status !== "SUCCESS") {
      throw new Api_error(
        "Transfer rejected by Alipay: " + JSON.stringify(r),
        r
      );
    }

    return true;
  }

  async get_balance(): Promise<O_get_balance> {
    const r: any = await this.sdk.exec("alipay.data.bill.balance.query");

    if (r.status !== "SUCCESS" && r.msg !== "Success") {
      throw new Api_error("Rejected by Alipay: " + JSON.stringify(r), r);
    }

    return {
      total: r.totalAmount,
      frozen: r.freezeAmount,
    };
  }

  async verify_notify_sign(data: any): Promise<boolean> {
    return this.sdk.checkNotifySign(data);
  }

  async query({
    unique,
  }: I_query): Promise<T_receipt<T_order_alipay> | undefined> {
    const raw = (await this.sdk.exec("alipay.trade.query", {
      bizContent: { out_trade_no: unique },
    })) as T_order_alipay;

    if (!raw?.code) {
      return;
    }

    let patch: Partial<T_receipt<T_order_alipay>> = {};
    const ok =
      raw.code === "10000" &&
      raw.tradeStatus?.toLowerCase() === "trade_finished";
    if (ok) {
      patch = {
        unique: raw.outTradeNo,
        fee: round_money(n(raw.totalAmount)).toString(),
        created_at: parse(
          raw.sendPayDate,
          "yyyy-MM-dd HH:mm:ss",
          new Date()
        ).toISOString(),
      };
    }

    return {
      ok,
      raw,
      ...patch,
    } as T_receipt<T_order_alipay>;
  }

  async verify(opt: I_verify): Promise<T_receipt<T_order_alipay>> {
    const r = await this.query(opt);
    if (!r?.ok) {
      throw new Verification_error(r);
    }

    return r;
  }
}

export enum N_alipay_auth_type {
  secret = "secret",
  cert = "cert",
}

export interface T_opt_alipay extends T_opt_payface {
  id: string; // appid 应用id
  secret: string; // app private key 应用私钥
  auth_type: N_alipay_auth_type;
  alipay_public_key?: string; // alipay public key 支付宝公钥
  alipay_root_cert?: string | Buffer; // alipay root cert content 支付宝根证书内容
  alipay_public_cert?: string | Buffer; // alipay public cert content 支付宝公钥证书内容
  app_cert?: string | Buffer; // app cert content 应用证书内容
  opt_common?: AlipaySdkConfig;
}

export interface I_pay_alipay {
  method?: string;
  product_code?: "TRANS_ACCOUNT_NO_PWD" | "FAST_INSTANT_TRADE_PAY";
  return_url?: string;
  content?: any;

  [key: string]: any;
}

export interface I_pay_qrcode_alipay extends I_pay_alipay {
  qrcode?: {
    width?: number;
  };
}

export interface I_transfer_alipay extends I_transfer {
  legal_name: string;
}

export interface O_get_balance {
  total: string;
  frozen?: string;
}

/**
 * Example:
 * {
 *   "code": "10000",
 *   "msg": "Success",
 *   "buyerLogonId": "the***@gmail.com",
 *   "buyerPayAmount": "0.00",
 *   "buyerUserId": "2088802470345283",
 *   "invoiceAmount": "0.00",
 *   "outTradeNo": "MOCK_15_1550056829_uy9mO8Mz",
 *   "pointAmount": "0.00",
 *   "receiptAmount": "0.00",
 *   "sendPayDate": "2019-02-13 19:20:44",
 *   "totalAmount": "0.20",
 *   "tradeNo": "2019021322001445281015794830",
 *   "tradeStatus": "TRADE_FINISHED"
 * }
 */
export interface T_order_alipay {
  code: string;
  msg: string;
  buyerLogonId: string;
  buyerPayAmount: string;
  buyerUserId: string;
  invoiceAmount: string;
  outTradeNo: string;
  pointAmount: string;
  receiptAmount: string;
  sendPayDate: string;
  totalAmount: string;
  tradeNo: string;
  tradeStatus: string;
}
