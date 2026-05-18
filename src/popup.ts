/// <reference types="chrome" />

/**
 * @file Popup script (`popup.html`).
 *
 * Wires up the four panels surfaced when the user clicks the toolbar icon:
 *   - Emoji picker + optional note → saves an {@link Entry}.
 *   - "Today" list rendering all of today's entries.
 *   - Weekly summary with per-emotion and per-day counts + share-to-parent.
 *   - Mon–Sun calendar with month navigation and a day-detail drawer.
 *   - Premium/trial card driving the upgrade flow.
 *
 * Module-level `let` variables hold the popup's session state; the popup is
 * destroyed every time it closes, so no persistence is needed beyond storage.
 */

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
  getSettings,
  isEmotionKey,
  NOTE_MAX_LENGTH,
  type Entry,
} from "./storage";
import {
  computeWeeklyStats,
  WEEKDAY_KEYS,
  type WeeklyStats,
} from "./weekly";
import { buildShareMail, type ShareLocale } from "./parentShare";
import {
  buildMonthGrid,
  compareYearMonth,
  earliestAllowedMonth,
  entriesForDay,
  latestAllowedMonth,
  shiftMonth,
} from "./calendar";
import {
  ensureTrialStarted,
  getPremiumStatus,
  type PremiumStatus,
} from "./premium";
import { openCheckout } from "./upgrade";

const SAVED_STATUS_RESET_MS = 2000;

const MONTH_NAMES_JA = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
];
const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

let selectedEmoji: EmotionKey | null = null;
let savedStatusTimer: number | null = null;
let latestStats: WeeklyStats | null = null;
let viewYear: number = new Date().getFullYear();
let viewMonth: number = new Date().getMonth();
let selectedDay: { year: number; month: number; day: number } | null = null;
let premiumStatus: PremiumStatus | null = null;

/** Resolve the share-mail locale ("ja" if UI is Japanese, otherwise "en"). */
function resolveShareLocale(): ShareLocale {
  const ui = chrome.i18n.getUILanguage?.() ?? "";
  return ui.toLowerCase().startsWith("ja") ? "ja" : "en";
}

/** Epoch ms at local-midnight today, used to slice "today's" entries. */
function startOfTodayMs(): number {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
}

/** Format an epoch ms as `HH:MM` (24h) for entry timestamps. */
function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Return all `.emoji-btn` elements in DOM order. */
function getEmojiButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(".emoji-btn"),
  );
}

/** Look up the emoji button by its `data-emoji` attribute, or `null`. */
function getButtonByEmoji(emoji: EmotionKey): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(
      `.emoji-btn[data-emoji="${emoji}"]`,
    ) ?? null
  );
}

/**
 * Mark `target` as the radiogroup's selected emoji button (updating
 * `aria-checked`, focus order, save-button disabled state).
 * @param focus When true, also moves keyboard focus to `target`.
 */
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

/** Set the inline save-status label, auto-clearing after `SAVED_STATUS_RESET_MS`. */
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

/** Render today's entries into the "今日" list; show the empty-state when none. */
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

/** Reload entries from storage and re-render the "today" list. */
async function refreshToday(): Promise<void> {
  const entries = await getEntries();
  renderToday(entries);
}

/** Render the weekly summary panel (totals + per-day bars + top mood). */
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

/** Reload entries, recompute the weekly stats, and refresh dependent UI. */
async function refreshWeekly(): Promise<void> {
  const entries = await getEntries();
  const stats = computeWeeklyStats(entries);
  latestStats = stats;
  renderWeekly(stats);
  await refreshShareButton();
}

/**
 * Enable/disable the "share with parent" button and surface a localized hint
 * explaining why it's disabled (no email configured, no records this week).
 */
async function refreshShareButton(): Promise<void> {
  const btn = document.getElementById(
    "share-parent-btn",
  ) as HTMLButtonElement | null;
  const hint = document.getElementById(
    "share-parent-hint",
  ) as HTMLElement | null;
  if (!btn || !hint) return;

  const settings = await getSettings();
  const total = latestStats?.total ?? 0;

  if (!settings.parent_email) {
    btn.disabled = true;
    hint.hidden = false;
    hint.textContent = t("parent_share_no_email");
    return;
  }
  if (total === 0) {
    btn.disabled = true;
    hint.hidden = false;
    hint.textContent = t("popup_no_records");
    return;
  }
  btn.disabled = false;
  hint.hidden = true;
  hint.textContent = "";
}

/** Build the share `mailto:` URL and navigate to it to open the user's mail client. */
async function handleShareClick(): Promise<void> {
  const settings = await getSettings();
  if (!settings.parent_email) return;
  const stats = latestStats ?? computeWeeklyStats(await getEntries());
  if (stats.total === 0) return;
  const mail = buildShareMail(stats, settings.parent_email, resolveShareLocale());
  if (!mail.mailtoUrl) {
    setStatus(t("error_generic"));
    return;
  }
  try {
    window.location.href = mail.mailtoUrl;
  } catch (err) {
    console.error("[emotion-checkin] share failed", err);
    setStatus(t("error_generic"));
  }
}

/** Clear the emoji selection, note textarea, and re-disable the save button. */
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

/** Persist the currently-selected emoji+note as a new entry and refresh all panels. */
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
    await refreshCalendar();
  } catch (err) {
    console.error("[emotion-checkin] save failed", err);
    setStatus(t("error_save"));
    if (saveBtn) saveBtn.disabled = false;
  }
}

/** Format the calendar's month header label according to UI locale. */
function formatMonthLabel(
  year: number,
  month: number,
  locale: ShareLocale,
): string {
  const names = locale === "ja" ? MONTH_NAMES_JA : MONTH_NAMES_EN;
  return t("calendar_month_label", [String(year), names[month]]);
}

/** Format a full date label (e.g. "2026 年 5 月 18 日" / "May 18, 2026") used by ARIA. */
function formatDayLabel(
  year: number,
  month: number,
  day: number,
  locale: ShareLocale,
): string {
  if (locale === "ja") return `${year} 年 ${month + 1} 月 ${day} 日`;
  return `${MONTH_NAMES_EN[month]} ${day}, ${year}`;
}

/** Tuple equality helper for the currently-selected calendar day. */
function isSameYearMonthDay(
  a: { year: number; month: number; day: number } | null,
  y: number,
  m: number,
  d: number,
): boolean {
  return !!a && a.year === y && a.month === m && a.day === d;
}

/** True iff the given Y/M/D tuple matches the local "today". */
function isToday(y: number, m: number, d: number): boolean {
  const now = new Date();
  return (
    now.getFullYear() === y && now.getMonth() === m && now.getDate() === d
  );
}

/** Rebuild the month grid for the current `viewYear`/`viewMonth` and re-render. */
async function refreshCalendar(): Promise<void> {
  const entries = await getEntries();
  const grid = buildMonthGrid(entries, viewYear, viewMonth);
  renderCalendar(grid);
  updateCalendarNav();
  if (selectedDay) {
    await renderDayDetail(
      entries,
      selectedDay.year,
      selectedDay.month,
      selectedDay.day,
    );
  }
}

/** Render a {@link MonthGrid} into the calendar `<ul>`. */
function renderCalendar(grid: ReturnType<typeof buildMonthGrid>): void {
  const locale = resolveShareLocale();
  const monthLabel = document.getElementById("calendar-month-label");
  if (monthLabel) {
    monthLabel.textContent = formatMonthLabel(grid.year, grid.month, locale);
  }

  const list = document.getElementById("calendar-grid") as HTMLUListElement | null;
  if (!list) return;
  list.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const week of grid.weeks) {
    for (const cell of week) {
      const li = document.createElement("li");
      li.className = "calendar__cell";
      li.setAttribute("role", "gridcell");
      if (!cell.inMonth) li.classList.add("is-outside");
      if (isToday(cell.year, cell.month, cell.day)) li.classList.add("is-today");
      if (isSameYearMonthDay(selectedDay, cell.year, cell.month, cell.day)) {
        li.classList.add("is-selected");
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar__cell-btn";
      btn.disabled = !cell.inMonth;

      const dateLabelParts: string[] = [
        formatDayLabel(cell.year, cell.month, cell.day, locale),
      ];
      if (cell.count > 0 && cell.topEmoji) {
        dateLabelParts.push(`${cell.count}`);
        dateLabelParts.push(t(EMOJI_LABEL_KEY[cell.topEmoji]));
      } else {
        dateLabelParts.push(t("calendar_day_detail_empty"));
      }
      btn.setAttribute("aria-label", dateLabelParts.join(" "));

      const date = document.createElement("span");
      date.className = "calendar__date";
      date.textContent = String(cell.day);
      btn.append(date);

      const emoji = document.createElement("span");
      emoji.className = "calendar__cell-emoji";
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = cell.topEmoji ? EMOJI_GLYPH[cell.topEmoji] : "";
      btn.append(emoji);

      const count = document.createElement("span");
      count.className = "calendar__cell-count";
      count.setAttribute("aria-hidden", "true");
      count.textContent = cell.count > 0 ? String(cell.count) : "";
      btn.append(count);

      if (cell.inMonth) {
        btn.addEventListener("click", () => {
          void openDayDetail(cell.year, cell.month, cell.day);
        });
      }

      li.append(btn);
      frag.append(li);
    }
  }
  list.append(frag);
}

/** Whether the currently cached {@link PremiumStatus} grants premium access. */
function isPremiumNow(): boolean {
  return premiumStatus?.isPremiumActive ?? false;
}

/** Enable/disable the prev/next month buttons based on the tier history window. */
function updateCalendarNav(): void {
  const prev = document.getElementById("calendar-prev") as HTMLButtonElement | null;
  const next = document.getElementById("calendar-next") as HTMLButtonElement | null;
  const hint = document.getElementById("calendar-locked-hint") as HTMLElement | null;
  const now = new Date();
  const earliest = earliestAllowedMonth(now, isPremiumNow());
  const latest = latestAllowedMonth(now);

  if (prev) {
    const prevShift = shiftMonth(viewYear, viewMonth, -1);
    prev.disabled = compareYearMonth(prevShift, earliest) < 0;
  }
  if (next) {
    const nextShift = shiftMonth(viewYear, viewMonth, 1);
    next.disabled = compareYearMonth(nextShift, latest) > 0;
  }
  if (hint) hint.hidden = true;
}

/** Open the day-detail drawer for the given date, scrolling it into view. */
async function openDayDetail(
  year: number,
  month: number,
  day: number,
): Promise<void> {
  selectedDay = { year, month, day };
  const entries = await getEntries();
  await renderDayDetail(entries, year, month, day);

  document
    .querySelectorAll<HTMLLIElement>("#calendar-grid .calendar__cell")
    .forEach((li) => li.classList.remove("is-selected"));

  const list = document.getElementById("calendar-grid");
  if (list) {
    const buttons = list.querySelectorAll<HTMLButtonElement>(
      ".calendar__cell-btn",
    );
    buttons.forEach((btn) => {
      const parent = btn.parentElement;
      if (!parent) return;
      const date = parent.querySelector(".calendar__date");
      if (!date) return;
      if (date.textContent === String(day) && !parent.classList.contains("is-outside")) {
        parent.classList.add("is-selected");
      }
    });
  }

  const detail = document.getElementById("calendar-day-detail") as HTMLElement | null;
  if (detail) {
    detail.hidden = false;
    detail.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "nearest" });
  }
}

/** Populate the day-detail drawer with entries for the chosen date. */
async function renderDayDetail(
  entries: Entry[],
  year: number,
  month: number,
  day: number,
): Promise<void> {
  const locale = resolveShareLocale();
  const label = document.getElementById("calendar-day-detail-label");
  const list = document.getElementById("calendar-day-list") as HTMLUListElement | null;
  const empty = document.getElementById("calendar-day-empty") as HTMLElement | null;
  if (!label || !list || !empty) return;

  label.textContent = formatDayLabel(year, month, day, locale);

  const dayEntries = entriesForDay(entries, year, month, day);
  list.innerHTML = "";
  if (dayEntries.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  for (const entry of dayEntries) {
    const li = document.createElement("li");

    const emoji = document.createElement("span");
    emoji.className = "calendar__detail-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = EMOJI_GLYPH[entry.emoji];
    li.append(emoji);

    const labelText = document.createElement("span");
    labelText.textContent = t(EMOJI_LABEL_KEY[entry.emoji]);
    li.append(labelText);

    const time = document.createElement("time");
    time.className = "calendar__detail-time";
    time.dateTime = new Date(entry.ts).toISOString();
    time.textContent = formatClock(entry.ts);
    li.append(time);

    if (entry.note) {
      const note = document.createElement("p");
      note.className = "calendar__detail-note";
      note.textContent = entry.note;
      li.append(note);
    }

    frag.append(li);
  }
  list.append(frag);
}

/** Click handler for the "previous month" button — shows the locked hint at the boundary. */
function handlePrevMonth(): void {
  const now = new Date();
  const earliest = earliestAllowedMonth(now, isPremiumNow());
  const next = shiftMonth(viewYear, viewMonth, -1);
  if (compareYearMonth(next, earliest) < 0) {
    const hint = document.getElementById("calendar-locked-hint");
    if (hint) hint.hidden = false;
    return;
  }
  viewYear = next.year;
  viewMonth = next.month;
  selectedDay = null;
  const detail = document.getElementById("calendar-day-detail") as HTMLElement | null;
  if (detail) detail.hidden = true;
  void refreshCalendar();
}

/** Click handler for the "next month" button — bounded at the current month. */
function handleNextMonth(): void {
  const now = new Date();
  const latest = latestAllowedMonth(now);
  const next = shiftMonth(viewYear, viewMonth, 1);
  if (compareYearMonth(next, latest) > 0) return;
  viewYear = next.year;
  viewMonth = next.month;
  selectedDay = null;
  const detail = document.getElementById("calendar-day-detail") as HTMLElement | null;
  if (detail) detail.hidden = true;
  void refreshCalendar();
}

/** Move the emoji-picker selection by `delta` positions, wrapping at edges. */
function moveSelection(currentIndex: number, delta: number): void {
  const buttons = getEmojiButtons();
  if (buttons.length === 0) return;
  const next = (currentIndex + delta + buttons.length) % buttons.length;
  updateSelection(buttons[next], true);
}

/** Attach click + roving-tabindex keyboard handlers to all emoji buttons. */
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

/** Render the premium/trial card according to the given status. */
function renderPremiumSection(status: PremiumStatus): void {
  const statusEl = document.getElementById("premium-status") as HTMLElement | null;
  const descEl = document.getElementById("premium-desc") as HTMLElement | null;
  const priceEl = document.getElementById("premium-price") as HTMLElement | null;
  const trialBtn = document.getElementById(
    "premium-trial-btn",
  ) as HTMLButtonElement | null;
  const unlockBtn = document.getElementById(
    "premium-unlock-btn",
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
async function refreshPremiumStatus(): Promise<void> {
  premiumStatus = await getPremiumStatus();
  renderPremiumSection(premiumStatus);
}

/** Begin the 7-day premium trial (idempotent) and refresh the UI. */
async function handleTrialStart(): Promise<void> {
  try {
    await ensureTrialStarted();
    await refreshPremiumStatus();
    await refreshCalendar();
    setStatus(t("popup_saved"));
  } catch (err) {
    console.error("[emotion-checkin] trial start failed", err);
    setStatus(t("error_generic"));
  }
}

/** Open the Stripe Checkout tab and reflect the outcome in the status label. */
async function handleUnlockClick(): Promise<void> {
  try {
    const result = await openCheckout({ locale: resolveShareLocale() });
    if (result.opened) {
      setStatus(t("premium_unlock_opened"));
    } else {
      setStatus(t("premium_unlock_pending"));
    }
  } catch (err) {
    console.error("[emotion-checkin] unlock failed", err);
    setStatus(t("error_generic"));
  }
}

/** Wire up the static click handlers (save / options / share / nav / premium). */
function bindActions(): void {
  document.getElementById("save-btn")?.addEventListener("click", () => {
    void handleSave();
  });
  document.getElementById("open-options")?.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
  document.getElementById("share-parent-btn")?.addEventListener("click", () => {
    void handleShareClick();
  });
  document.getElementById("calendar-prev")?.addEventListener("click", () => {
    handlePrevMonth();
  });
  document.getElementById("calendar-next")?.addEventListener("click", () => {
    handleNextMonth();
  });
  document.getElementById("premium-trial-btn")?.addEventListener("click", () => {
    void handleTrialStart();
  });
  document.getElementById("premium-unlock-btn")?.addEventListener("click", () => {
    void handleUnlockClick();
  });
}

/** Entry point — runs on `DOMContentLoaded`. Wires all panels and kicks off the first render. */
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
  void refreshPremiumStatus().then(() => refreshCalendar());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
