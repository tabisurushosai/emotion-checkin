#!/usr/bin/env node
// T018: emoji-picker 整合チェック
// - EMOTION_KEYS / EMOJI_GLYPH / EMOJI_LABEL_KEY と popup.html / _locales が一致するか
// - storage.ts の契約 (EmotionKey, NOTE_MAX_LENGTH) と整合するか
// 失敗時 exit 1。CI/手動でも呼べる軽量チェッカ。

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

// --- storage.ts: EMOTION_KEYS と NOTE_MAX_LENGTH を取り出す ---
const storageSrc = read("src/storage.ts");
const keysMatch = storageSrc.match(
  /EMOTION_KEYS\s*:\s*readonly EmotionKey\[\]\s*=\s*\[([^\]]+)\]/,
);
if (!keysMatch) {
  fail("storage.ts: EMOTION_KEYS 配列が見つからない");
}
const EMOTION_KEYS = keysMatch
  ? Array.from(keysMatch[1].matchAll(/"([a-z_]+)"/g)).map((m) => m[1])
  : [];

const noteMax = storageSrc.match(/NOTE_MAX_LENGTH\s*=\s*(\d+)/);
if (!noteMax) {
  fail("storage.ts: NOTE_MAX_LENGTH が見つからない");
}
const NOTE_MAX_LENGTH = noteMax ? Number(noteMax[1]) : null;

// --- emoji.ts: glyph / labelKey テーブルが全 key を網羅しているか ---
const emojiSrc = read("src/emoji.ts");
function tableKeys(name) {
  const re = new RegExp(`${name}\\s*:\\s*Record<EmotionKey,\\s*string>\\s*=\\s*\\{([\\s\\S]*?)\\}`);
  const m = emojiSrc.match(re);
  if (!m) return null;
  return Array.from(m[1].matchAll(/(\w+)\s*:/g)).map((x) => x[1]);
}
const glyphKeys = tableKeys("EMOJI_GLYPH");
const labelKeys = tableKeys("EMOJI_LABEL_KEY");
if (!glyphKeys) fail("emoji.ts: EMOJI_GLYPH テーブルが見つからない");
if (!labelKeys) fail("emoji.ts: EMOJI_LABEL_KEY テーブルが見つからない");

function sameSet(a, b, label) {
  const missing = a.filter((k) => !b.includes(k));
  const extra = b.filter((k) => !a.includes(k));
  if (missing.length) fail(`${label}: 不足 ${missing.join(",")}`);
  if (extra.length) fail(`${label}: 余剰 ${extra.join(",")}`);
}
if (glyphKeys) sameSet(EMOTION_KEYS, glyphKeys, "EMOJI_GLYPH vs EMOTION_KEYS");
if (labelKeys) sameSet(EMOTION_KEYS, labelKeys, "EMOJI_LABEL_KEY vs EMOTION_KEYS");

// labelKey の値 (i18n key) を取り出して、ja/en messages.json と突き合わせる
const labelKeyValueRe = /(\w+)\s*:\s*"(emoji_[a-z]+)"/g;
const labelKeyMap = {};
for (const m of emojiSrc.matchAll(labelKeyValueRe)) {
  labelKeyMap[m[1]] = m[2];
}
for (const key of EMOTION_KEYS) {
  if (!labelKeyMap[key]) {
    fail(`emoji.ts: EMOJI_LABEL_KEY[${key}] のi18nキーが取り出せない`);
  }
}

// --- popup.html: 6 つのボタンと note maxlength を確認 ---
const popupHtml = read("src/popup.html");
for (const key of EMOTION_KEYS) {
  const re = new RegExp(`data-emoji="${key}"`);
  if (!re.test(popupHtml)) fail(`popup.html: data-emoji="${key}" のボタン欠落`);
  // radio role を確認
  const radioRe = new RegExp(
    `<button[^>]*data-emoji="${key}"[^>]*role="radio"|<button[^>]*role="radio"[^>]*data-emoji="${key}"`,
    "s",
  );
  if (!radioRe.test(popupHtml)) {
    fail(`popup.html: data-emoji="${key}" のボタンに role="radio" がない`);
  }
}
if (!/role="radiogroup"/.test(popupHtml)) {
  fail("popup.html: ラッパーに role=\"radiogroup\" がない");
}
const maxlenMatch = popupHtml.match(/<textarea[\s\S]*?maxlength="(\d+)"/);
if (!maxlenMatch) {
  fail("popup.html: note textarea に maxlength 属性がない");
} else if (Number(maxlenMatch[1]) !== NOTE_MAX_LENGTH) {
  fail(
    `popup.html: textarea maxlength=${maxlenMatch[1]} が storage.ts NOTE_MAX_LENGTH=${NOTE_MAX_LENGTH} と不一致`,
  );
}
if (!/id="save-btn"[^>]*disabled/.test(popupHtml)) {
  fail("popup.html: save-btn の初期 disabled が欠落");
}
if (!/id="save-status"[^>]*role="status"/.test(popupHtml)) {
  fail("popup.html: save-status の role=\"status\" が欠落");
}

// --- _locales: 全 emoji_* と popup_*/error_save が ja/en に存在するか ---
const requiredKeys = [
  ...EMOTION_KEYS.map((k) => `emoji_${k}`),
  "popup_title",
  "popup_subtitle",
  "popup_save",
  "popup_saved",
  "popup_today",
  "popup_note_placeholder",
  "popup_no_records",
  "error_save",
];
for (const locale of ["ja", "en"]) {
  const msgs = JSON.parse(read(`_locales/${locale}/messages.json`));
  for (const k of requiredKeys) {
    if (!msgs[k] || typeof msgs[k].message !== "string" || msgs[k].message.length === 0) {
      fail(`_locales/${locale}/messages.json: ${k} 欠落`);
    }
  }
}

// --- popup.ts: addEntry / getEntries 経由になっているか (chrome.storage 直書き禁止) ---
const popupTs = read("src/popup.ts");
if (/chrome\.storage\.local\.(set|get)\s*\(/.test(popupTs)) {
  fail("popup.ts: chrome.storage.local を直接操作している (storage.ts 経由にする)");
}
if (!/from\s+["']\.\/storage["']/.test(popupTs)) {
  fail("popup.ts: storage.ts を import していない");
}
if (!/from\s+["']\.\/emoji["']/.test(popupTs)) {
  fail("popup.ts: emoji.ts を import していない");
}

if (failures.length === 0) {
  console.log(
    `✓ emoji-picker integrity check passed (${EMOTION_KEYS.length} emotions: ${EMOTION_KEYS.join(", ")})`,
  );
  process.exit(0);
} else {
  console.error("✗ emoji-picker integrity check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
