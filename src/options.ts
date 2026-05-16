/// <reference types="chrome" />

import { applyI18n, t } from "./i18n";
import {
  ensureTrialStarted,
  getPremiumStatus,
  type PremiumStatus,
} from "./premium";

interface Settings {
  notifications_enabled: boolean;
  notification_times: string[];
  parent_email: string;
  weekly_summary_enabled: boolean;
}

const STORAGE_KEY_SETTINGS = "settings";
const STORAGE_KEY_ENTRIES = "entries";
const SAVED_STATUS_RESET_MS = 2000;
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_SETTINGS: Settings = {
  notifications_enabled: false,
  notification_times: ["09:00", "13:00", "20:00"],
  parent_email: "",
  weekly_summary_enabled: false,
};

let statusTimer: number | null = null;

function setStatus(message: string): void {
  const el = document.getElementById("save-status");
  if (el) el.textContent = message;
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (message) {
    statusTimer = window.setTimeout(() => {
      const node = document.getElementById("save-status");
      if (node) node.textContent = "";
      statusTimer = null;
    }, SAVED_STATUS_RESET_MS);
  }
}

function parseTimes(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => TIME_PATTERN.test(s))
    .map((s) => {
      const m = TIME_PATTERN.exec(s);
      if (!m) return s;
      return `${m[1].padStart(2, "0")}:${m[2]}`;
    });
}

function isValidEmail(value: string): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  const raw = data[STORAGE_KEY_SETTINGS] as Partial<Settings> | undefined;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  return {
    notifications_enabled:
      typeof raw.notifications_enabled === "boolean"
        ? raw.notifications_enabled
        : DEFAULT_SETTINGS.notifications_enabled,
    notification_times: Array.isArray(raw.notification_times)
      ? (raw.notification_times as string[]).filter(
          (s) => typeof s === "string" && TIME_PATTERN.test(s),
        )
      : [...DEFAULT_SETTINGS.notification_times],
    parent_email:
      typeof raw.parent_email === "string" ? raw.parent_email : "",
    weekly_summary_enabled:
      typeof raw.weekly_summary_enabled === "boolean"
        ? raw.weekly_summary_enabled
        : DEFAULT_SETTINGS.weekly_summary_enabled,
  };
}

async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });
}

function populateForm(settings: Settings): void {
  const enabled = document.getElementById(
    "opt-notif-enabled",
  ) as HTMLInputElement | null;
  const times = document.getElementById(
    "opt-notif-times",
  ) as HTMLInputElement | null;
  const email = document.getElementById(
    "opt-parent-email",
  ) as HTMLInputElement | null;
  const weekly = document.getElementById(
    "opt-weekly-enabled",
  ) as HTMLInputElement | null;

  if (enabled) enabled.checked = settings.notifications_enabled;
  if (times) times.value = settings.notification_times.join(", ");
  if (email) email.value = settings.parent_email;
  if (weekly) weekly.checked = settings.weekly_summary_enabled;
}

function readForm(): Settings {
  const enabled = document.getElementById(
    "opt-notif-enabled",
  ) as HTMLInputElement | null;
  const times = document.getElementById(
    "opt-notif-times",
  ) as HTMLInputElement | null;
  const email = document.getElementById(
    "opt-parent-email",
  ) as HTMLInputElement | null;
  const weekly = document.getElementById(
    "opt-weekly-enabled",
  ) as HTMLInputElement | null;

  return {
    notifications_enabled: enabled?.checked ?? false,
    notification_times: parseTimes(times?.value ?? ""),
    parent_email: (email?.value ?? "").trim(),
    weekly_summary_enabled: weekly?.checked ?? false,
  };
}

async function handleSave(): Promise<void> {
  const settings = readForm();
  if (!isValidEmail(settings.parent_email)) {
    setStatus(t("error_generic"));
    return;
  }
  try {
    await saveSettings(settings);
    setStatus(t("popup_saved"));
  } catch (err) {
    console.error("[emotion-checkin] save settings failed", err);
    setStatus(t("error_save"));
  }
}

async function handleExport(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(null);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `emotion-checkin-${stamp}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[emotion-checkin] export failed", err);
    setStatus(t("error_generic"));
  }
}

async function handleImportFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid payload");
    }
    await chrome.storage.local.set(parsed);
    const settings = await loadSettings();
    populateForm(settings);
    setStatus(t("popup_saved"));
  } catch (err) {
    console.error("[emotion-checkin] import failed", err);
    setStatus(t("error_generic"));
  }
}

async function handleReset(): Promise<void> {
  const ok = window.confirm(t("options_reset_confirm"));
  if (!ok) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_ENTRIES]: [] });
    setStatus(t("popup_saved"));
  } catch (err) {
    console.error("[emotion-checkin] reset failed", err);
    setStatus(t("error_generic"));
  }
}

function renderPremiumCard(status: PremiumStatus): void {
  const statusEl = document.getElementById(
    "opt-premium-status",
  ) as HTMLElement | null;
  const descEl = document.getElementById(
    "opt-premium-desc",
  ) as HTMLElement | null;
  const priceEl = document.getElementById(
    "opt-premium-price",
  ) as HTMLElement | null;
  const trialBtn = document.getElementById(
    "opt-premium-trial",
  ) as HTMLButtonElement | null;
  const unlockBtn = document.getElementById(
    "opt-premium-unlock",
  ) as HTMLButtonElement | null;
  if (!statusEl || !descEl || !priceEl || !trialBtn || !unlockBtn) return;

  if (status.unlocked) {
    statusEl.textContent = t("premium_unlocked");
    descEl.hidden = true;
    priceEl.hidden = true;
    trialBtn.hidden = true;
    unlockBtn.hidden = true;
    return;
  }
  descEl.hidden = false;
  priceEl.hidden = false;
  unlockBtn.hidden = false;

  if (status.inTrial) {
    statusEl.textContent = t("premium_trial_active", [
      String(status.trialDaysRemaining),
    ]);
    trialBtn.hidden = true;
  } else if (status.trialStartTs !== null) {
    statusEl.textContent = t("premium_trial_expired");
    trialBtn.hidden = true;
  } else {
    statusEl.textContent = "";
    trialBtn.hidden = false;
  }
}

async function refreshPremiumCard(): Promise<void> {
  const status = await getPremiumStatus();
  renderPremiumCard(status);
}

async function handleTrialStart(): Promise<void> {
  try {
    await ensureTrialStarted();
    await refreshPremiumCard();
    setStatus(t("popup_saved"));
  } catch (err) {
    console.error("[emotion-checkin] trial start failed", err);
    setStatus(t("error_generic"));
  }
}

function handleUnlockClick(): void {
  setStatus(t("premium_unlock_pending"));
}

function bindActions(): void {
  document
    .getElementById("btn-save")
    ?.addEventListener("click", () => void handleSave());

  document
    .getElementById("btn-export")
    ?.addEventListener("click", () => void handleExport());

  const fileInput = document.getElementById(
    "file-import",
  ) as HTMLInputElement | null;
  document.getElementById("btn-import")?.addEventListener("click", () => {
    fileInput?.click();
  });
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) {
      void handleImportFile(file).finally(() => {
        fileInput.value = "";
      });
    }
  });

  document
    .getElementById("btn-reset")
    ?.addEventListener("click", () => void handleReset());

  document
    .getElementById("opt-premium-trial")
    ?.addEventListener("click", () => void handleTrialStart());

  document
    .getElementById("opt-premium-unlock")
    ?.addEventListener("click", () => handleUnlockClick());
}

async function bootstrap(): Promise<void> {
  applyI18n(document);
  const settings = await loadSettings();
  populateForm(settings);
  bindActions();
  await refreshPremiumCard();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void bootstrap();
    },
    { once: true },
  );
} else {
  void bootstrap();
}
