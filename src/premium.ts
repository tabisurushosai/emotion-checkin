import {
  STORAGE_KEYS,
  getPremiumUnlocked,
  getTrialStartTs,
} from "./storage";

export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

export interface PremiumStatus {
  unlocked: boolean;
  inTrial: boolean;
  trialStartTs: number | null;
  trialEndTs: number | null;
  trialDaysRemaining: number;
  isPremiumActive: boolean;
}

export function trialEndTs(trialStartTs: number | null): number | null {
  if (typeof trialStartTs !== "number" || !Number.isFinite(trialStartTs)) {
    return null;
  }
  return trialStartTs + TRIAL_DURATION_MS;
}

export function isInTrial(trialStartTs: number | null, now: number): boolean {
  const end = trialEndTs(trialStartTs);
  if (end === null) return false;
  return now >= (trialStartTs as number) && now < end;
}

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

export async function getPremiumStatus(now: number = Date.now()): Promise<PremiumStatus> {
  const [unlocked, trialStart] = await Promise.all([
    getPremiumUnlocked(),
    getTrialStartTs(),
  ]);
  return evaluatePremiumStatus(unlocked, trialStart, now);
}

export async function ensureTrialStarted(now: number = Date.now()): Promise<number> {
  const existing = await getTrialStartTs();
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return existing;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.trialStartTs]: now });
  return now;
}

export async function isPremiumActive(now: number = Date.now()): Promise<boolean> {
  const status = await getPremiumStatus(now);
  return status.isPremiumActive;
}
