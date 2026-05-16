#!/usr/bin/env node
// T024: weekly-summary 整合チェック
// - src/weekly.ts に WEEKDAY_KEYS (mon..sun) と computeWeeklyStats / weekStartMs が export されているか
// - src/weekly.ts が EMOTION_KEYS を ./storage から import しているか (二重定義禁止)
// - popup.html に weekly_title / weekly_total / weekly_top_emotion / day_mon..day_sun の i18n 属性があるか
// - ja/en messages.json に weekly_* と day_mon..day_sun が揃っているか
// - popup.ts が weekly.ts を import し、chrome.storage.local を直接触っていないか
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

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// --- src/weekly.ts: API 公開と二重定義禁止 ---
const weeklySrc = read("src/weekly.ts");

if (!/export\s+const\s+WEEKDAY_KEYS\s*:/.test(weeklySrc)) {
  fail("src/weekly.ts: export const WEEKDAY_KEYS が見つからない");
}
for (const k of WEEKDAY_KEYS) {
  const re = new RegExp(`"${k}"`);
  if (!re.test(weeklySrc)) {
    fail(`src/weekly.ts: WEEKDAY_KEYS に "${k}" がない`);
  }
}
if (!/export\s+function\s+computeWeeklyStats\s*\(/.test(weeklySrc)) {
  fail("src/weekly.ts: export function computeWeeklyStats がない");
}
if (!/export\s+function\s+weekStartMs\s*\(/.test(weeklySrc)) {
  fail("src/weekly.ts: export function weekStartMs がない");
}
if (!/export\s+(?:interface|type)\s+WeeklyStats\b/.test(weeklySrc)) {
  fail("src/weekly.ts: export interface/type WeeklyStats がない");
}
// EMOTION_KEYS は storage.ts 経由 (emoji.ts 経由でも storage.ts 経由でもよいが、weekly 内での再定義は禁止)
if (/export\s+const\s+EMOTION_KEYS\b/.test(weeklySrc)) {
  fail("src/weekly.ts: EMOTION_KEYS を再定義している (storage.ts から import せよ)");
}
if (!/import\s*\{[^}]*EMOTION_KEYS[^}]*\}\s*from\s*["']\.\/storage["']/.test(weeklySrc)) {
  fail("src/weekly.ts: EMOTION_KEYS を ./storage から import していない");
}

// --- popup.html: i18n キーが揃っているか ---
const popupHtml = read("src/popup.html");
const requiredI18nAttrs = [
  "weekly_title",
  "weekly_total",
  "weekly_top_emotion",
  ...WEEKDAY_KEYS.map((d) => `day_${d}`),
];
for (const key of requiredI18nAttrs) {
  const re = new RegExp(`data-i18n="${key}"`);
  if (!re.test(popupHtml)) {
    fail(`popup.html: data-i18n="${key}" が見つからない`);
  }
}
if (!/<section[^>]*class="weekly"/.test(popupHtml)) {
  fail('popup.html: <section class="weekly"> が見つからない');
}

// --- _locales: 必須キーが揃っているか ---
const requiredLocaleKeys = [
  "weekly_title",
  "weekly_total",
  "weekly_top_emotion",
  ...WEEKDAY_KEYS.map((d) => `day_${d}`),
];
for (const locale of ["ja", "en"]) {
  const msgs = JSON.parse(read(`_locales/${locale}/messages.json`));
  for (const k of requiredLocaleKeys) {
    if (!msgs[k] || typeof msgs[k].message !== "string" || msgs[k].message.length === 0) {
      fail(`_locales/${locale}/messages.json: ${k} 欠落`);
    }
  }
}

// --- popup.ts: weekly.ts 経由 + chrome.storage.local 直書き禁止 ---
const popupTs = read("src/popup.ts");
if (!/from\s+["']\.\/weekly["']/.test(popupTs)) {
  fail("popup.ts: weekly.ts を import していない");
}
if (!/computeWeeklyStats\s*\(/.test(popupTs)) {
  fail("popup.ts: computeWeeklyStats() を呼んでいない");
}
if (/chrome\.storage\.local\.(set|get)\s*\(/.test(popupTs)) {
  fail("popup.ts: chrome.storage.local を直接操作している (storage.ts 経由にする)");
}

if (failures.length === 0) {
  console.log("✓ weekly-summary integrity check passed");
  process.exit(0);
} else {
  console.error("✗ weekly-summary integrity check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
