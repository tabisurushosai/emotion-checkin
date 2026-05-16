/// <reference types="chrome" />

import { applyI18n, t } from "./i18n";

type EmotionKey =
  | "happy"
  | "calm"
  | "tired"
  | "sad"
  | "angry"
  | "anxious";

interface Entry {
  ts: number;
  emoji: EmotionKey;
  note?: string;
}

const STORAGE_KEY_ENTRIES = "entries";
const NOTE_MAX_LENGTH = 200;
const SAVED_STATUS_RESET_MS = 2000;

const EMOJI_GLYPH: Record<EmotionKey, string> = {
  happy: "😊",
  calm: "😌",
  tired: "😪",
  sad: "😢",
  angry: "😠",
  anxious: "😰",
};

const EMOJI_LABEL_KEY: Record<EmotionKey, string> = {
  happy: "emoji_happy",
  calm: "emoji_calm",
  tired: "emoji_tired",
  sad: "emoji_sad",
  angry: "emoji_angry",
  anxious: "emoji_anxious",
};

let selectedEmoji: EmotionKey | null = null;
let savedStatusTimer: number | null = null;

function isEmotionKey(value: string): value is EmotionKey {
  return value in EMOJI_GLYPH;
}

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

async function loadEntries(): Promise<Entry[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY_ENTRIES);
  const raw = data[STORAGE_KEY_ENTRIES];
  return Array.isArray(raw) ? (raw as Entry[]) : [];
}

async function saveEntry(entry: Entry): Promise<void> {
  const entries = await loadEntries();
  entries.push(entry);
  await chrome.storage.local.set({ [STORAGE_KEY_ENTRIES]: entries });
}

function getEmojiButtons(): NodeListOf<HTMLButtonElement> {
  return document.querySelectorAll<HTMLButtonElement>(".emoji-btn");
}

function updateSelection(target: HTMLButtonElement): void {
  const emoji = target.dataset.emoji;
  if (!emoji || !isEmotionKey(emoji)) return;

  selectedEmoji = emoji;
  getEmojiButtons().forEach((btn) => {
    const isSelected = btn === target;
    btn.setAttribute("aria-checked", isSelected ? "true" : "false");
    btn.classList.toggle("is-selected", isSelected);
  });

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
    .filter((e) => typeof e.ts === "number" && e.ts >= since)
    .sort((a, b) => b.ts - a.ts);

  list.innerHTML = "";
  if (today.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  for (const entry of today) {
    if (!isEmotionKey(entry.emoji)) continue;
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
  const entries = await loadEntries();
  renderToday(entries);
}

function resetForm(): void {
  selectedEmoji = null;
  getEmojiButtons().forEach((btn) => {
    btn.setAttribute("aria-checked", "false");
    btn.classList.remove("is-selected");
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
    await saveEntry({
      ts: Date.now(),
      emoji: selectedEmoji,
      ...(note ? { note } : {}),
    });
    setStatus(t("popup_saved"));
    resetForm();
    await refreshToday();
  } catch (err) {
    console.error("[emotion-checkin] save failed", err);
    setStatus(t("error_save"));
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindEmojiPicker(): void {
  getEmojiButtons().forEach((btn) => {
    btn.addEventListener("click", () => updateSelection(btn));
    btn.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        updateSelection(btn);
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
  bindEmojiPicker();
  bindActions();
  void refreshToday();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
