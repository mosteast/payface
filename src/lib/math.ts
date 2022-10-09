/**
 * Big number
 */
import Decimal from "decimal.js";
import Value = Decimal.Value;

export type I_bignumber = Value;

export function n(value?: Value): Decimal {
  return new Decimal(value || 0);
}

export function n_dp(x: I_bignumber, dp: number): Decimal {
  return n(x).toDecimalPlaces(dp);
}

export function n_money(x: I_bignumber, dp = 2): Decimal {
  return n_dp(x, dp);
}

export function n_int(x: I_bignumber, dp = 0): Decimal {
  return n_dp(x, dp);
}

export function round_int(x: I_bignumber): number {
  return n_int(x).toNumber();
}

export function round_money(x: I_bignumber, dp?: number): number {
  return n_money(x, dp).toNumber();
}
