import { EMOTION_KEYS, type EmotionKey, type Entry } from "./storage";

export type WeekdayKey =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export const WEEKDAY_KEYS: readonly WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export interface WeeklyStats {
  weekStart: number;
  total: number;
  byEmoji: Record<EmotionKey, number>;
  byDay: Record<WeekdayKey, number>;
  topEmotion: EmotionKey | null;
}

export function weekStartMs(now: Date = new Date()): number {
  const day = (now.getDay() + 6) % 7;
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - day,
  );
  return start.getTime();
}

function weekdayKeyOf(ts: number): WeekdayKey {
  const d = new Date(ts);
  const idx = (d.getDay() + 6) % 7;
  return WEEKDAY_KEYS[idx];
}

export function computeWeeklyStats(
  entries: Entry[],
  now: Date = new Date(),
): WeeklyStats {
  const weekStart = weekStartMs(now);

  const byEmoji = EMOTION_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<EmotionKey, number>,
  );

  const byDay = WEEKDAY_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<WeekdayKey, number>,
  );

  let total = 0;
  for (const entry of entries) {
    if (entry.ts < weekStart) continue;
    total += 1;
    byEmoji[entry.emoji] += 1;
    byDay[weekdayKeyOf(entry.ts)] += 1;
  }

  let topEmotion: EmotionKey | null = null;
  if (total > 0) {
    let max = 0;
    for (const key of EMOTION_KEYS) {
      if (byEmoji[key] > max) {
        max = byEmoji[key];
        topEmotion = key;
      }
    }
  }

  return { weekStart, total, byEmoji, byDay, topEmotion };
}
