/**
 * Mobile-money rails: MTN MoMo Collections and Airtel Money Collections.
 *
 * HONESTY CONTRACT — read before changing anything here.
 *  - Nothing in this file ever invents a settlement. When merchant credentials
 *    are absent, every call returns `{ configured: false, status: "unconfigured" }`
 *    and the caller MUST record the payment as `pending`, never `settled`.
 *  - A payment only becomes `captured`/`settled` when the provider itself says
 *    SUCCESSFUL — either on a status poll or on a signed callback. An SMS or a
 *    screenshot is never proof.
 *  - Every request, response and callback is written to `payment_events` so a
 *    disputed transaction can be audited afterwards.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Rail = "momo" | "airtel";

export type RailResult = {
  configured: boolean;
  /** provider-side reference we can poll / match callbacks against */
  providerRef: string;
  status: "unconfigured" | "pending" | "successful" | "failed";
  providerStatus?: string | undefined;
  error?: string | undefined;
};

type Admin = SupabaseClient<Database>;

const MSISDN = /^\+?25[0-9]{10}$/;

/** MoMo and Airtel both want a bare MSISDN: 2507XXXXXXXX. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, "");
  const msisdn = digits.startsWith("250") ? digits : `250${digits.replace(/^0+/, "")}`;
  if (!MSISDN.test(msisdn)) throw new Error("Enter a Rwandan mobile money number, e.g. +250788123456");
  return msisdn;
}

export function minorToUnits(minor: number): string {
  // Both rails price in whole RWF; minor units are internal only.
  return String(Math.round(minor / 100));
}

async function log(
  admin: Admin,
  row: {
    paymentId?: string | null;
    provider: Rail;
    direction: "request" | "response" | "callback";
    action: string;
    providerRef?: string | null;
    httpStatus?: number | null;
    payload?: unknown;
    error?: string | null;
  },
) {
  await admin.from("payment_events").insert({
    payment_id: row.paymentId ?? null,
    provider: row.provider,
    direction: row.direction,
    action: row.action,
    provider_ref: row.providerRef ?? null,
    http_status: row.httpStatus ?? null,
    payload: (row.payload ?? {}) as never,
    error: row.error ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* MTN MoMo Collections                                                */
/* ------------------------------------------------------------------ */

type MomoConfig = {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  targetEnv: string;
  callbackUrl: string | undefined;
};

function momoConfig(): MomoConfig | null {
  const subscriptionKey = process.env["MTN_MOMO_SUBSCRIPTION_KEY"];
  const apiUser = process.env["MTN_MOMO_API_USER"];
  const apiKey = process.env["MTN_MOMO_API_KEY"];
  if (!subscriptionKey || !apiUser || !apiKey) return null;
  return {
    baseUrl: process.env["MTN_MOMO_BASE_URL"] ?? "https://sandbox.momodeveloper.mtn.com",
    subscriptionKey,
    apiUser,
    apiKey,
    targetEnv: process.env["MTN_MOMO_TARGET_ENV"] ?? "sandbox",
    callbackUrl: process.env["MTN_MOMO_CALLBACK_URL"],
  };
}

async function momoToken(cfg: MomoConfig): Promise<string> {
  const basic = btoa(`${cfg.apiUser}:${cfg.apiKey}`);
  const res = await fetch(`${cfg.baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Ocp-Apim-Subscription-Key": cfg.subscriptionKey,
    },
  });
  if (!res.ok) throw new Error(`MoMo token failed (${res.status})`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("MoMo token missing from response");
  return body.access_token;
}

/** Collect money from the driver (used for the hold and for any shortfall). */
async function momoCollect(
  admin: Admin,
  args: { phone: string; amountMinor: number; reference: string; note: string; paymentId?: string | null },
): Promise<RailResult> {
  const cfg = momoConfig();
  if (!cfg)
    return { configured: false, providerRef: args.reference, status: "unconfigured", error: "MTN MoMo credentials not configured" };

  const payload = {
    amount: minorToUnits(args.amountMinor),
    currency: cfg.targetEnv === "sandbox" ? "EUR" : "RWF",
    externalId: args.reference,
    payer: { partyIdType: "MSISDN", partyId: args.phone },
    payerMessage: args.note.slice(0, 60),
    payeeNote: args.note.slice(0, 60),
  };

  await log(admin, {
    paymentId: args.paymentId ?? null,
    provider: "momo",
    direction: "request",
    action: "requesttopay",
    providerRef: args.reference,
    payload: { ...payload, payer: { partyId: args.phone.slice(0, 6) + "******" } },
  });

  try {
    const token = await momoToken(cfg);
    const res = await fetch(`${cfg.baseUrl}/collection/v1_0/requesttopay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Reference-Id": args.reference,
        "X-Target-Environment": cfg.targetEnv,
        "Ocp-Apim-Subscription-Key": cfg.subscriptionKey,
        "Content-Type": "application/json",
        ...(cfg.callbackUrl ? { "X-Callback-Url": cfg.callbackUrl } : {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    await log(admin, {
      paymentId: args.paymentId ?? null,
      provider: "momo",
      direction: "response",
      action: "requesttopay",
      providerRef: args.reference,
      httpStatus: res.status,
      payload: { body: text.slice(0, 800) },
    });
    if (res.status !== 202)
      return { configured: true, providerRef: args.reference, status: "failed", error: `MoMo refused the request (${res.status})` };
    // Accepted, not paid. The driver still has to approve on the handset.
    return { configured: true, providerRef: args.reference, status: "pending", providerStatus: "ACCEPTED" };
  } catch (e) {
    const error = e instanceof Error ? e.message : "MoMo request failed";
    await log(admin, { provider: "momo", direction: "response", action: "requesttopay", providerRef: args.reference, error });
    return { configured: true, providerRef: args.reference, status: "failed", error };
  }
}

async function momoStatus(admin: Admin, reference: string, paymentId?: string | null): Promise<RailResult> {
  const cfg = momoConfig();
  if (!cfg) return { configured: false, providerRef: reference, status: "unconfigured" };
  try {
    const token = await momoToken(cfg);
    const res = await fetch(`${cfg.baseUrl}/collection/v1_0/requesttopay/${reference}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": cfg.targetEnv,
        "Ocp-Apim-Subscription-Key": cfg.subscriptionKey,
      },
    });
    const body = (await res.json().catch(() => ({}))) as { status?: string; reason?: string };
    await log(admin, {
      paymentId: paymentId ?? null,
      provider: "momo",
      direction: "response",
      action: "requesttopay-status",
      providerRef: reference,
      httpStatus: res.status,
      payload: body,
    });
    const status = (body.status ?? "").toUpperCase();
    return {
      configured: true,
      providerRef: reference,
      status: status === "SUCCESSFUL" ? "successful" : status === "FAILED" ? "failed" : "pending",
      providerStatus: status || undefined,
      error: body.reason,
    };
  } catch (e) {
    return { configured: true, providerRef: reference, status: "pending", error: e instanceof Error ? e.message : undefined };
  }
}

/** Return money to the driver (over-hold refund) via MoMo Disbursements. */
async function momoRefund(
  admin: Admin,
  args: { phone: string; amountMinor: number; reference: string; note: string; paymentId?: string | null },
): Promise<RailResult> {
  const cfg = momoConfig();
  const disbKey = process.env["MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY"];
  if (!cfg || !disbKey)
    return {
      configured: false,
      providerRef: args.reference,
      status: "unconfigured",
      error: "MTN MoMo disbursement credentials not configured — refund recorded as owing",
    };
  try {
    const basic = btoa(`${cfg.apiUser}:${cfg.apiKey}`);
    const tokenRes = await fetch(`${cfg.baseUrl}/disbursement/token/`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Ocp-Apim-Subscription-Key": disbKey },
    });
    const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
    if (!token) throw new Error("MoMo disbursement token missing");
    const res = await fetch(`${cfg.baseUrl}/disbursement/v1_0/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Reference-Id": args.reference,
        "X-Target-Environment": cfg.targetEnv,
        "Ocp-Apim-Subscription-Key": disbKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: minorToUnits(args.amountMinor),
        currency: cfg.targetEnv === "sandbox" ? "EUR" : "RWF",
        externalId: args.reference,
        payee: { partyIdType: "MSISDN", partyId: args.phone },
        payerMessage: args.note.slice(0, 60),
        payeeNote: args.note.slice(0, 60),
      }),
    });
    await log(admin, {
      paymentId: args.paymentId ?? null,
      provider: "momo",
      direction: "response",
      action: "transfer",
      providerRef: args.reference,
      httpStatus: res.status,
      payload: { body: (await res.text()).slice(0, 500) },
    });
    return {
      configured: true,
      providerRef: args.reference,
      status: res.status === 202 ? "pending" : "failed",
      providerStatus: res.status === 202 ? "ACCEPTED" : String(res.status),
    };
  } catch (e) {
    return { configured: true, providerRef: args.reference, status: "failed", error: e instanceof Error ? e.message : undefined };
  }
}

/* ------------------------------------------------------------------ */
/* Airtel Money Collections                                            */
/* ------------------------------------------------------------------ */

type AirtelConfig = { baseUrl: string; clientId: string; clientSecret: string; country: string; currency: string };

function airtelConfig(): AirtelConfig | null {
  const clientId = process.env["AIRTEL_CLIENT_ID"];
  const clientSecret = process.env["AIRTEL_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return {
    baseUrl: process.env["AIRTEL_BASE_URL"] ?? "https://openapiuat.airtel.africa",
    clientId,
    clientSecret,
    country: process.env["AIRTEL_COUNTRY"] ?? "RW",
    currency: process.env["AIRTEL_CURRENCY"] ?? "RWF",
  };
}

async function airtelToken(cfg: AirtelConfig): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/auth/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "client_credentials" }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`Airtel token failed (${res.status})`);
  return body.access_token;
}

async function airtelCollect(
  admin: Admin,
  args: { phone: string; amountMinor: number; reference: string; paymentId?: string | null },
): Promise<RailResult> {
  const cfg = airtelConfig();
  if (!cfg)
    return { configured: false, providerRef: args.reference, status: "unconfigured", error: "Airtel Money credentials not configured" };
  const payload = {
    reference: args.reference,
    subscriber: { country: cfg.country, currency: cfg.currency, msisdn: args.phone.slice(3) },
    transaction: { amount: Number(minorToUnits(args.amountMinor)), country: cfg.country, currency: cfg.currency, id: args.reference },
  };
  await log(admin, {
    paymentId: args.paymentId ?? null,
    provider: "airtel",
    direction: "request",
    action: "merchant-pay",
    providerRef: args.reference,
    payload: { ...payload, subscriber: { ...payload.subscriber, msisdn: "******" } },
  });
  try {
    const token = await airtelToken(cfg);
    const res = await fetch(`${cfg.baseUrl}/merchant/v1/payments/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Country": cfg.country,
        "X-Currency": cfg.currency,
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: { code?: string; success?: boolean; message?: string };
      data?: { transaction?: { status?: string } };
    };
    await log(admin, {
      paymentId: args.paymentId ?? null,
      provider: "airtel",
      direction: "response",
      action: "merchant-pay",
      providerRef: args.reference,
      httpStatus: res.status,
      payload: body,
    });
    const txStatus = (body.data?.transaction?.status ?? "").toUpperCase();
    if (!res.ok || body.status?.success === false)
      return { configured: true, providerRef: args.reference, status: "failed", error: body.status?.message ?? `Airtel refused (${res.status})` };
    return {
      configured: true,
      providerRef: args.reference,
      status: txStatus === "TS" ? "successful" : txStatus === "TF" ? "failed" : "pending",
      providerStatus: txStatus || "PENDING",
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Airtel request failed";
    await log(admin, { provider: "airtel", direction: "response", action: "merchant-pay", providerRef: args.reference, error });
    return { configured: true, providerRef: args.reference, status: "failed", error };
  }
}

async function airtelStatus(admin: Admin, reference: string, paymentId?: string | null): Promise<RailResult> {
  const cfg = airtelConfig();
  if (!cfg) return { configured: false, providerRef: reference, status: "unconfigured" };
  try {
    const token = await airtelToken(cfg);
    const res = await fetch(`${cfg.baseUrl}/standard/v1/payments/${reference}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-Country": cfg.country,
        "X-Currency": cfg.currency,
      },
    });
    const body = (await res.json().catch(() => ({}))) as { data?: { transaction?: { status?: string; message?: string } } };
    await log(admin, {
      paymentId: paymentId ?? null,
      provider: "airtel",
      direction: "response",
      action: "payment-status",
      providerRef: reference,
      httpStatus: res.status,
      payload: body,
    });
    const status = (body.data?.transaction?.status ?? "").toUpperCase();
    return {
      configured: true,
      providerRef: reference,
      status: status === "TS" ? "successful" : status === "TF" ? "failed" : "pending",
      providerStatus: status || undefined,
      error: body.data?.transaction?.message,
    };
  } catch (e) {
    return { configured: true, providerRef: reference, status: "pending", error: e instanceof Error ? e.message : undefined };
  }
}

async function airtelRefund(
  admin: Admin,
  args: { reference: string; paymentId?: string | null },
): Promise<RailResult> {
  const cfg = airtelConfig();
  if (!cfg)
    return { configured: false, providerRef: args.reference, status: "unconfigured", error: "Airtel credentials not configured" };
  try {
    const token = await airtelToken(cfg);
    const res = await fetch(`${cfg.baseUrl}/standard/v1/payments/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Country": cfg.country,
        "X-Currency": cfg.currency,
      },
      body: JSON.stringify({ transaction: { airtel_money_id: args.reference } }),
    });
    const body = await res.json().catch(() => ({}));
    await log(admin, {
      paymentId: args.paymentId ?? null,
      provider: "airtel",
      direction: "response",
      action: "refund",
      providerRef: args.reference,
      httpStatus: res.status,
      payload: body,
    });
    return { configured: true, providerRef: args.reference, status: res.ok ? "pending" : "failed" };
  } catch (e) {
    return { configured: true, providerRef: args.reference, status: "failed", error: e instanceof Error ? e.message : undefined };
  }
}

/* ------------------------------------------------------------------ */
/* Rail facade                                                         */
/* ------------------------------------------------------------------ */

export function railConfigured(rail: Rail): boolean {
  return rail === "momo" ? momoConfig() !== null : airtelConfig() !== null;
}

export function newReference(): string {
  return crypto.randomUUID();
}

export async function collect(
  admin: Admin,
  rail: Rail,
  args: { phone: string; amountMinor: number; reference: string; note: string; paymentId?: string | null },
): Promise<RailResult> {
  return rail === "momo" ? momoCollect(admin, args) : airtelCollect(admin, args);
}

export async function checkStatus(admin: Admin, rail: Rail, reference: string, paymentId?: string | null): Promise<RailResult> {
  return rail === "momo" ? momoStatus(admin, reference, paymentId) : airtelStatus(admin, reference, paymentId);
}

export async function refund(
  admin: Admin,
  rail: Rail,
  args: { phone: string; amountMinor: number; reference: string; note: string; originalRef: string; paymentId?: string | null },
): Promise<RailResult> {
  return rail === "momo"
    ? momoRefund(admin, args)
    : airtelRefund(admin, { reference: args.originalRef, paymentId: args.paymentId ?? null });
}

export { log as logPaymentEvent };
