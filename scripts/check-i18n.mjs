#!/usr/bin/env node
// T107: i18n メッセージキー総点検
// - _locales/ja/messages.json と _locales/en/messages.json のキー集合が一致するか
// - 各メッセージの placeholders 名集合がロケール間で一致するか
// - 各メッセージの message が空文字列でないか
// - src/**/*.ts の t("KEY") / src/**/*.html の data-i18n="KEY" / data-i18n-attr="...:KEY"
//   manifest.json の __MSG_KEY__ で参照される全キーが両ロケールに存在するか
// - 両ロケールに定義されているが src/manifest 内のどこからも参照されないキーが
//   RESERVED_KEYS allowlist に含まれているか (設計ドキュメント / 別 check スクリプト用に予約)
// 失敗時 exit 1。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const failures = [];
const fail = (msg) => failures.push(msg);

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((ext) => name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

// _locales/*/messages.json が出力する placeholder 名は小文字 ($name$ → name)
function extractPlaceholderNames(entry) {
  if (!entry || typeof entry !== "object" || !entry.placeholders) return [];
  return Object.keys(entry.placeholders).map((k) => k.toLowerCase()).sort();
}

// --- ja / en メッセージファイル読込 ---
let jaMsgs, enMsgs;
try {
  jaMsgs = JSON.parse(read("_locales/ja/messages.json"));
} catch (e) {
  fail(`_locales/ja/messages.json: JSON parse error: ${e.message}`);
}
try {
  enMsgs = JSON.parse(read("_locales/en/messages.json"));
} catch (e) {
  fail(`_locales/en/messages.json: JSON parse error: ${e.message}`);
}

if (jaMsgs && enMsgs) {
  const jaKeys = new Set(Object.keys(jaMsgs));
  const enKeys = new Set(Object.keys(enMsgs));

  for (const k of jaKeys) {
    if (!enKeys.has(k)) {
      fail(`_locales/en/messages.json: ja にあるが en に存在しないキー "${k}"`);
    }
  }
  for (const k of enKeys) {
    if (!jaKeys.has(k)) {
      fail(`_locales/ja/messages.json: en にあるが ja に存在しないキー "${k}"`);
    }
  }

  // --- 各メッセージの空文字列チェック + placeholder 集合一致 ---
  for (const k of jaKeys) {
    const j = jaMsgs[k];
    if (!j || typeof j.message !== "string" || j.message.length === 0) {
      fail(`_locales/ja/messages.json: "${k}" の message が空または非文字列`);
    }
    if (!enKeys.has(k)) continue;
    const e = enMsgs[k];
    if (!e || typeof e.message !== "string" || e.message.length === 0) {
      fail(`_locales/en/messages.json: "${k}" の message が空または非文字列`);
    }
    const jp = extractPlaceholderNames(j).join(",");
    const ep = extractPlaceholderNames(e).join(",");
    if (jp !== ep) {
      fail(
        `_locales: "${k}" の placeholders がロケール間で不一致 (ja=[${jp}] / en=[${ep}])`,
      );
    }
  }
}

// --- ソース側で参照される全キー収集 ---
const referencedKeys = new Set();

// t("KEY") 呼び出し: 直前は識別子文字ではない (createElement("li") 等の誤検出回避)
const tCallRe = /(?:^|[^a-zA-Z0-9_$])t\(\s*["']([\w_]+)["']/g;
const tsFiles = walk(resolve(ROOT, "src"), [".ts"]);
for (const file of tsFiles) {
  const src = readFileSync(file, "utf8");
  let m;
  while ((m = tCallRe.exec(src)) !== null) {
    referencedKeys.add(m[1]);
  }
}

// data-i18n="KEY" / data-i18n-attr="attr:KEY[,attr2:KEY2]"
const htmlFiles = walk(resolve(ROOT, "src"), [".html"]);
const dataI18nRe = /data-i18n\s*=\s*["']([\w_]+)["']/g;
const dataI18nAttrRe = /data-i18n-attr\s*=\s*["']([^"']+)["']/g;
for (const file of htmlFiles) {
  const src = readFileSync(file, "utf8");
  let m;
  while ((m = dataI18nRe.exec(src)) !== null) {
    referencedKeys.add(m[1]);
  }
  while ((m = dataI18nAttrRe.exec(src)) !== null) {
    for (const pair of m[1].split(",")) {
      const [, key] = pair.split(":").map((s) => s.trim());
      if (key) referencedKeys.add(key);
    }
  }
}

// manifest.json: __MSG_KEY__
const manifestSrc = read("manifest.json");
const msgRefRe = /__MSG_([\w_]+)__/g;
{
  let m;
  while ((m = msgRefRe.exec(manifestSrc)) !== null) {
    referencedKeys.add(m[1]);
  }
}

// --- 参照キー が両ロケールに存在するか ---
if (jaMsgs && enMsgs) {
  for (const k of referencedKeys) {
    if (!Object.prototype.hasOwnProperty.call(jaMsgs, k)) {
      fail(`_locales/ja/messages.json: 参照されているキー "${k}" が未定義`);
    }
    if (!Object.prototype.hasOwnProperty.call(enMsgs, k)) {
      fail(`_locales/en/messages.json: 参照されているキー "${k}" が未定義`);
    }
  }
}

// --- 未参照キーの検出 (allowlist 経由で予約) ---
// 設計ドキュメント / 別 check スクリプトで明示的に保持すべきと判断したキー
const RESERVED_KEYS = new Set([
  // check-parent-share.mjs が必須キーとして検証する parent-share メール本文用
  // (parentShare.ts は現状ハードコード localization を使うが、将来 chrome.i18n
  // 経由に切替えるための予約)
  "parent_share_subject",
  "parent_share_body_intro",
  "parent_share_body_total",
  "parent_share_body_top",
  "parent_share_body_by_day",
  "parent_share_body_by_emoji",
  "parent_share_body_footer",
  // docs/design/calendar-view.md が「既存キー」として記述しているカレンダー見出し
  // (現状の popup.html は動的な月ラベルのみ表示するため未使用だが将来 a11y 用)
  "calendar_title",
]);

if (jaMsgs) {
  for (const k of Object.keys(jaMsgs)) {
    if (referencedKeys.has(k)) continue;
    if (RESERVED_KEYS.has(k)) continue;
    fail(
      `_locales: キー "${k}" がソース/HTML/manifest から参照されていない (削除 or RESERVED_KEYS に追加)`,
    );
  }
}

if (failures.length === 0) {
  console.log("✓ i18n keys integrity check passed");
  process.exit(0);
} else {
  console.error("✗ i18n keys integrity check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
