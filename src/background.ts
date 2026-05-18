/// <reference types="chrome" />

/**
 * @file MV3 service worker.
 *
 * Responsibilities:
 *   - First-install bootstrap of `chrome.storage.local` (install time, trial start, schema version).
 *   - Daily reminder alarms synchronized from user settings.
 *   - Weekly summary alarm + notification.
 *   - Notification click handling (clears the toast).
 *
 * No popup/options UI runs here — the worker is event-driven and goes idle
 * between events, so all state lives in `chrome.storage.local`.
 */

import {
  getEntries,
  getSettings,
  STORAGE_KEYS,
  isValidTimeString,
} from "./storage.js";
import { computeWeeklyStats } from "./weekly.js";
import { t } from "./i18n.js";

const LEGACY_KEYS = {
  installedAt: "installed_at",
  trialStartTs: "trial_start_ts",
  premiumUnlocked: "premium_unlocked",
  schemaVersion: "schema_version",
  entries: "entries",
} as const;

const CURRENT_SCHEMA_VERSION = 1;

/** Prefix shared by all daily reminder alarms (one per configured time). */
const DAILY_ALARM_PREFIX = "daily-prompt-";
/** Singleton alarm fired once a week to surface the share notification. */
const WEEKLY_ALARM_NAME = "weekly-summary";
/** Prefix used when the weekly notification is created. */
const WEEKLY_NOTIFICATION_PREFIX = "weekly-share-";

/**
 * Populate any missing storage fields with sane defaults. Run on install and
 * on every browser startup so users upgrading from older builds get the new
 * keys without losing existing data.
 */
async function initializeStorage(): Promise<void> {
  const existing = await chrome.storage.local.get([
    LEGACY_KEYS.installedAt,
    LEGACY_KEYS.trialStartTs,
    LEGACY_KEYS.premiumUnlocked,
    LEGACY_KEYS.schemaVersion,
    LEGACY_KEYS.entries,
  ]);

  const now = Date.now();
  const updates: Record<string, unknown> = {};

  if (typeof existing[LEGACY_KEYS.installedAt] !== "number") {
    updates[LEGACY_KEYS.installedAt] = now;
  }
  if (typeof existing[LEGACY_KEYS.trialStartTs] !== "number") {
    updates[LEGACY_KEYS.trialStartTs] = now;
  }
  if (typeof existing[LEGACY_KEYS.premiumUnlocked] !== "boolean") {
    updates[LEGACY_KEYS.premiumUnlocked] = false;
  }
  if (typeof existing[LEGACY_KEYS.schemaVersion] !== "number") {
    updates[LEGACY_KEYS.schemaVersion] = CURRENT_SCHEMA_VERSION;
  }
  if (!Array.isArray(existing[LEGACY_KEYS.entries])) {
    updates[LEGACY_KEYS.entries] = [];
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

/** Build the deterministic alarm name for a daily reminder at `HH:MM`. */
function alarmNameFor(time: string): string {
  return `${DAILY_ALARM_PREFIX}${time.replace(":", "-")}`;
}

/** Epoch ms of the next occurrence of `hour:minute`; tomorrow if already past today. */
function nextOccurrence(hour: number, minute: number): number {
  const now = new Date();
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

/** Clear every alarm matching the daily-reminder prefix. */
async function clearDailyAlarms(): Promise<void> {
  const all = await chrome.alarms.getAll();
  for (const a of all) {
    if (a.name.startsWith(DAILY_ALARM_PREFIX)) {
      await chrome.alarms.clear(a.name);
    }
  }
}

/**
 * Replace the current set of daily alarms with one alarm per configured time.
 * Called on install, on startup, and whenever settings change.
 */
async function syncDailyAlarms(): Promise<void> {
  await clearDailyAlarms();
  const settings = await getSettings();
  if (!settings.notifications_enabled) return;
  const seen = new Set<string>();
  for (const time of settings.notification_times) {
    if (!isValidTimeString(time) || seen.has(time)) continue;
    seen.add(time);
    const [hStr, mStr] = time.split(":");
    const hour = Number(hStr);
    const minute = Number(mStr);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    chrome.alarms.create(alarmNameFor(time), {
      when: nextOccurrence(hour, minute),
      periodInMinutes: 24 * 60,
    });
  }
}

/** Ensure the weekly summary alarm exists (Sunday 09:00, repeating weekly). */
async function ensureWeeklyAlarm(): Promise<void> {
  const weekly = await chrome.alarms.get(WEEKLY_ALARM_NAME);
  if (!weekly) {
    chrome.alarms.create(WEEKLY_ALARM_NAME, {
      when: nextWeeklyAnchor(0, 9),
      periodInMinutes: 7 * 24 * 60,
    });
  }
}

/**
 * Epoch ms of the next anchor (default Sunday 09:00 local).
 * @param weekday 0 (Sun) – 6 (Sat) per `Date#getDay`.
 * @param hour Local hour-of-day.
 */
function nextWeeklyAnchor(weekday: number, hour: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  const diff = (weekday - now.getDay() + 7) % 7;
  if (diff === 0 && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  } else {
    target.setDate(target.getDate() + diff);
  }
  return target.getTime();
}

/** Surface the localized daily reminder notification. */
function showDailyNotification(): void {
  const notificationId = `${DAILY_ALARM_PREFIX}${Date.now()}`;
  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: t("notif_daily_title"),
    message: t("notif_daily_body"),
    priority: 0,
    requireInteraction: false,
    silent: true,
  });
}

/**
 * Surface the localized weekly share notification — but only when the feature
 * is on, a recipient email is configured, and the user actually checked in at
 * least once during the week.
 */
async function showWeeklyShareNotification(): Promise<void> {
  const settings = await getSettings();
  if (!settings.weekly_summary_enabled) return;
  if (!settings.parent_email) return;
  const entries = await getEntries();
  const stats = computeWeeklyStats(entries);
  if (stats.total === 0) return;
  const notificationId = `${WEEKLY_NOTIFICATION_PREFIX}${Date.now()}`;
  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: t("notif_weekly_title"),
    message: t("notif_weekly_body"),
    priority: 0,
    requireInteraction: false,
    silent: true,
  });
}

/** Dismiss the notification the user just clicked (popup opens via toolbar instead). */
function handleNotificationClick(notificationId: string): void {
  if (
    !notificationId.startsWith(DAILY_ALARM_PREFIX) &&
    !notificationId.startsWith(WEEKLY_NOTIFICATION_PREFIX)
  ) {
    return;
  }
  chrome.notifications.clear(notificationId);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeStorage();
  await syncDailyAlarms();
  await ensureWeeklyAlarm();
  if (details.reason === "install") {
    console.log("[emotion-checkin] installed");
  } else if (details.reason === "update") {
    console.log("[emotion-checkin] updated to", chrome.runtime.getManifest().version);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await syncDailyAlarms();
  await ensureWeeklyAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(DAILY_ALARM_PREFIX)) {
    showDailyNotification();
  } else if (alarm.name === WEEKLY_ALARM_NAME) {
    void showWeeklyShareNotification();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[STORAGE_KEYS.settings]) {
    void syncDailyAlarms();
    void ensureWeeklyAlarm();
  }
});

chrome.notifications.onClicked.addListener(handleNotificationClick);
