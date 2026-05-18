/**
 * @file Builds the `mailto:` URL the popup opens when the user shares their
 * weekly summary with a parent/caregiver. All copy is localized in JA/EN.
 */
import { EMOJI_GLYPH } from "./emoji";
import { EMOTION_KEYS, type EmotionKey } from "./storage";
import { WEEKDAY_KEYS, type WeekdayKey, type WeeklyStats } from "./weekly";

/** Supported share-mail localizations. */
export type ShareLocale = "ja" | "en";

/** Output of {@link buildShareMail}. */
export interface ShareMail {
  /** Recipient address (may be empty if the user has not configured one). */
  to: string;
  /** Mail subject line, already localized. */
  subject: string;
  /** Plain-text body. */
  body: string;
  /** Fully encoded `mailto:` URL, or `""` if `to` is empty. */
  mailtoUrl: string;
}

/** Localized strings used to assemble the share-mail body. */
interface Labels {
  subject: string;
  intro: string;
  total: string;
  top: string;
  byDay: string;
  byEmoji: string;
  footer: string;
  countUnit: string;
  rangeSeparator: string;
  emoji: Record<EmotionKey, string>;
  day: Record<WeekdayKey, string>;
}

const LABELS: Record<ShareLocale, Labels> = {
  ja: {
    subject: "今週のきもち記録",
    intro: "今週のきもち記録",
    total: "記録回数",
    top: "一番多いきもち",
    byDay: "曜日別",
    byEmoji: "きもち別",
    footer: "— きもち記録 (Chrome 拡張) より",
    countUnit: "回",
    rangeSeparator: "〜",
    emoji: {
      happy: "うれしい",
      calm: "おだやか",
      tired: "つかれた",
      sad: "かなしい",
      angry: "いらいら",
      anxious: "ふあん",
    },
    day: {
      mon: "月",
      tue: "火",
      wed: "水",
      thu: "木",
      fri: "金",
      sat: "土",
      sun: "日",
    },
  },
  en: {
    subject: "Weekly check-in summary",
    intro: "Weekly check-ins",
    total: "Check-ins",
    top: "Most frequent mood",
    byDay: "By day",
    byEmoji: "By mood",
    footer: "— From Mood Check-in (Chrome ext.)",
    countUnit: "",
    rangeSeparator: " — ",
    emoji: {
      happy: "Happy",
      calm: "Calm",
      tired: "Tired",
      sad: "Sad",
      angry: "Angry",
      anxious: "Anxious",
    },
    day: {
      mon: "Mon",
      tue: "Tue",
      wed: "Wed",
      thu: "Thu",
      fri: "Fri",
      sat: "Sat",
      sun: "Sun",
    },
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Format a week-start epoch ms as `YYYY-MM-DD`. */
export function formatWeekStartDate(weekStartMs: number): string {
  const d = new Date(weekStartMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format the corresponding week-end (Sunday) as `YYYY-MM-DD`. */
function formatWeekEndDate(weekStartMs: number): string {
  return formatWeekStartDate(weekStartMs + 6 * DAY_MS);
}

/** Coerce an arbitrary input into one of the supported locales. */
function resolveLocale(locale?: ShareLocale): ShareLocale {
  return locale === "en" ? "en" : "ja";
}

/** Append a count unit (e.g. "回") only when one is configured for the locale. */
function withUnit(n: number, unit: string): string {
  return unit ? `${n} ${unit}` : String(n);
}

function buildSubject(stats: WeeklyStats, labels: Labels): string {
  return `${labels.subject} (${formatWeekStartDate(stats.weekStart)})`;
}

function buildBody(stats: WeeklyStats, labels: Labels): string {
  const weekStart = formatWeekStartDate(stats.weekStart);
  const weekEnd = formatWeekEndDate(stats.weekStart);
  const lines: string[] = [];

  lines.push(
    `${labels.intro} (${weekStart}${labels.rangeSeparator}${weekEnd})`,
  );
  lines.push("");
  lines.push(`${labels.total}: ${withUnit(stats.total, labels.countUnit)}`);

  if (stats.topEmotion) {
    const k = stats.topEmotion;
    lines.push(
      `${labels.top}: ${EMOJI_GLYPH[k]} ${labels.emoji[k]} (${withUnit(
        stats.byEmoji[k],
        labels.countUnit,
      )})`,
    );
  }

  lines.push("");
  lines.push(`${labels.byDay}:`);
  for (const day of WEEKDAY_KEYS) {
    lines.push(
      `  ${labels.day[day]} ${withUnit(stats.byDay[day], labels.countUnit)}`,
    );
  }

  lines.push("");
  lines.push(`${labels.byEmoji}:`);
  for (const key of EMOTION_KEYS) {
    lines.push(
      `  ${EMOJI_GLYPH[key]} ${labels.emoji[key]}  ${stats.byEmoji[key]}`,
    );
  }

  lines.push("");
  lines.push(labels.footer);

  return lines.join("\n");
}

/**
 * Construct a localized share email (subject + body + `mailto:` URL) from a
 * weekly stats rollup and the configured caregiver email.
 * @param stats Weekly stats from {@link computeWeeklyStats}.
 * @param parentEmail Recipient address (pass `""` if unset; `mailtoUrl` then becomes `""`).
 * @param locale Email locale, defaults to `"ja"` when unspecified or unknown.
 */
export function buildShareMail(
  stats: WeeklyStats,
  parentEmail: string,
  locale?: ShareLocale,
): ShareMail {
  const resolved = resolveLocale(locale);
  const labels = LABELS[resolved];
  const subject = buildSubject(stats, labels);
  const body = buildBody(stats, labels);
  const to = parentEmail;
  const mailtoUrl = to
    ? `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : "";
  return { to, subject, body, mailtoUrl };
}
