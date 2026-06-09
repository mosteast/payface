import debug from 'debug';
import Stripe_sdk from 'stripe';
import { Base } from './base';
import { Invalid_argument_external } from './error/invalid_argument';
import { Invalid_state_external } from './error/invalid_state';
import { require_all } from './error/util/lack_argument';
import { Verification_error } from './error/verification_error';
import { n, round_money } from './lib/math';
import {
  I_close,
  I_pay,
  I_query,
  I_refund,
  I_refund_query,
  I_transfer,
  I_verify,
  NotifyAck,
  NotifyEnvelope,
  Payface,
  PaymentStatus,
  PayfaceCapability,
  RefundStatus,
  T_opt_payface,
  T_receipt,
  T_refund,
} from './payface';
import { T_url_payment } from './type';
import { get_header_value, random_unique } from './util';

const _ = debug('payface:stripe');

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

const THREE_DECIMAL_CURRENCIES = new Set(['bhd', 'iqd', 'jod', 'kwd', 'lyd', 'omr', 'tnd']);
const SUBSCRIPTION_OK_STATUS = new Set(['active', 'trialing']);

function to_currency_decimals(currency?: string): number {
  const c = (currency || 'usd').toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(c)) return 3;
  return 2;
}

function to_minor_amount(amount: string | number, currency?: string): number {
  const decimals = to_currency_decimals(currency);
  return n(amount).times(n(10).pow(decimals)).toDecimalPlaces(0).toNumber();
}

function from_minor_amount(amount?: number | null, currency?: string): string {
  const decimals = to_currency_decimals(currency);
  return round_money(n(amount || 0).div(n(10).pow(decimals)), decimals);
}

function to_iso_date(unix?: number | null): string | undefined {
  if (!unix) return;
  return new Date(unix * 1000).toISOString();
}

function normalize_metadata(data: Record<string, string | number | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in data) {
    const v = data[k];
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
}

function to_expanded_object<T>(data: string | T | null | undefined): T | undefined {
  if (!data || typeof data === 'string') return;
  return data;
}

function to_expanded_id<T extends { id: string }>(data: string | T | null | undefined): string | undefined {
  if (!data) return;
  if (typeof data === 'string') return data;
  return data.id;
}

function is_not_found_error(error: any): boolean {
  return error?.statusCode === 404 || error?.raw?.code === 'resource_missing';
}

function escape_search_query_value(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function to_stripe_refund_status(status?: string | null): RefundStatus {
  switch (status) {
    case 'pending':
    case 'requires_action':
      return 'pending';
    case 'succeeded':
      return 'succeeded';
    case 'canceled':
      return 'canceled';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

export class Stripe extends Base implements Payface {
  public sdk!: Stripe_sdk;
  protected opt!: T_opt_stripe;

  constructor(opt: T_opt_stripe) {
    super(opt);
    this.opt = opt;
    const sdk_opt: Stripe_sdk.StripeConfig = {};
    if (opt.api_version) {
      (sdk_opt as any).apiVersion = opt.api_version;
    }
    this.sdk = new Stripe_sdk(opt.secret, sdk_opt);
  }

  protected validate_opt(opt: T_opt_stripe) {
    super.validate_opt(opt);
    require_all({ secret: opt.secret });
  }

  async pay_qrcode(_: I_pay_qrcode_stripe): Promise<T_url_payment> {
    throw new Invalid_argument_external('Stripe does not support pay_qrcode in this SDK');
  }

  async pay_mobile_web(opt: I_pay_mobile_web_stripe): Promise<T_url_payment> {
    require_all({ success_url: opt.success_url, cancel_url: opt.cancel_url });
    const unique = opt.unique || random_unique();
    const subject = opt.subject || 'Quick pay';
    const mode = opt.mode || N_stripe_checkout_mode.payment;
    const quantity = opt.quantity || 1;
    const currency = (opt.currency || this.opt.currency || 'usd').toLowerCase();
    const metadata = normalize_metadata({
      unique,
      subject,
      product_id: opt.product_id,
      client_ip: opt.client_ip,
      ...opt.metadata,
    });

    const params: Stripe_sdk.Checkout.SessionCreateParams = {
      mode,
      success_url: opt.success_url,
      cancel_url: opt.cancel_url,
      client_reference_id: unique,
      metadata,
      customer_email: opt.customer_email,
      locale: opt.locale as any,
      payment_method_types: opt.payment_method_types?.length
        ? (opt.payment_method_types as Stripe_sdk.Checkout.SessionCreateParams.PaymentMethodType[])
        : undefined,
    };

    if (mode === N_stripe_checkout_mode.subscription) {
      require_all({ price_id: opt.price_id });
      params.line_items = [
        {
          price: opt.price_id as string,
          quantity,
        },
      ];
      params.subscription_data = { metadata };
    } else {
      if (opt.price_id) {
        params.line_items = [
          {
            price: opt.price_id,
            quantity,
          },
        ];
      } else {
        require_all({ fee: opt.fee });
        params.line_items = [
          {
            quantity,
            price_data: {
              currency,
              unit_amount: to_minor_amount(opt.fee as string, currency),
              product_data: {
                name: subject,
              },
            },
          },
        ];
      }
      params.payment_intent_data = { metadata };
    }

    _('pay_mobile_web.checkout.session.create.I: %o', params);
    const raw = await this.sdk.checkout.sessions.create(params, {
      idempotencyKey: unique,
    });
    _('pay_mobile_web.checkout.session.create.O: %o', raw);
    if (!raw.url) {
      throw new Invalid_state_external('Stripe checkout session returned empty url');
    }

    return {
      url: raw.url,
      raw,
    };
  }

  async verify_notify_sign(data: I_stripe_verify_notify_sign): Promise<Stripe_sdk.Event> {
    const webhook_secret = data.webhook_secret || this.opt.webhook_secret;
    require_all({ webhook_secret });
    require_all({ body: data.body });

    if (!Buffer.isBuffer(data.body) && typeof data.body !== 'string') {
      throw new Invalid_argument_external('Stripe webhook verification requires raw body string or Buffer');
    }

    const signature = data.signature || get_header_value(data.headers || {}, 'stripe-signature');
    require_all({ signature });

    let event: Stripe_sdk.Event;
    try {
      event = this.sdk.webhooks.constructEvent(data.body, signature as any, webhook_secret as string);
    } catch (e: any) {
      throw new Invalid_argument_external(`Invalid Stripe webhook signature: ${e?.message || e}`);
    }

    const trusted_event_types = data.trusted_event_types || this.opt.trusted_event_types;
    if (trusted_event_types?.length && !trusted_event_types.includes(event.type)) {
      throw new Invalid_argument_external(`Untrusted Stripe webhook event type: ${event.type}`);
    }

    return event;
  }

  async parse_notify(data: I_stripe_verify_notify_sign): Promise<NotifyEnvelope> {
    const event = await this.verify_notify_sign(data);
    return this.to_notify_envelope(event);
  }

  build_notify_ack(): NotifyAck {
    return {
      statusCode: 200,
      body: '',
      headers: {},
    };
  }

  async query({ unique }: I_query): Promise<T_receipt<Stripe_sdk.Checkout.Session> | undefined> {
    const raw = await this.find_session_by_unique(unique);
    if (!raw) {
      return;
    }

    const currency = this.get_session_currency(raw);
    const fee = from_minor_amount(this.get_session_total(raw), currency);
    const status = this.get_session_status(raw);
    const ok = status === 'paid';
    const created_at = to_iso_date(raw.created);
    const paid_at = ok ? this.get_paid_at(raw, created_at) : undefined;
    return {
      ok,
      status,
      raw_status: this.get_session_raw_status(raw),
      channel: 'stripe',
      unique: raw.client_reference_id || unique,
      fee,
      created_at,
      paid_at,
      currency,
      raw,
    };
  }

  async verify(opt: I_verify): Promise<T_receipt<Stripe_sdk.Checkout.Session>> {
    const r = await this.query(opt);
    if (!r?.ok) {
      throw new Verification_error(r);
    }
    return r;
  }

  async refund({ unique, refund, refund_unique }: I_refund): Promise<void> {
    require_all({ unique, refund });
    const session = await this.find_session_by_unique(unique);
    if (!session) {
      throw new Invalid_state_external(`Could not find checkout session by unique: "${unique}"`);
    }
    const payment_intent = this.get_session_payment_intent_id(session);
    if (!payment_intent) {
      throw new Invalid_state_external(`Could not find payment intent by unique: "${unique}"`);
    }
    const currency = this.get_session_currency(session);
    const amount = to_minor_amount(refund, currency);

    const raw = await this.sdk.refunds.create(
      {
        payment_intent,
        amount,
        metadata: normalize_metadata({
          unique,
          refund_unique,
        }),
      },
      {
        idempotencyKey: refund_unique || `${unique}_refund_${amount}`,
      },
    );
    if (raw.status === 'failed' || raw.status === 'canceled') {
      throw new Invalid_state_external(`Stripe refund failed, status: ${raw.status}`);
    }
  }

  async refund_query({ unique, refund_unique }: I_refund_query): Promise<T_refund<Stripe_sdk.Refund>> {
    require_all({ unique });
    const session = await this.find_session_by_unique(unique);
    if (!session) {
      throw new Invalid_state_external(`Could not find checkout session by unique: "${unique}"`);
    }
    const payment_intent = this.get_session_payment_intent_id(session);
    if (!payment_intent) {
      throw new Invalid_state_external(`Could not find payment intent by unique: "${unique}"`);
    }

    const list = await this.sdk.refunds.list({
      payment_intent,
      limit: refund_unique ? 100 : 10,
    });
    const raw =
      list.data?.find((x) => x.id === refund_unique || x.metadata?.refund_unique === refund_unique) || list.data?.[0];
    if (!raw) {
      throw new Invalid_state_external(`Could not query refund by unique: "${unique}"`);
    }
    const status = to_stripe_refund_status(raw.status);

    return {
      raw,
      refund: from_minor_amount(raw.amount, raw.currency),
      ok: status === 'succeeded',
      pending: status === 'pending',
      status,
      raw_status: raw.status || undefined,
      channel: 'stripe',
    };
  }

  private async find_session_by_unique(unique: string): Promise<Stripe_sdk.Checkout.Session | undefined> {
    try {
      if (unique.startsWith('cs_')) {
        return await this.sdk.checkout.sessions.retrieve(unique, {
          expand: ['payment_intent', 'invoice.payments.data.payment.payment_intent', 'subscription'],
        });
      }

      const query_value = escape_search_query_value(unique);

      // Prefer direct lookup via payment_intent metadata for one-time payments.
      const payment_intent_result = await this.sdk.paymentIntents.search({
        query: `metadata['unique']:'${query_value}'`,
        limit: 1,
      });
      const payment_intent_id = payment_intent_result.data?.[0]?.id;
      if (payment_intent_id) {
        const by_payment_intent = await this.sdk.checkout.sessions.list({
          payment_intent: payment_intent_id,
          limit: 1,
          expand: ['data.payment_intent', 'data.invoice.payments.data.payment.payment_intent', 'data.subscription'],
        });
        if (by_payment_intent.data?.[0]) {
          return by_payment_intent.data[0];
        }
      }

      // Subscription payments can be resolved by subscription metadata -> checkout session.
      const subscription_result = await this.sdk.subscriptions.search({
        query: `metadata['unique']:'${query_value}'`,
        limit: 1,
      });
      const subscription_id = subscription_result.data?.[0]?.id;
      if (subscription_id) {
        const by_subscription = await this.sdk.checkout.sessions.list({
          subscription: subscription_id,
          limit: 1,
          expand: ['data.payment_intent', 'data.invoice.payments.data.payment.payment_intent', 'data.subscription'],
        });
        if (by_subscription.data?.[0]) {
          return by_subscription.data[0];
        }
      }

      // Fallback scan for environments where search has lag/limits.
      return await this.find_session_by_scan(unique);
    } catch (e: any) {
      if (is_not_found_error(e)) return;
      throw new Invalid_state_external(`Stripe query failed: ${e?.message || e}`);
    }
  }

  private async find_session_by_scan(unique: string): Promise<Stripe_sdk.Checkout.Session | undefined> {
    let starting_after: string | undefined;
    for (let i = 0; i < 5; i += 1) {
      const list = await this.sdk.checkout.sessions.list({
        limit: 100,
        starting_after,
        expand: ['data.payment_intent', 'data.invoice.payments.data.payment.payment_intent', 'data.subscription'],
      });
      const found = list.data.find((x) => x.client_reference_id === unique);
      if (found) return found;
      if (!list.has_more || !list.data.length) break;
      starting_after = list.data[list.data.length - 1].id;
    }
    return;
  }

  private get_session_total(session: Stripe_sdk.Checkout.Session): number {
    if (typeof session.amount_total === 'number') {
      return session.amount_total;
    }
    const invoice = to_expanded_object<Stripe_sdk.Invoice>(session.invoice);
    if (typeof invoice?.amount_paid === 'number') {
      return invoice.amount_paid;
    }
    if (typeof invoice?.amount_due === 'number') {
      return invoice.amount_due;
    }
    const payment_intent = to_expanded_object<Stripe_sdk.PaymentIntent>(session.payment_intent);
    if (typeof payment_intent?.amount_received === 'number') {
      return payment_intent.amount_received;
    }
    return 0;
  }

  private get_session_currency(session: Stripe_sdk.Checkout.Session): string {
    if (session.currency) {
      return session.currency.toLowerCase();
    }
    const invoice = to_expanded_object<Stripe_sdk.Invoice>(session.invoice);
    if (invoice?.currency) {
      return invoice.currency.toLowerCase();
    }
    const payment_intent = to_expanded_object<Stripe_sdk.PaymentIntent>(session.payment_intent);
    if (payment_intent?.currency) {
      return payment_intent.currency.toLowerCase();
    }
    return (this.opt.currency || 'usd').toLowerCase();
  }

  private get_session_payment_intent_id(session: Stripe_sdk.Checkout.Session): string | undefined {
    const from_session = to_expanded_id(session.payment_intent as any);
    if (from_session) return from_session;

    const invoice = to_expanded_object<Stripe_sdk.Invoice>(session.invoice);
    const invoice_payment = invoice?.payments?.data?.[0];
    return to_expanded_id(invoice_payment?.payment?.payment_intent as any);
  }

  private is_session_paid(session: Stripe_sdk.Checkout.Session): boolean {
    return this.get_session_status(session) === 'paid';
  }

  private get_paid_at(session: Stripe_sdk.Checkout.Session, fallback?: string): string | undefined {
    const payment_intent = to_expanded_object<Stripe_sdk.PaymentIntent>(session.payment_intent);
    if (payment_intent?.status === 'succeeded') {
      return to_iso_date(payment_intent.created) || fallback;
    }
    const invoice = to_expanded_object<Stripe_sdk.Invoice>(session.invoice);
    const paid_at = (invoice as any)?.status_transitions?.paid_at as number | undefined;
    return to_iso_date(paid_at) || fallback;
  }

  private get_session_status(session: Stripe_sdk.Checkout.Session): PaymentStatus {
    if ((session as any).status === 'expired') {
      return 'closed';
    }

    if (session.mode === 'payment') {
      if (session.payment_status === 'paid') return 'paid';
      return 'pending';
    }

    if (session.mode === 'subscription') {
      const subscription = to_expanded_object<Stripe_sdk.Subscription>(session.subscription);
      if (subscription?.status) {
        if (SUBSCRIPTION_OK_STATUS.has(subscription.status)) return 'paid';
        if (subscription.status === 'canceled' || subscription.status === 'unpaid') return 'failed';
        if (subscription.status === 'incomplete_expired') return 'closed';
        return 'pending';
      }
      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') return 'paid';
      return 'pending';
    }

    return 'unknown';
  }

  private get_session_raw_status(session: Stripe_sdk.Checkout.Session): string {
    const subscription = to_expanded_object<Stripe_sdk.Subscription>(session.subscription);
    return subscription?.status || session.payment_status || session.status || 'unknown';
  }

  private to_notify_envelope(event: Stripe_sdk.Event): NotifyEnvelope {
    const occurred_at = to_iso_date(event.created);
    if (event.type.startsWith('checkout.session.')) {
      const session = event.data.object as Stripe_sdk.Checkout.Session;
      const kind = session.mode === 'subscription' ? 'subscription' : 'payment';
      const unique = session.client_reference_id || session.metadata?.unique || session.id;
      return {
        provider: 'stripe',
        kind,
        unique,
        status: this.get_session_status(session),
        raw_status: this.get_session_raw_status(session),
        fee: from_minor_amount(session.amount_total || 0, session.currency || this.opt.currency),
        currency: session.currency?.toLowerCase() || this.opt.currency?.toLowerCase(),
        event_id: event.id,
        occurred_at,
        raw: event,
      };
    }

    if (event.type.startsWith('refund.')) {
      const refund = event.data.object as Stripe_sdk.Refund;
      const status = to_stripe_refund_status(refund.status);
      return {
        provider: 'stripe',
        kind: 'refund',
        unique: refund.metadata?.unique,
        refund_unique: refund.metadata?.refund_unique || refund.id,
        status,
        raw_status: refund.status || undefined,
        refund: from_minor_amount(refund.amount, refund.currency),
        currency: refund.currency?.toLowerCase(),
        event_id: event.id,
        occurred_at,
        raw: event,
      };
    }

    return {
      provider: 'stripe',
      kind: 'unknown',
      status: 'unknown',
      event_id: event.id,
      occurred_at,
      raw: event,
    };
  }

  async close({ unique }: I_close): Promise<void> {
    const session_id = unique.startsWith('cs_') ? unique : (await this.find_session_by_unique(unique))?.id;
    if (!session_id) {
      throw new Invalid_state_external(`Could not find checkout session by unique: "${unique}"`);
    }
    await this.sdk.checkout.sessions.expire(session_id);
  }

  supports(capability: PayfaceCapability): boolean {
    return new Set<PayfaceCapability>(['pay_mobile_web', 'close', 'parse_notify', 'transfer']).has(capability);
  }

  async create_payout({
    fee,
    currency,
    unique,
    subject,
    destination,
    metadata,
  }: I_create_payout_stripe): Promise<O_stripe_payout> {
    require_all({ fee });
    const resolved_currency = (currency || this.opt.currency || 'usd').toLowerCase();
    const idempotencyKey = unique || random_unique();
    const raw = await this.sdk.payouts.create(
      {
        amount: to_minor_amount(fee as string, resolved_currency),
        currency: resolved_currency,
        destination,
        description: subject,
        metadata: normalize_metadata(metadata || {}),
      },
      {
        idempotencyKey,
      },
    );
    return { raw };
  }

  async get_payout(id: string): Promise<Stripe_sdk.Payout> {
    return this.sdk.payouts.retrieve(id);
  }

  async cancel_payout(id: string): Promise<Stripe_sdk.Payout> {
    return this.sdk.payouts.cancel(id);
  }

  async create_transfer({
    fee,
    tid,
    unique,
    subject,
    currency,
    metadata,
  }: I_create_transfer_stripe): Promise<O_stripe_transfer> {
    require_all({ fee, tid });
    const resolved_currency = (currency || this.opt.currency || 'usd').toLowerCase();
    const idempotencyKey = unique || random_unique();
    const raw = await this.sdk.transfers.create(
      {
        amount: to_minor_amount(fee, resolved_currency),
        currency: resolved_currency,
        destination: tid,
        description: subject,
        metadata: normalize_metadata(metadata || {}),
      },
      {
        idempotencyKey,
      },
    );
    return { raw };
  }

  async get_transfer(id: string): Promise<Stripe_sdk.Transfer> {
    return this.sdk.transfers.retrieve(id);
  }
}

export enum N_stripe_checkout_mode {
  payment = 'payment',
  subscription = 'subscription',
}

export interface T_opt_stripe extends T_opt_payface {
  /**
   * Stripe Secret key (sk_test_... / sk_live_...)
   */
  secret: string;
  /**
   * Stripe webhook endpoint secret (whsec_...)
   */
  webhook_secret?: string;
  /**
   * Default currency for one-time "fee" mode.
   */
  currency?: string;
  /**
   * Optional Stripe API version pin.
   */
  api_version?: string;
  /**
   * Trusted webhook event types. If set, events outside this list will be rejected.
   */
  trusted_event_types?: string[];
}

export interface I_pay_qrcode_stripe extends Partial<I_pay> {}

export interface I_pay_mobile_web_stripe extends Partial<I_pay> {
  success_url: string;
  cancel_url: string;
  mode?: N_stripe_checkout_mode;
  currency?: string;
  quantity?: number;
  /**
   * Stripe Price ID. Required for subscription mode.
   */
  price_id?: string;
  product_id?: string;
  client_ip?: string;
  customer_email?: string;
  locale?: Stripe_sdk.Checkout.SessionCreateParams.Locale;
  payment_method_types?: string[];
  metadata?: Record<string, string | number | undefined>;
}

export interface I_stripe_verify_notify_sign {
  /**
   * Raw request body (string/Buffer). Do not JSON parse before verify.
   */
  body: string | Buffer;
  headers?: Record<string, string | string[] | undefined>;
  signature?: string | Buffer | Array<string>;
  webhook_secret?: string;
  trusted_event_types?: string[];
}

export interface I_create_payout_stripe extends Partial<I_pay> {
  currency?: string;
  destination?: string;
  metadata?: Record<string, string | number | undefined>;
}

export interface I_create_transfer_stripe extends I_transfer {
  currency?: string;
  metadata?: Record<string, string | number | undefined>;
}

export interface O_stripe_payout {
  raw: Stripe_sdk.Payout;
}

export interface O_stripe_transfer {
  raw: Stripe_sdk.Transfer;
}
