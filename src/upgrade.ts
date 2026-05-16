/// <reference types="chrome" />

import { setPremiumUnlocked } from "./storage";

// Stripe Payment Link (backend-less Checkout). Configure in Stripe Dashboard and
// replace the placeholder before publishing. The placeholder host is intentionally
// recognizable so isPaymentLinkConfigured can detect an unconfigured build.
export const DEFAULT_STRIPE_PAYMENT_LINK =
  "https://buy.stripe.com/REPLACE_WITH_PAYMENT_LINK";

export const INSTALLATION_ID_KEY = "installation_id";

const UNLOCK_CODE_PATTERN = /^MOOD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export type CheckoutLocale = "ja" | "en";

export interface CheckoutOptions {
  clientReferenceId?: string;
  locale?: CheckoutLocale;
  paymentLinkUrl?: string;
}

export function isPaymentLinkConfigured(
  url: string = DEFAULT_STRIPE_PAYMENT_LINK,
): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.includes("REPLACE_WITH_PAYMENT_LINK")) return false;
  return /^https:\/\/buy\.stripe\.com\//.test(url);
}

export function buildCheckoutUrl(opts: CheckoutOptions = {}): string {
  const base = opts.paymentLinkUrl ?? DEFAULT_STRIPE_PAYMENT_LINK;
  try {
    const url = new URL(base);
    if (opts.clientReferenceId) {
      url.searchParams.set("client_reference_id", opts.clientReferenceId);
    }
    if (opts.locale) {
      url.searchParams.set("locale", opts.locale === "ja" ? "ja" : "en");
    }
    return url.toString();
  } catch {
    return base;
  }
}

function generateInstallationId(): string {
  const c: Crypto | undefined =
    typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateInstallationId(): Promise<string> {
  const data = await chrome.storage.local.get(INSTALLATION_ID_KEY);
  const existing = data[INSTALLATION_ID_KEY];
  if (typeof existing === "string" && existing.length > 0) {
    return existing;
  }
  const fresh = generateInstallationId();
  await chrome.storage.local.set({ [INSTALLATION_ID_KEY]: fresh });
  return fresh;
}

export interface OpenCheckoutResult {
  opened: boolean;
  reason?: "not_configured" | "tab_failed";
  url?: string;
}

export async function openCheckout(
  opts: { locale?: CheckoutLocale; paymentLinkUrl?: string } = {},
): Promise<OpenCheckoutResult> {
  const linkUrl = opts.paymentLinkUrl ?? DEFAULT_STRIPE_PAYMENT_LINK;
  if (!isPaymentLinkConfigured(linkUrl)) {
    return { opened: false, reason: "not_configured" };
  }
  const installationId = await getOrCreateInstallationId();
  const url = buildCheckoutUrl({
    clientReferenceId: installationId,
    locale: opts.locale,
    paymentLinkUrl: linkUrl,
  });
  try {
    await chrome.tabs.create({ url, active: true });
    return { opened: true, url };
  } catch (err) {
    console.error("[emotion-checkin] failed to open checkout", err);
    return { opened: false, reason: "tab_failed", url };
  }
}

export function isValidUnlockCode(code: unknown): code is string {
  if (typeof code !== "string") return false;
  return UNLOCK_CODE_PATTERN.test(code.trim().toUpperCase());
}

export function normalizeUnlockCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function redeemUnlockCode(code: string): Promise<boolean> {
  if (!isValidUnlockCode(code)) return false;
  await setPremiumUnlocked(true);
  return true;
}

export async function markPremiumUnlocked(): Promise<void> {
  await setPremiumUnlocked(true);
}

export async function clearPremiumUnlocked(): Promise<void> {
  await setPremiumUnlocked(false);
}
