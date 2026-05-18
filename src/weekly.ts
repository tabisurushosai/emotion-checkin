/**
 * @file Aggregates entries into weekly statistics consumed by both the popup
 * weekly view and the parent-share email body.
 */
import { EMOTION_KEYS, type EmotionKey, type Entry } from "./storage";

/** Mon–Sun weekday identifiers. */
export type WeekdayKey =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

/** Iteration order for weekdays — Monday first to match Japanese conventions. */
export const WEEKDAY_KEYS: readonly WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

/** Rollup of a single week's check-in activity. */
export interface WeeklyStats {
  /** Epoch ms at local-midnight Monday of the week. */
  weekStart: number;
  /** Total entries recorded in the week. */
  total: number;
  /** Count per emotion. */
  byEmoji: Record<EmotionKey, number>;
  /** Count per weekday. */
  byDay: Record<WeekdayKey, number>;
  /** Emotion with the highest count (ties broken by EMOTION_KEYS order), or null if `total === 0`. */
  topEmotion: EmotionKey | null;
}

/** Epoch ms at local-midnight of the Monday on or before `now`. */
export function weekStartMs(now: Date = new Date()): number {
  const day = (now.getDay() + 6) % 7;
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - day,
  );
  return start.getTime();
}

/** Convert an epoch ms timestamp into the local-weekday key. */
function weekdayKeyOf(ts: number): WeekdayKey {
  const d = new Date(ts);
  const idx = (d.getDay() + 6) % 7;
  return WEEKDAY_KEYS[idx];
}

/**
 * Aggregate entries falling in the current local week into a {@link WeeklyStats}.
 * Entries older than the week's Monday are ignored.
 * @param now Reference date (defaults to "now", overridable for tests).
 */
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
