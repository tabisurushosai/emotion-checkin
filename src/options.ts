/// <reference types="chrome" />

/**
 * @file Options page (`options.html`).
 *
 * Manages the settings panel: daily-reminder times, parent share email,
 * weekly-summary opt-in, premium status, plus data export / import / reset.
 *
 * Local copies of {@link Settings} and {@link DEFAULT_SETTINGS} are kept here
 * (rather than imported from `storage.ts`) so the options bundle stays small
 * and decoupled from the popup layer.
 */

import { applyI18n, t } from "./i18n";
import {
  ensureTrialStarted,
  getPremiumStatus,
  type PremiumStatus,
} from "./premium";

/** Local copy of the persisted settings shape used by this page. */
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

/** Set the inline save-status label, auto-clearing after `SAVED_STATUS_RESET_MS`. */
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

/**
 * Parse a comma-separated `HH:MM` input into a clean, zero-padded list.
 * Invalid tokens are silently dropped.
 */
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

/** Permissive email check; an empty string is treated as valid (means "unset"). */
function isValidEmail(value: string): boolean {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Read persisted settings, applying {@link DEFAULT_SETTINGS} for missing/invalid fields. */
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

/** Persist the {@link Settings} object to `chrome.storage.local`. */
async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });
}

/** Reflect a {@link Settings} object back into the form inputs. */
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

/** Read the form inputs into a fresh {@link Settings} object. */
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

/** Save handler — validates email and persists the form. */
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

/** Dump all storage to a downloadable `emotion-checkin-YYYY-MM-DD.json` file. */
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

/**
 * Bulk-import a JSON file previously produced by {@link handleExport}.
 * Replaces existing keys; validation happens at the storage layer when read.
 */
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

/** Wipe all entries after a confirm dialog (preserves settings/premium flags). */
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

/** Render the options-page premium card matching the given status. */
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

/** Re-read the premium status and re-render the card. */
async function refreshPremiumCard(): Promise<void> {
  const status = await getPremiumStatus();
  renderPremiumCard(status);
}

/** Start the 7-day trial (idempotent) and refresh the card. */
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

/** Stub: the options page just hints "use the popup" until the unlock UI lands. */
function handleUnlockClick(): void {
  setStatus(t("premium_unlock_pending"));
}

/** Wire up the save / export / import / reset / premium buttons. */
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

  // 各テキスト/メール入力で Enter を押下すると設定を保存 (form がないため明示配線)
  const enterToSave = (id: string): void => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSave();
      }
    });
  };
  enterToSave("opt-notif-times");
  enterToSave("opt-parent-email");
}

/** Entry point — runs on `DOMContentLoaded`. Localizes, loads settings, and binds handlers. */
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
