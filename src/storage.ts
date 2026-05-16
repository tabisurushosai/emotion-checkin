/// <reference types="chrome" />

export type EmotionKey =
  | "happy"
  | "calm"
  | "tired"
  | "sad"
  | "angry"
  | "anxious";

export const EMOTION_KEYS: readonly EmotionKey[] = [
  "happy",
  "calm",
  "tired",
  "sad",
  "angry",
  "anxious",
] as const;

export interface Entry {
  ts: number;
  emoji: EmotionKey;
  note?: string;
}

export interface Settings {
  notifications_enabled: boolean;
  notification_times: string[];
  parent_email: string;
  weekly_summary_enabled: boolean;
}

export const STORAGE_KEYS = {
  installedAt: "installed_at",
  trialStartTs: "trial_start_ts",
  premiumUnlocked: "premium_unlocked",
  schemaVersion: "schema_version",
  entries: "entries",
  settings: "settings",
} as const;

export const CURRENT_SCHEMA_VERSION = 1;

export const NOTE_MAX_LENGTH = 200;

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const DEFAULT_SETTINGS: Settings = {
  notifications_enabled: false,
  notification_times: ["09:00", "13:00", "20:00"],
  parent_email: "",
  weekly_summary_enabled: false,
};

export function isEmotionKey(value: unknown): value is EmotionKey {
  return typeof value === "string" && (EMOTION_KEYS as readonly string[]).includes(value);
}

export function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

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

export async function setEntries(entries: Entry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: entries });
}

export async function addEntry(entry: Entry): Promise<Entry[]> {
  const entries = await getEntries();
  entries.push(entry);
  await setEntries(entries);
  return entries;
}

export async function clearEntries(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: [] });
}

export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(data[STORAGE_KEYS.settings]);
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getPremiumUnlocked(): Promise<boolean> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.premiumUnlocked);
  return data[STORAGE_KEYS.premiumUnlocked] === true;
}

export async function setPremiumUnlocked(unlocked: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.premiumUnlocked]: unlocked });
}

export async function getTrialStartTs(): Promise<number | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.trialStartTs);
  const v = data[STORAGE_KEYS.trialStartTs];
  return typeof v === "number" ? v : null;
}

export async function getInstalledAt(): Promise<number | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.installedAt);
  const v = data[STORAGE_KEYS.installedAt];
  return typeof v === "number" ? v : null;
}

export async function exportAll(): Promise<Record<string, unknown>> {
  return await chrome.storage.local.get(null);
}

export async function importAll(payload: Record<string, unknown>): Promise<void> {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid payload");
  }
  await chrome.storage.local.set(payload);
}
