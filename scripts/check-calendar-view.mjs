#!/usr/bin/env node
// T030: calendar-view 整合チェック
// - src/calendar.ts に DayCell / MonthGrid 型 + buildMonthGrid / shiftMonth /
//   earliestAllowedMonth / latestAllowedMonth / entriesForDay / compareYearMonth が export されているか
// - src/calendar.ts が EMOTION_KEYS / EmotionKey / Entry を ./storage から import しているか (二重定義禁止)
// - src/calendar.ts が fetch( / XMLHttpRequest / XHR / chrome.identity を使っていないか (外部送信なし制約)
// - popup.html に section.calendar + calendar-prev / calendar-next / calendar-month-label /
//   calendar-grid / calendar-locked-hint / calendar-day-detail / calendar-day-detail-label /
//   calendar-day-list / calendar-day-empty があるか
// - popup.ts が ./calendar を import し buildMonthGrid / shiftMonth /
//   earliestAllowedMonth / latestAllowedMonth / entriesForDay / compareYearMonth を呼んでいるか
// - popup.ts が chrome.storage.local.get/set を直接呼んでいないか (storage.ts 経由必須)
// - ja/en messages.json に calendar_month_label (placeholders YEAR/MONTH) +
//   calendar_day_detail_empty + calendar_locked + calendar_prev + calendar_next + day_mon..day_sun が揃っているか
// 失敗時 exit 1。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const failures = [];
const fail = (msg) => failures.push(msg);

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// --- src/calendar.ts: API 公開 ---
const calSrc = read("src/calendar.ts");

if (!/export\s+(?:interface|type)\s+DayCell\b/.test(calSrc)) {
  fail("src/calendar.ts: export interface/type DayCell がない");
}
if (!/export\s+(?:interface|type)\s+MonthGrid\b/.test(calSrc)) {
  fail("src/calendar.ts: export interface/type MonthGrid がない");
}

const requiredExports = [
  "buildMonthGrid",
  "shiftMonth",
  "earliestAllowedMonth",
  "latestAllowedMonth",
  "entriesForDay",
  "compareYearMonth",
];
for (const name of requiredExports) {
  const re = new RegExp(`export\\s+function\\s+${name}\\s*\\(`);
  if (!re.test(calSrc)) {
    fail(`src/calendar.ts: export function ${name} がない`);
  }
}

// --- import 経路 (二重定義禁止) ---
if (/export\s+const\s+EMOTION_KEYS\b/.test(calSrc)) {
  fail("src/calendar.ts: EMOTION_KEYS を再定義している (./storage から import せよ)");
}
if (
  !/import\s*(?:type\s*)?\{[^}]*EMOTION_KEYS[^}]*\}\s*from\s*["']\.\/storage["']/.test(
    calSrc,
  )
) {
  fail("src/calendar.ts: EMOTION_KEYS を ./storage から import していない");
}
if (
  !/import\s*(?:type\s*)?\{[^}]*EmotionKey[^}]*\}\s*from\s*["']\.\/storage["']/.test(
    calSrc,
  )
) {
  fail("src/calendar.ts: EmotionKey 型を ./storage から import していない");
}
if (
  !/import\s*(?:type\s*)?\{[^}]*\bEntry\b[^}]*\}\s*from\s*["']\.\/storage["']/.test(
    calSrc,
  )
) {
  fail("src/calendar.ts: Entry 型を ./storage から import していない");
}

// --- 外部送信なしリグレッション ---
const forbiddenPatterns = [
  { re: /\bfetch\s*\(/, label: "fetch(" },
  { re: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { re: /\bXHR\b/, label: "XHR" },
  { re: /chrome\.identity\b/, label: "chrome.identity" },
];
for (const { re, label } of forbiddenPatterns) {
  if (re.test(calSrc)) {
    fail(`src/calendar.ts: ${label} を使用している (SPEC.md 外部送信なし制約違反)`);
  }
}

// --- popup.html: カレンダー UI ノード ---
const popupHtml = read("src/popup.html");
const requiredHtmlIds = [
  "calendar-prev",
  "calendar-next",
  "calendar-month-label",
  "calendar-grid",
  "calendar-locked-hint",
  "calendar-day-detail",
  "calendar-day-detail-label",
  "calendar-day-list",
  "calendar-day-empty",
];
for (const id of requiredHtmlIds) {
  const re = new RegExp(`id="${id}"`);
  if (!re.test(popupHtml)) {
    fail(`popup.html: id="${id}" が見つからない`);
  }
}
if (!/class="calendar"/.test(popupHtml)) {
  fail('popup.html: section class="calendar" が見つからない');
}
if (!/class="calendar__weekdays"/.test(popupHtml)) {
  fail('popup.html: .calendar__weekdays が見つからない');
}
if (!/role="grid"/.test(popupHtml)) {
  fail('popup.html: role="grid" の calendar-grid 要素が見つからない');
}

// --- popup.ts: calendar import + 主要関数呼び出し + storage 直触禁止 ---
const popupTs = read("src/popup.ts");
if (!/from\s+["']\.\/calendar["']/.test(popupTs)) {
  fail("popup.ts: ./calendar を import していない");
}
const requiredPopupCalls = [
  "buildMonthGrid",
  "shiftMonth",
  "earliestAllowedMonth",
  "latestAllowedMonth",
  "entriesForDay",
  "compareYearMonth",
];
for (const name of requiredPopupCalls) {
  const re = new RegExp(`\\b${name}\\s*\\(`);
  if (!re.test(popupTs)) {
    fail(`popup.ts: ${name}( を呼んでいない`);
  }
}
if (/chrome\.storage\.local\.(set|get)\s*\(/.test(popupTs)) {
  fail("popup.ts: chrome.storage.local を直接操作している (storage.ts 経由にする)");
}

// --- _locales: 必須キー + placeholders ---
const requiredLocaleKeys = [
  "calendar_prev",
  "calendar_next",
  "calendar_month_label",
  "calendar_day_detail_empty",
  "calendar_locked",
  "day_mon",
  "day_tue",
  "day_wed",
  "day_thu",
  "day_fri",
  "day_sat",
  "day_sun",
];
for (const locale of ["ja", "en"]) {
  const msgs = JSON.parse(read(`_locales/${locale}/messages.json`));
  for (const k of requiredLocaleKeys) {
    if (!msgs[k] || typeof msgs[k].message !== "string" || msgs[k].message.length === 0) {
      fail(`_locales/${locale}/messages.json: ${k} 欠落`);
    }
  }
  // placeholders for calendar_month_label
  const monthLabel = msgs["calendar_month_label"];
  if (monthLabel) {
    const placeholders = monthLabel.placeholders ?? {};
    const lowerKeys = Object.keys(placeholders).map((s) => s.toLowerCase());
    if (!lowerKeys.includes("year")) {
      fail(`_locales/${locale}/messages.json: calendar_month_label.placeholders に YEAR がない`);
    }
    if (!lowerKeys.includes("month")) {
      fail(`_locales/${locale}/messages.json: calendar_month_label.placeholders に MONTH がない`);
    }
  }
}

if (failures.length === 0) {
  console.log("✓ calendar-view integrity check passed");
  process.exit(0);
} else {
  console.error("✗ calendar-view integrity check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
