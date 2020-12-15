export abstract class Payface {
  /**
   * Returns payment qrcode string (URL mostly)
   */
  abstract async pay_qrcode(): Promise<string>
}

export interface T_opt_payface {
  key?: string
  secret?: string
}
