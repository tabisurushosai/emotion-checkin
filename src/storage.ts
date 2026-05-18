/// <reference types="chrome" />

/**
 * @file `chrome.storage.local` access layer.
 *
 * Defines the persistence schema (entries, settings, premium flags) along with
 * type guards and normalizers that keep data tolerant to legacy or malformed
 * shapes loaded from older versions of the extension.
 */

/** Six supported emotion identifiers. */
export type EmotionKey =
  | "happy"
  | "calm"
  | "tired"
  | "sad"
  | "angry"
  | "anxious";

/** Iteration order for emotions, used wherever stable ordering matters. */
export const EMOTION_KEYS: readonly EmotionKey[] = [
  "happy",
  "calm",
  "tired",
  "sad",
  "angry",
  "anxious",
] as const;

/** A single check-in record. */
export interface Entry {
  /** Unix epoch milliseconds when the entry was recorded. */
  ts: number;
  /** Selected emotion. */
  emoji: EmotionKey;
  /** Optional free-text note (≤ NOTE_MAX_LENGTH chars). */
  note?: string;
}

/** User-editable preferences persisted in `chrome.storage.local`. */
export interface Settings {
  notifications_enabled: boolean;
  /** `HH:MM` strings (24h) for daily reminder alarms. */
  notification_times: string[];
  /** Caregiver email used by the weekly share feature. */
  parent_email: string;
  weekly_summary_enabled: boolean;
}

/** Stable storage key constants — keep in sync with `background.ts`. */
export const STORAGE_KEYS = {
  installedAt: "installed_at",
  trialStartTs: "trial_start_ts",
  premiumUnlocked: "premium_unlocked",
  schemaVersion: "schema_version",
  entries: "entries",
  settings: "settings",
} as const;

/** Schema version persisted alongside data so future migrations can branch. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Maximum allowed length of an entry note. */
export const NOTE_MAX_LENGTH = 200;

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Defaults applied when no persisted settings exist or fields are missing. */
export const DEFAULT_SETTINGS: Settings = {
  notifications_enabled: false,
  notification_times: ["09:00", "13:00", "20:00"],
  parent_email: "",
  weekly_summary_enabled: false,
};

/** Type guard: is `value` one of the supported emotion keys? */
export function isEmotionKey(value: unknown): value is EmotionKey {
  return typeof value === "string" && (EMOTION_KEYS as readonly string[]).includes(value);
}

/** Type guard: is `value` a `HH:MM` 24-hour time string? */
export function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/** Normalize an arbitrary input into a valid `Entry`, or `null` if malformed. */
function normalizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ts !== "number" || !Number.isFinite(r.ts)) return null;
  if (!isEmotionKey(r.emoji)) return null;
  const entry: Entry = { ts: r.ts, emoji: r.emoji };
  if (typeof r.note === "string" && r.note.length > 0) {
    entry.note = r.note.slice(0, NOTE_MAX_LENGTH);
  }
  return entry;
}

/** Merge a possibly-partial persisted object with {@link DEFAULT_SETTINGS}. */
function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as Partial<Settings>;
  return {
    notifications_enabled:
      typeof r.notifications_enabled === "boolean"
        ? r.notifications_enabled
        : DEFAULT_SETTINGS.notifications_enabled,
    notification_times: Array.isArray(r.notification_times)
      ? (r.notification_times as unknown[]).filter(isValidTimeString)
      : [...DEFAULT_SETTINGS.notification_times],
    parent_email:
      typeof r.parent_email === "string" ? r.parent_email : DEFAULT_SETTINGS.parent_email,
    weekly_summary_enabled:
      typeof r.weekly_summary_enabled === "boolean"
        ? r.weekly_summary_enabled
        : DEFAULT_SETTINGS.weekly_summary_enabled,
  };
}

/** Read and normalize all stored entries. Malformed rows are dropped. */
export async function getEntries(): Promise<Entry[]> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.entries);
  const raw = data[STORAGE_KEYS.entries];
  if (!Array.isArray(raw)) return [];
  const out: Entry[] = [];
  for (const item of raw) {
    const e = normalizeEntry(item);
    if (e) out.push(e);
  }
  return out;
}

/** Overwrite the entries array. */
export async function setEntries(entries: Entry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: entries });
}

/** Append a single entry and persist; returns the new full list. */
export async function addEntry(entry: Entry): Promise<Entry[]> {
  const entries = await getEntries();
  entries.push(entry);
  await setEntries(entries);
  return entries;
}

/** Empty the entries array. */
export async function clearEntries(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: [] });
}

/** Read user settings, applying defaults for missing/invalid fields. */
export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(data[STORAGE_KEYS.settings]);
}

/** Persist a full {@link Settings} object. */
export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

/** Whether the user has redeemed a premium unlock code. */
export async function getPremiumUnlocked(): Promise<boolean> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.premiumUnlocked);
  return data[STORAGE_KEYS.premiumUnlocked] === true;
}

/** Set the premium unlocked flag. */
export async function setPremiumUnlocked(unlocked: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.premiumUnlocked]: unlocked });
}

/** Read the trial start timestamp (epoch ms), or `null` if never started. */
export async function getTrialStartTs(): Promise<number | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.trialStartTs);
  const v = data[STORAGE_KEYS.trialStartTs];
  return typeof v === "number" ? v : null;
}

/** Read the install timestamp (epoch ms), or `null` if unset. */
export async function getInstalledAt(): Promise<number | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.installedAt);
  const v = data[STORAGE_KEYS.installedAt];
  return typeof v === "number" ? v : null;
}

/** Dump the entire `chrome.storage.local` namespace (used by export feature). */
export async function exportAll(): Promise<Record<string, unknown>> {
  return await chrome.storage.local.get(null);
}

/** Bulk-import a previously exported payload. Throws on non-object input. */
export async function importAll(payload: Record<string, unknown>): Promise<void> {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid payload");
  }
  await chrome.storage.local.set(payload);
}
