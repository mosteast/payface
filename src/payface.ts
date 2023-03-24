import { T_url_payment } from './type';

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
  verify_notify_sign(data: any): Promise<boolean>;

  /**
   * Query raw order data
   */
  query(opt: I_query): Promise<T_receipt<any> | undefined>;

  /**
   * Verify by order unique id
   */
  verify(opt: I_verify): Promise<T_receipt<any>>;

  /**
   * Refund order
   */
  refund(opt: I_refund): Promise<void>;

  /**
   * Query refund order
   */
  refund_query({ unique }: I_refund_query): Promise<T_refund<any>>;
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

export interface I_refund extends I_query {
  /**
   * Refund value (should ≤ than fee)
   */
  refund: number;
}

export interface I_refund_query {
  unique: string;
}

export interface I_verify extends I_query {}

export interface T_refund<T> {
  ok: boolean;
  pending?: boolean;
  refund: number;
  raw: T;
}
