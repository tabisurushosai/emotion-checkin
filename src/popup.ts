/// <reference types="chrome" />

import { applyI18n, t } from "./i18n";
import {
  EMOJI_GLYPH,
  EMOJI_LABEL_KEY,
  EMOTION_KEYS,
  type EmotionKey,
} from "./emoji";
import {
  addEntry,
  getEntries,
  isEmotionKey,
  NOTE_MAX_LENGTH,
  type Entry,
} from "./storage";
import {
  computeWeeklyStats,
  WEEKDAY_KEYS,
  type WeeklyStats,
} from "./weekly";

const SAVED_STATUS_RESET_MS = 2000;

let selectedEmoji: EmotionKey | null = null;
let savedStatusTimer: number | null = null;

function startOfTodayMs(): number {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getEmojiButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(".emoji-btn"),
  );
}

function getButtonByEmoji(emoji: EmotionKey): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(
      `.emoji-btn[data-emoji="${emoji}"]`,
    ) ?? null
  );
}

function updateSelection(target: HTMLButtonElement, focus = false): void {
  const emoji = target.dataset.emoji;
  if (!emoji || !isEmotionKey(emoji)) return;

  selectedEmoji = emoji;
  for (const btn of getEmojiButtons()) {
    const isSelected = btn === target;
    btn.setAttribute("aria-checked", isSelected ? "true" : "false");
    btn.classList.toggle("is-selected", isSelected);
    btn.tabIndex = isSelected ? 0 : -1;
  }
  if (focus) target.focus();

  const saveBtn = document.getElementById("save-btn") as HTMLButtonElement | null;
  if (saveBtn) saveBtn.disabled = false;
  setStatus("");
}

function setStatus(message: string): void {
  const el = document.getElementById("save-status");
  if (el) el.textContent = message;
  if (savedStatusTimer !== null) {
    window.clearTimeout(savedStatusTimer);
    savedStatusTimer = null;
  }
  if (message) {
    savedStatusTimer = window.setTimeout(() => {
      const node = document.getElementById("save-status");
      if (node) node.textContent = "";
      savedStatusTimer = null;
    }, SAVED_STATUS_RESET_MS);
  }
}

function renderToday(entries: Entry[]): void {
  const list = document.getElementById("today-list") as HTMLUListElement | null;
  const empty = document.getElementById("today-empty") as HTMLElement | null;
  if (!list || !empty) return;

  const since = startOfTodayMs();
  const today = entries
    .filter((e) => e.ts >= since)
    .sort((a, b) => b.ts - a.ts);

  list.innerHTML = "";
  if (today.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  for (const entry of today) {
    const li = document.createElement("li");
    li.className = "today__item";

    const icon = document.createElement("span");
    icon.className = "today__emoji";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = EMOJI_GLYPH[entry.emoji];

    const label = document.createElement("span");
    label.className = "today__label";
    label.textContent = t(EMOJI_LABEL_KEY[entry.emoji]);

    const time = document.createElement("time");
    time.className = "today__time";
    time.dateTime = new Date(entry.ts).toISOString();
    time.textContent = formatClock(entry.ts);

    li.append(icon, label, time);

    if (entry.note) {
      const note = document.createElement("p");
      note.className = "today__note";
      note.textContent = entry.note;
      li.append(note);
    }

    frag.append(li);
  }
  list.append(frag);
}

async function refreshToday(): Promise<void> {
  const entries = await getEntries();
  renderToday(entries);
}

function renderWeekly(stats: WeeklyStats): void {
  const totalEl = document.getElementById("weekly-total");
  const topRow = document.getElementById("weekly-top-row");
  const topEl = document.getElementById("weekly-top");
  const daysList = document.getElementById("weekly-days");
  const empty = document.getElementById("weekly-empty") as HTMLElement | null;
  if (!totalEl || !topRow || !topEl || !daysList || !empty) return;

  totalEl.textContent = String(stats.total);

  if (stats.total === 0 || !stats.topEmotion) {
    topRow.setAttribute("hidden", "");
    topEl.textContent = "";
  } else {
    topRow.removeAttribute("hidden");
    const glyph = EMOJI_GLYPH[stats.topEmotion];
    const label = t(EMOJI_LABEL_KEY[stats.topEmotion]);
    const count = stats.byEmoji[stats.topEmotion];
    topEl.textContent = `${glyph} ${label} (${count})`;
  }

  if (stats.total === 0) {
    daysList.setAttribute("hidden", "");
    empty.hidden = false;
  } else {
    daysList.removeAttribute("hidden");
    empty.hidden = true;
  }

  const maxCount = Math.max(
    ...WEEKDAY_KEYS.map((k) => stats.byDay[k]),
    0,
  ) || 1;

  for (const key of WEEKDAY_KEYS) {
    const li = daysList.querySelector<HTMLLIElement>(
      `.weekly__day[data-day="${key}"]`,
    );
    if (!li) continue;
    const count = stats.byDay[key];
    const countEl = li.querySelector(".weekly__day-count");
    if (countEl) countEl.textContent = String(count);
    const bar = li.querySelector<HTMLDivElement>(".weekly__bar");
    if (bar) bar.style.setProperty("--ratio", String(count / maxCount));
  }
}

async function refreshWeekly(): Promise<void> {
  const entries = await getEntries();
  renderWeekly(computeWeeklyStats(entries));
}

function resetForm(): void {
  selectedEmoji = null;
  const buttons = getEmojiButtons();
  buttons.forEach((btn, index) => {
    btn.setAttribute("aria-checked", "false");
    btn.classList.remove("is-selected");
    btn.tabIndex = index === 0 ? 0 : -1;
  });
  const note = document.getElementById("note-input") as HTMLTextAreaElement | null;
  if (note) note.value = "";
  const saveBtn = document.getElementById("save-btn") as HTMLButtonElement | null;
  if (saveBtn) saveBtn.disabled = true;
}

async function handleSave(): Promise<void> {
  if (!selectedEmoji) return;
  const saveBtn = document.getElementById("save-btn") as HTMLButtonElement | null;
  const noteInput = document.getElementById("note-input") as HTMLTextAreaElement | null;
  const note = noteInput?.value.trim().slice(0, NOTE_MAX_LENGTH) ?? "";

  if (saveBtn) saveBtn.disabled = true;

  try {
    const entry: Entry = {
      ts: Date.now(),
      emoji: selectedEmoji,
      ...(note ? { note } : {}),
    };
    await addEntry(entry);
    setStatus(t("popup_saved"));
    resetForm();
    await refreshToday();
    await refreshWeekly();
  } catch (err) {
    console.error("[emotion-checkin] save failed", err);
    setStatus(t("error_save"));
    if (saveBtn) saveBtn.disabled = false;
  }
}

function moveSelection(currentIndex: number, delta: number): void {
  const buttons = getEmojiButtons();
  if (buttons.length === 0) return;
  const next = (currentIndex + delta + buttons.length) % buttons.length;
  updateSelection(buttons[next], true);
}

function bindEmojiPicker(): void {
  const buttons = getEmojiButtons();
  buttons.forEach((btn, index) => {
    btn.tabIndex = index === 0 ? 0 : -1;
    btn.addEventListener("click", () => updateSelection(btn));
    btn.addEventListener("keydown", (event) => {
      switch (event.key) {
        case " ":
        case "Enter":
          event.preventDefault();
          updateSelection(btn);
          break;
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          moveSelection(index, 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          moveSelection(index, -1);
          break;
        case "Home":
          event.preventDefault();
          if (buttons.length > 0) updateSelection(buttons[0], true);
          break;
        case "End":
          event.preventDefault();
          if (buttons.length > 0)
            updateSelection(buttons[buttons.length - 1], true);
          break;
      }
    });
  });
}

function bindActions(): void {
  document.getElementById("save-btn")?.addEventListener("click", () => {
    void handleSave();
  });
  document.getElementById("open-options")?.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
}

function bootstrap(): void {
  applyI18n(document);
  // 全 EMOTION_KEYS が DOM 上に存在するか検証 (開発時の取り違え検出のみ)
  for (const key of EMOTION_KEYS) {
    if (!getButtonByEmoji(key)) {
      console.warn(`[emotion-checkin] missing emoji button: ${key}`);
    }
  }
  bindEmojiPicker();
  bindActions();
  void refreshToday();
  void refreshWeekly();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
