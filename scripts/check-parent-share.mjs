#!/usr/bin/env node
// T027: parent-share 整合チェック
// - src/parentShare.ts に buildShareMail / formatWeekStartDate / ShareMail が export されているか
// - src/parentShare.ts が EMOTION_KEYS を ./storage から、WeeklyStats / WEEKDAY_KEYS を ./weekly から import しているか (二重定義禁止)
// - src/parentShare.ts に mailto: と encodeURIComponent( が両方存在するか
// - src/parentShare.ts が fetch( / XMLHttpRequest / chrome.identity を一切使っていないか (外部送信なし制約)
// - popup.html に id="share-parent-btn" と data-i18n="parent_share_button" があるか
// - popup.ts が ./parentShare を import し buildShareMail を呼んでいるか
// - background.ts に WEEKLY_NOTIFICATION_PREFIX 定義 + WEEKLY_ALARM_NAME 分岐の chrome.notifications.create があるか
// - ja/en messages.json に parent_share_* と notif_weekly_* が揃っているか
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

// --- src/parentShare.ts: API 公開 ---
const shareSrc = read("src/parentShare.ts");

if (!/export\s+function\s+buildShareMail\s*\(/.test(shareSrc)) {
  fail("src/parentShare.ts: export function buildShareMail がない");
}
if (!/export\s+function\s+formatWeekStartDate\s*\(/.test(shareSrc)) {
  fail("src/parentShare.ts: export function formatWeekStartDate がない");
}
if (!/export\s+(?:interface|type)\s+ShareMail\b/.test(shareSrc)) {
  fail("src/parentShare.ts: export interface/type ShareMail がない");
}

// --- import 経路 (二重定義禁止) ---
if (/export\s+const\s+EMOTION_KEYS\b/.test(shareSrc)) {
  fail("src/parentShare.ts: EMOTION_KEYS を再定義している (./storage から import せよ)");
}
if (/export\s+const\s+WEEKDAY_KEYS\b/.test(shareSrc)) {
  fail("src/parentShare.ts: WEEKDAY_KEYS を再定義している (./weekly から import せよ)");
}
if (!/import\s*(?:type\s*)?\{[^}]*EMOTION_KEYS[^}]*\}\s*from\s*["']\.\/storage["']/.test(shareSrc)) {
  fail("src/parentShare.ts: EMOTION_KEYS を ./storage から import していない");
}
if (!/import\s*(?:type\s*)?\{[^}]*WEEKDAY_KEYS[^}]*\}\s*from\s*["']\.\/weekly["']/.test(shareSrc)) {
  fail("src/parentShare.ts: WEEKDAY_KEYS を ./weekly から import していない");
}
if (!/WeeklyStats\b/.test(shareSrc)) {
  fail("src/parentShare.ts: WeeklyStats 型を参照していない");
}

// --- mailto: と encodeURIComponent ---
if (!/mailto:/.test(shareSrc)) {
  fail("src/parentShare.ts: mailto: リテラルが見つからない");
}
if (!/encodeURIComponent\s*\(/.test(shareSrc)) {
  fail("src/parentShare.ts: encodeURIComponent( が使われていない");
}

// --- 外部送信なしリグレッション ---
const forbiddenPatterns = [
  { re: /\bfetch\s*\(/, label: "fetch(" },
  { re: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
  { re: /\bXHR\b/, label: "XHR" },
  { re: /chrome\.identity\b/, label: "chrome.identity" },
];
for (const { re, label } of forbiddenPatterns) {
  if (re.test(shareSrc)) {
    fail(`src/parentShare.ts: ${label} を使用している (SPEC.md 外部送信なし制約違反)`);
  }
}

// --- popup.html: 共有ボタン ---
const popupHtml = read("src/popup.html");
if (!/id="share-parent-btn"/.test(popupHtml)) {
  fail('popup.html: id="share-parent-btn" の <button> が見つからない');
}
if (!/data-i18n="parent_share_button"/.test(popupHtml)) {
  fail('popup.html: data-i18n="parent_share_button" が見つからない');
}

// --- popup.ts: parentShare import + buildShareMail 呼び出し ---
const popupTs = read("src/popup.ts");
if (!/from\s+["']\.\/parentShare["']/.test(popupTs)) {
  fail("popup.ts: ./parentShare を import していない");
}
if (!/buildShareMail\s*\(/.test(popupTs)) {
  fail("popup.ts: buildShareMail() を呼んでいない");
}
if (/chrome\.storage\.local\.(set|get)\s*\(/.test(popupTs)) {
  fail("popup.ts: chrome.storage.local を直接操作している (storage.ts 経由にする)");
}

// --- background.ts: WEEKLY_NOTIFICATION_PREFIX 定義 + WEEKLY_ALARM_NAME 分岐 ---
const bgSrc = read("src/background.ts");
if (!/WEEKLY_NOTIFICATION_PREFIX\s*=\s*["'][^"']+["']/.test(bgSrc)) {
  fail("background.ts: WEEKLY_NOTIFICATION_PREFIX 定義が見つからない");
}
if (!/WEEKLY_ALARM_NAME\b/.test(bgSrc)) {
  fail("background.ts: WEEKLY_ALARM_NAME 参照が見つからない");
}
if (!/chrome\.notifications\.create\s*\(/.test(bgSrc)) {
  fail("background.ts: chrome.notifications.create が見つからない");
}
if (!/notif_weekly_title/.test(bgSrc)) {
  fail("background.ts: notif_weekly_title が使われていない");
}
if (!/notif_weekly_body/.test(bgSrc)) {
  fail("background.ts: notif_weekly_body が使われていない");
}

// --- _locales: 必須キーが揃っているか ---
const requiredLocaleKeys = [
  "parent_share_button",
  "parent_share_subject",
  "parent_share_body_intro",
  "parent_share_body_total",
  "parent_share_body_top",
  "parent_share_body_by_day",
  "parent_share_body_by_emoji",
  "parent_share_body_footer",
  "parent_share_no_email",
  "notif_weekly_title",
  "notif_weekly_body",
];
for (const locale of ["ja", "en"]) {
  const msgs = JSON.parse(read(`_locales/${locale}/messages.json`));
  for (const k of requiredLocaleKeys) {
    if (!msgs[k] || typeof msgs[k].message !== "string" || msgs[k].message.length === 0) {
      fail(`_locales/${locale}/messages.json: ${k} 欠落`);
    }
  }
}

if (failures.length === 0) {
  console.log("✓ parent-share integrity check passed");
  process.exit(0);
} else {
  console.error("✗ parent-share integrity check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
