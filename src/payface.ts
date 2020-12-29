export interface Payface {
  /**
   * Returns payment qrcode string (URL mostly)
   */
  pay_qrcode(...args: any[]): Promise<string>
}

export interface T_opt_payface {
  id?: string
  secret?: string
  notify_url: string
}

export interface I_pay_qrcode {
  fee: number
  order_id?: string
  subject?: string
  notify_url?: string
}
