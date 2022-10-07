export interface Payface {
  /**
   * Returns payment qrcode string (URL mostly)
   */
  pay_qrcode(...args: any[]): Promise<string>;

  /**
   * Returns mobile web payment string (URL mostly)
   */
  pay_mobile_web(...args: any[]): Promise<string>;

  /**
   * Verify notify signature
   */
  verify_notify_sign(data: any): Promise<boolean>;

  /**
   * Query raw order data
   */
  query<T = any>(opt: I_query): Promise<T>;

  /**
   * Verify by order unique id
   */
  verify(opt: I_verify): Promise<void>;
}

export interface T_opt_payface {
  id?: string;
  secret?: string;
  notify_url?: string;
  debug?: boolean;
}

export interface I_pay {
  fee: number;
  order_id?: string;
  subject?: string;
  notify_url?: string;
}

export interface I_transfer {
  fee: number;
  tid: string; // target id in 3rd party platform (like alipay id or wechat id)
  order_id?: string;
  subject?: string;
}

export interface I_query {
  order_id: string;
}

export interface I_verify extends I_query {}
