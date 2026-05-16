import { EMOJI_GLYPH } from "./emoji";
import { EMOTION_KEYS, type EmotionKey } from "./storage";
import { WEEKDAY_KEYS, type WeekdayKey, type WeeklyStats } from "./weekly";

export type ShareLocale = "ja" | "en";

export interface ShareMail {
  to: string;
  subject: string;
  body: string;
  mailtoUrl: string;
}

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

export function formatWeekStartDate(weekStartMs: number): string {
  const d = new Date(weekStartMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWeekEndDate(weekStartMs: number): string {
  return formatWeekStartDate(weekStartMs + 6 * DAY_MS);
}

function resolveLocale(locale?: ShareLocale): ShareLocale {
  return locale === "en" ? "en" : "ja";
}

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
