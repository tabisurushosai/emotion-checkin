import { EMOTION_KEYS, type EmotionKey, type Entry } from "./storage";

export interface DayCell {
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  count: number;
  topEmoji: EmotionKey | null;
  dayStartMs: number;
}

export interface MonthGrid {
  year: number;
  month: number;
  weeks: DayCell[][];
}

function dayStartMs(year: number, month: number, day: number): number {
  return new Date(year, month, day).getTime();
}

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

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

export function earliestAllowedMonth(
  now: Date = new Date(),
): { year: number; month: number } {
  const m = now.getMonth() - 3;
  if (m < 0) return { year: now.getFullYear() - 1, month: m + 12 };
  return { year: now.getFullYear(), month: m };
}

export function latestAllowedMonth(
  now: Date = new Date(),
): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() };
}

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

export function compareYearMonth(
  a: { year: number; month: number },
  b: { year: number; month: number },
): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}
