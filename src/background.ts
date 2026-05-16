/// <reference types="chrome" />

const STORAGE_KEYS = {
  installedAt: "installed_at",
  trialStartTs: "trial_start_ts",
  premiumUnlocked: "premium_unlocked",
  schemaVersion: "schema_version",
  entries: "entries",
} as const;

const CURRENT_SCHEMA_VERSION = 1;

async function initializeStorage(): Promise<void> {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.installedAt,
    STORAGE_KEYS.trialStartTs,
    STORAGE_KEYS.premiumUnlocked,
    STORAGE_KEYS.schemaVersion,
    STORAGE_KEYS.entries,
  ]);

  const now = Date.now();
  const updates: Record<string, unknown> = {};

  if (typeof existing[STORAGE_KEYS.installedAt] !== "number") {
    updates[STORAGE_KEYS.installedAt] = now;
  }
  if (typeof existing[STORAGE_KEYS.trialStartTs] !== "number") {
    updates[STORAGE_KEYS.trialStartTs] = now;
  }
  if (typeof existing[STORAGE_KEYS.premiumUnlocked] !== "boolean") {
    updates[STORAGE_KEYS.premiumUnlocked] = false;
  }
  if (typeof existing[STORAGE_KEYS.schemaVersion] !== "number") {
    updates[STORAGE_KEYS.schemaVersion] = CURRENT_SCHEMA_VERSION;
  }
  if (!Array.isArray(existing[STORAGE_KEYS.entries])) {
    updates[STORAGE_KEYS.entries] = [];
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

async function ensureDailyAlarm(): Promise<void> {
  const existing = await chrome.alarms.get("daily-prompt");
  if (!existing) {
    chrome.alarms.create("daily-prompt", {
      when: nextLocalHour(20),
      periodInMinutes: 24 * 60,
    });
  }

  const weekly = await chrome.alarms.get("weekly-summary");
  if (!weekly) {
    chrome.alarms.create("weekly-summary", {
      when: nextWeeklyAnchor(0, 9),
      periodInMinutes: 7 * 24 * 60,
    });
  }
}

function nextLocalHour(hour: number): number {
  const now = new Date();
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    0,
    0,
    0,
  );
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

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

chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeStorage();
  await ensureDailyAlarm();
  if (details.reason === "install") {
    console.log("[emotion-checkin] installed");
  } else if (details.reason === "update") {
    console.log("[emotion-checkin] updated to", chrome.runtime.getManifest().version);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDailyAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily-prompt") {
    // Daily prompt trigger placeholder. Popup-based UI handles display.
  } else if (alarm.name === "weekly-summary") {
    // Weekly summary trigger placeholder. Handled in popup/options open.
  }
});
