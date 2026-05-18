/// <reference types="chrome" />

/**
 * @file Premium upgrade flow.
 *
 * Handles redirection to a Stripe Payment Link (backend-less Checkout) and
 * redemption of offline unlock codes. The installation id is sent as
 * `client_reference_id` so the operator can correlate a Stripe purchase with
 * the user that initiated it.
 */
import { setPremiumUnlocked } from "./storage";

/**
 * Default Stripe Payment Link. Replace via the Stripe Dashboard before
 * publishing. The placeholder host is intentionally recognizable so
 * {@link isPaymentLinkConfigured} can detect an unconfigured build.
 */
export const DEFAULT_STRIPE_PAYMENT_LINK =
  "https://buy.stripe.com/REPLACE_WITH_PAYMENT_LINK";

/** Storage key for the per-install random id. */
export const INSTALLATION_ID_KEY = "installation_id";

const UNLOCK_CODE_PATTERN = /^MOOD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Supported Stripe Checkout locales. */
export type CheckoutLocale = "ja" | "en";

/** Options for {@link buildCheckoutUrl}. */
export interface CheckoutOptions {
  /** Sent as `client_reference_id` on the Stripe link. */
  clientReferenceId?: string;
  /** Stripe `locale` query parameter. */
  locale?: CheckoutLocale;
  /** Override the payment link base URL (mainly for tests). */
  paymentLinkUrl?: string;
}

/**
 * True iff `url` looks like a real Stripe Payment Link.
 * Used to gracefully degrade the UI when the build is unconfigured.
 */
export function isPaymentLinkConfigured(
  url: string = DEFAULT_STRIPE_PAYMENT_LINK,
): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.includes("REPLACE_WITH_PAYMENT_LINK")) return false;
  return /^https:\/\/buy\.stripe\.com\//.test(url);
}

/**
 * Construct the final Stripe Checkout URL, appending `client_reference_id`
 * and `locale` when provided. Falls back to the raw base URL if parsing fails.
 */
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

/** Random per-install id; prefers `crypto.randomUUID` and falls back to a millis+random hash. */
function generateInstallationId(): string {
  const c: Crypto | undefined =
    typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lazily create-and-persist a stable per-install id, returning the cached value on subsequent calls. */
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

/** Outcome of {@link openCheckout}, used to drive UI fallbacks. */
export interface OpenCheckoutResult {
  opened: boolean;
  /** Failure category — absent on success. */
  reason?: "not_configured" | "tab_failed";
  /** Final URL that was (or would have been) opened. */
  url?: string;
}

/**
 * Open Stripe Checkout in a new tab, reporting whether the redirect actually
 * happened. Never throws; callers should branch on `opened`/`reason`.
 */
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

/** Type guard: input matches the `MOOD-XXXX-XXXX` unlock-code pattern. */
export function isValidUnlockCode(code: unknown): code is string {
  if (typeof code !== "string") return false;
  return UNLOCK_CODE_PATTERN.test(code.trim().toUpperCase());
}

/** Trim and upper-case a user-entered unlock code. */
export function normalizeUnlockCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validate and redeem an unlock code. Returns `true` on success (and flips
 * the persisted premium flag), `false` if the code is malformed.
 */
export async function redeemUnlockCode(code: string): Promise<boolean> {
  if (!isValidUnlockCode(code)) return false;
  await setPremiumUnlocked(true);
  return true;
}

/** Flip the premium flag to `true` (used after a Stripe webhook / dev tools). */
export async function markPremiumUnlocked(): Promise<void> {
  await setPremiumUnlocked(true);
}

/** Flip the premium flag to `false` (used by reset / dev tools). */
export async function clearPremiumUnlocked(): Promise<void> {
  await setPremiumUnlocked(false);
}
