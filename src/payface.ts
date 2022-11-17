import { T_url_payment } from "./type";

export interface Payface {
  /**
   * Returns payment qrcode string (URL mostly)
   */
  pay_qrcode(...args: any[]): Promise<T_url_payment>;

  /**
   * Returns mobile web payment string (URL mostly)
   */
  pay_mobile_web(...args: any[]): Promise<T_url_payment>;

  /**
   * Verify notify signature
   */
  verify_notify_sign(data: any): Promise<false | any>;

  /**
   * Query raw order data
   */
  query(opt: I_query): Promise<T_receipt<any> | undefined>;

  /**
   * Verify by order unique id
   */
  verify(opt: I_verify): Promise<T_receipt<any>>;
}

export interface T_receipt<T> {
  /**
   * true: paid
   * false: unpaid
   */
  ok: boolean;
  /**
   * Order id, sometimes called "out trade id"
   */
  unique: string;
  fee: string;
  /**
   * Datetime ISO String
   */
  created_at?: string;
  paid_at?: string;
  raw: T;
}

export interface T_opt_payface {
  id?: string;
  secret?: string;
  notify_url?: string;
  debug?: boolean;
}

export interface I_pay {
  fee: number;
  unique?: string;
  subject?: string;
  notify_url?: string;
}

export interface I_transfer {
  fee: number;
  tid: string; // target id in 3rd party platform (like alipay id or wechat id)
  unique?: string;
  subject?: string;
}

export interface I_query {
  unique: string;
}

export interface I_verify extends I_query {}
