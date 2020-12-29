export interface Payface {
  /**
   * Returns payment qrcode string (URL mostly)
   */
  pay_qrcode(...args: any[]): Promise<string>
}

export interface T_opt_payface {
  id?: string
  secret?: string
}
