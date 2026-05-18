/**
 * @file Month-grid construction and navigation utilities for the calendar view.
 *
 * Pure functions only — no DOM or storage access; consumers feed in entries and
 * render the resulting grid themselves.
 */
import { EMOTION_KEYS, type EmotionKey, type Entry } from "./storage";

/** One cell of the rendered month grid. */
export interface DayCell {
  year: number;
  month: number;
  day: number;
  /** False for leading/trailing days that belong to adjacent months. */
  inMonth: boolean;
  /** Number of entries recorded on this date. */
  count: number;
  /** Most frequent emotion of the day, or `null` if no entries. */
  topEmoji: EmotionKey | null;
  /** Epoch ms at local-midnight of this date. */
  dayStartMs: number;
}

/** A rendered month, broken into Mon–Sun week rows. */
export interface MonthGrid {
  year: number;
  month: number;
  weeks: DayCell[][];
}

/** Epoch ms at local-midnight of the given Y/M/D. */
function dayStartMs(year: number, month: number, day: number): number {
  return new Date(year, month, day).getTime();
}

/** Index of `date` within a Mon–Sun week (0 = Monday, 6 = Sunday). */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Number of days in `year`/`month`. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Group entries by local-date string so day lookups are O(1). */
function bucketEntriesByDay(entries: Entry[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) {
    const d = new Date(entry.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  return map;
}

/** Pick the most-frequent emotion in `dayEntries` (ties resolved by EMOTION_KEYS order). */
function topEmojiOf(dayEntries: Entry[]): EmotionKey | null {
  if (dayEntries.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const e of dayEntries) {
    counts[e.emoji] = (counts[e.emoji] ?? 0) + 1;
  }
  let top: EmotionKey | null = null;
  let max = 0;
  for (const key of EMOTION_KEYS) {
    const c = counts[key] ?? 0;
    if (c > max) {
      max = c;
      top = key;
    }
  }
  return top;
}

/**
 * Build a Mon–Sun {@link MonthGrid} for `year`/`month`, padded so each week is
 * exactly 7 cells.
 * @param entries All known entries — only those falling in the visible range are used.
 * @param year 4-digit year.
 * @param month 0-indexed month (0 = January).
 */
export function buildMonthGrid(
  entries: Entry[],
  year: number,
  month: number,
): MonthGrid {
  const bucket = bucketEntriesByDay(entries);
  const firstOfMonth = new Date(year, month, 1);
  const offset = mondayIndex(firstOfMonth);
  const start = new Date(year, month, 1 - offset);

  const lastOfMonth = new Date(year, month, daysInMonth(year, month));
  const lastOffset = 6 - mondayIndex(lastOfMonth);
  const end = new Date(
    lastOfMonth.getFullYear(),
    lastOfMonth.getMonth(),
    lastOfMonth.getDate() + lastOffset,
  );

  const totalDays =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  const weeks: DayCell[][] = [];
  let week: DayCell[] = [];
  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    );
    const y = d.getFullYear();
    const m = d.getMonth();
    const dd = d.getDate();
    const key = `${y}-${m}-${dd}`;
    const list = bucket.get(key) ?? [];
    const cell: DayCell = {
      year: y,
      month: m,
      day: dd,
      inMonth: m === month && y === year,
      count: list.length,
      topEmoji: topEmojiOf(list),
      dayStartMs: dayStartMs(y, m, dd),
    };
    week.push(cell);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  return { year, month, weeks };
}

/**
 * Step a (year, month) tuple by ±1 month, rolling over year boundaries.
 * @param delta -1 to go back one month, +1 to advance one month.
 */
export function shiftMonth(
  year: number,
  month: number,
  delta: -1 | 1,
): { year: number; month: number } {
  const next = month + delta;
  if (next < 0) return { year: year - 1, month: 11 };
  if (next > 11) return { year: year + 1, month: 0 };
  return { year, month: next };
}

/** Free-tier calendar history window in months. */
export const FREE_CALENDAR_HISTORY_MONTHS = 3;
/** Premium-tier calendar history window in years. */
export const PREMIUM_CALENDAR_HISTORY_YEARS = 5;

/**
 * Oldest month the calendar may navigate to given the current tier.
 * @param now Reference date (for testability).
 * @param premium Whether the user has premium access.
 */
export function earliestAllowedMonth(
  now: Date = new Date(),
  premium: boolean = false,
): { year: number; month: number } {
  if (premium) {
    return { year: now.getFullYear() - PREMIUM_CALENDAR_HISTORY_YEARS, month: 0 };
  }
  const m = now.getMonth() - FREE_CALENDAR_HISTORY_MONTHS;
  if (m < 0) return { year: now.getFullYear() - 1, month: m + 12 };
  return { year: now.getFullYear(), month: m };
}

/** Newest month the calendar may navigate to (the current month). */
export function latestAllowedMonth(
  now: Date = new Date(),
): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() };
}

/** All entries on a specific local date, newest first. */
export function entriesForDay(
  entries: Entry[],
  year: number,
  month: number,
  day: number,
): Entry[] {
  return entries
    .filter((e) => {
      const d = new Date(e.ts);
      return (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === day
      );
    })
    .sort((a, b) => b.ts - a.ts);
}

/** Compare two (year, month) tuples chronologically (`<0`, `0`, `>0`). */
export function compareYearMonth(
  a: { year: number; month: number },
  b: { year: number; month: number },
): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}
