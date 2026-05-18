/**
 * @file Premium-trial logic.
 *
 * Encodes a 7-day free trial that begins the first time the user opens the
 * popup, plus a permanent "unlocked" flag for users who redeemed a code.
 * "Premium active" = unlocked OR currently inside the trial window.
 */
import {
  STORAGE_KEYS,
  getPremiumUnlocked,
  getTrialStartTs,
} from "./storage";

/** Length of the free trial in days. */
export const TRIAL_DURATION_DAYS = 7;
/** Length of the free trial in milliseconds. */
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

/** Computed premium/trial state for UI rendering. */
export interface PremiumStatus {
  /** True if the user redeemed an unlock code. */
  unlocked: boolean;
  /** True if the current time falls inside the 7-day trial window. */
  inTrial: boolean;
  /** Epoch ms when the trial began (or null if never started). */
  trialStartTs: number | null;
  /** Epoch ms when the trial expires (or null if no trial). */
  trialEndTs: number | null;
  /** Days remaining in the trial (0 once expired). */
  trialDaysRemaining: number;
  /** Convenience: `unlocked || inTrial`. */
  isPremiumActive: boolean;
}

/** End-of-trial epoch ms given a start timestamp, or null if invalid. */
export function trialEndTs(trialStartTs: number | null): number | null {
  if (typeof trialStartTs !== "number" || !Number.isFinite(trialStartTs)) {
    return null;
  }
  return trialStartTs + TRIAL_DURATION_MS;
}

/** Whether `now` falls inside the trial window opened at `trialStartTs`. */
export function isInTrial(trialStartTs: number | null, now: number): boolean {
  const end = trialEndTs(trialStartTs);
  if (end === null) return false;
  return now >= (trialStartTs as number) && now < end;
}

/** Days remaining in the trial (rounded up; 0 once expired). */
export function trialDaysRemaining(
  trialStartTs: number | null,
  now: number,
): number {
  const end = trialEndTs(trialStartTs);
  if (end === null) return 0;
  const remainingMs = end - now;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/** Pure evaluator: derive a {@link PremiumStatus} from raw fields. */
export function evaluatePremiumStatus(
  unlocked: boolean,
  trialStartTs: number | null,
  now: number,
): PremiumStatus {
  const end = trialEndTs(trialStartTs);
  const inTrial = isInTrial(trialStartTs, now);
  return {
    unlocked,
    inTrial,
    trialStartTs,
    trialEndTs: end,
    trialDaysRemaining: trialDaysRemaining(trialStartTs, now),
    isPremiumActive: unlocked || inTrial,
  };
}

/** Read storage and compute the current premium status. */
export async function getPremiumStatus(now: number = Date.now()): Promise<PremiumStatus> {
  const [unlocked, trialStart] = await Promise.all([
    getPremiumUnlocked(),
    getTrialStartTs(),
  ]);
  return evaluatePremiumStatus(unlocked, trialStart, now);
}

/**
 * Start the trial if it has never been started before; otherwise return the
 * existing start timestamp. Idempotent — safe to call on every popup open.
 */
export async function ensureTrialStarted(now: number = Date.now()): Promise<number> {
  const existing = await getTrialStartTs();
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return existing;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.trialStartTs]: now });
  return now;
}

/** Convenience: `true` iff the user currently has premium access. */
export async function isPremiumActive(now: number = Date.now()): Promise<boolean> {
  const status = await getPremiumStatus(now);
  return status.isPremiumActive;
}
