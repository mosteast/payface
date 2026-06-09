import { T_url_payment } from './type';

export type PaymentProvider = 'alipay' | 'tenpay' | 'stripe';
export type PaymentStatus = 'pending' | 'paid' | 'closed' | 'refunded' | 'failed' | 'unknown';
export type RefundStatus = 'pending' | 'succeeded' | 'canceled' | 'failed' | 'unknown';
export type NotifyKind = 'payment' | 'refund' | 'subscription' | 'transfer' | 'unknown';
export type MoneyInput = string | number;
export type PayfaceCapability =
  | 'pay_qrcode'
  | 'pay_mobile_web'
  | 'pay_app'
  | 'pay_jsapi'
  | 'transfer'
  | 'balance'
  | 'close'
  | 'parse_notify';

/**
 * @deprecated Prefer composing against PayfaceCore plus the explicit capability interfaces.
 */
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
   * @deprecated Prefer parse_notify() for new integrations.
   */
  verify_notify_sign(data: any): Promise<any>;

  /**
   * Normalize payment/refund notification into a common envelope
   */
  parse_notify(data: any): Promise<NotifyEnvelope>;

  /**
   * Build provider specific notify ack payload
   */
  build_notify_ack(): NotifyAck;

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

  /**
   * Close unpaid order
   */
  close(opt: I_close): Promise<void>;

  /**
   * Detect provider capabilities
   */
  supports(capability: PayfaceCapability): boolean;
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
  status: PaymentStatus;
  raw_status?: string;
  channel: PaymentProvider;
  /**
   * Datetime ISO String
   */
  created_at?: string;
  paid_at?: string;
  currency?: string;
  raw: T;
}

export interface T_opt_payface {
  id?: string;
  secret?: string;
  notify_url?: string;
  debug?: boolean;
}

export interface I_pay {
  fee: MoneyInput;
  unique?: string;
  subject?: string;
  notify_url?: string;
}

export interface O_pay {
  /**
   * Raw response
   */
  raw: any;
}

export interface I_transfer {
  fee: MoneyInput;
  tid: string; // target id in 3rd party platform (like alipay id or wechat id)
  unique?: string;
  subject?: string;
}

export interface I_query {
  unique: string;
}

export interface I_close extends I_query {}

export interface I_refund extends I_query {
  /**
   * Refund value (should ≤ than fee)
   */
  refund: MoneyInput;

  /**
   * Merchant refund unique id (maps to out_request_no / out_refund_no)
   */
  refund_unique?: string;

  /**
   * Original order total fee (Required for some payment platform like Tenpay/Wechat)
   */
  fee?: MoneyInput;
}

export interface I_refund_query {
  unique: string;
  refund_unique?: string;
}

export interface I_verify extends I_query {}

export interface T_refund<T> {
  ok: boolean;
  pending?: boolean;
  refund: string;
  status: RefundStatus;
  raw_status?: string;
  channel: PaymentProvider;
  raw: T;
}

export interface NotifyEnvelope<T = any> {
  provider: PaymentProvider;
  kind: NotifyKind;
  unique?: string;
  refund_unique?: string;
  status: PaymentStatus | RefundStatus;
  raw_status?: string;
  fee?: string;
  refund?: string;
  currency?: string;
  event_id?: string;
  occurred_at?: string;
  raw: T;
}

export interface NotifyAck {
  statusCode: number;
  body: any;
  headers?: Record<string, string>;
}

export interface PayfaceCore {
  verify_notify_sign(data: any): Promise<any>;
  parse_notify(data: any): Promise<NotifyEnvelope>;
  build_notify_ack(): NotifyAck;
  query(opt: I_query): Promise<T_receipt<any> | undefined>;
  verify(opt: I_verify): Promise<T_receipt<any>>;
  refund(opt: I_refund): Promise<void>;
  refund_query(opt: I_refund_query): Promise<T_refund<any>>;
  supports(capability: PayfaceCapability): boolean;
}

export interface PayfaceQr {
  pay_qrcode(...args: any[]): Promise<T_url_payment>;
}

export interface PayfaceMobileWeb {
  pay_mobile_web(...args: any[]): Promise<T_url_payment>;
}

export interface PayfaceApp {
  pay_app(...args: any[]): Promise<any>;
}

export interface PayfaceJsapi {
  pay_jsapi(...args: any[]): Promise<any>;
}

export interface PayfaceTransfer {
  transfer(...args: any[]): Promise<any>;
}

export interface PayfaceBalance {
  get_balance(...args: any[]): Promise<any>;
}

export interface PayfaceClosable {
  close(opt: I_close): Promise<void>;
}
