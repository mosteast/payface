export interface T_object {
  [key: string]: any;
}

/**
 * Error level
 *
 * Always modify this with cation, since different level could
 * means different logic and action.
 */
export enum E_level {
  internal = 'internal',
  external = 'external',
}

export interface T_url_payment {
  url: string;
  /**
   * Timestamp to sign
   */
  timestamp_sign?: string;
  /**
   * Raw response
   */
  raw?: any;
}
