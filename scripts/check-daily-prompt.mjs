#!/usr/bin/env node
// T021: daily-prompt 整合チェック
// - manifest.json に "notifications" 権限があるか
// - ja/en messages.json に notif_daily_title / notif_daily_body が両方揃っているか
// - background.ts が chrome.notifications.create / chrome.notifications.onClicked を扱っているか
// - background.ts が chrome.storage.onChanged 経由で syncDailyAlarms を再実行しているか
// - alarm 名が `daily-prompt-` プレフィックスで動的生成されているか
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

// --- manifest.json: notifications / alarms / storage 権限 ---
const manifest = JSON.parse(read("manifest.json"));
const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
for (const p of ["notifications", "alarms", "storage"]) {
  if (!permissions.includes(p)) {
    fail(`manifest.json: permissions に "${p}" がない`);
  }
}

// --- _locales: 通知文 ---
const notifKeys = ["notif_daily_title", "notif_daily_body"];
for (const locale of ["ja", "en"]) {
  const msgs = JSON.parse(read(`_locales/${locale}/messages.json`));
  for (const k of notifKeys) {
    if (!msgs[k] || typeof msgs[k].message !== "string" || msgs[k].message.length === 0) {
      fail(`_locales/${locale}/messages.json: ${k} 欠落`);
    }
  }
}

// --- background.ts: 動的 alarm 生成 + notifications + storage 変更監視 ---
const bg = read("src/background.ts");

if (!/DAILY_ALARM_PREFIX\s*=\s*"daily-prompt-"/.test(bg)) {
  fail('background.ts: DAILY_ALARM_PREFIX = "daily-prompt-" 定義が見つからない');
}

// alarm 名がプレフィックス連結で動的生成されているか
// (= chrome.alarms.create("daily-prompt", ...) のような単独ハードコードがないか)
if (/chrome\.alarms\.create\(\s*["']daily-prompt["']\s*,/.test(bg)) {
  fail('background.ts: chrome.alarms.create("daily-prompt", ...) というハードコードが残っている');
}
if (!/chrome\.alarms\.create\(\s*alarmNameFor\s*\(/.test(bg)) {
  fail("background.ts: alarmNameFor(time) を介した動的 alarm 生成が見当たらない");
}

// syncDailyAlarms 関数とその呼び出し
if (!/async\s+function\s+syncDailyAlarms\s*\(/.test(bg)) {
  fail("background.ts: syncDailyAlarms() 関数定義がない");
}
if (!/notification_times/.test(bg)) {
  fail("background.ts: notification_times を参照していない");
}
if (!/notifications_enabled/.test(bg)) {
  fail("background.ts: notifications_enabled を参照していない");
}

// notifications.create / onClicked
if (!/chrome\.notifications\.create\s*\(/.test(bg)) {
  fail("background.ts: chrome.notifications.create を呼んでいない");
}
if (!/chrome\.notifications\.onClicked\.addListener/.test(bg)) {
  fail("background.ts: chrome.notifications.onClicked リスナがない");
}
// 感覚過敏配慮: silent: true / requireInteraction: false
if (!/silent\s*:\s*true/.test(bg)) {
  fail("background.ts: 通知作成時に silent: true が指定されていない (感覚過敏配慮)");
}
if (!/requireInteraction\s*:\s*false/.test(bg)) {
  fail("background.ts: 通知作成時に requireInteraction: false が指定されていない");
}
// i18n キー使用
for (const k of notifKeys) {
  const re = new RegExp(`t\\(\\s*["']${k}["']\\s*\\)`);
  if (!re.test(bg)) {
    fail(`background.ts: t("${k}") が呼ばれていない (通知文の i18n 化)`);
  }
}

// chrome.storage.onChanged で settings 変更時 syncDailyAlarms 再実行
if (!/chrome\.storage\.onChanged\.addListener/.test(bg)) {
  fail("background.ts: chrome.storage.onChanged.addListener がない");
}
// settings キー変更を見て syncDailyAlarms を呼ぶブロックを大雑把に確認
const onChangedBlock = bg.match(
  /chrome\.storage\.onChanged\.addListener\([\s\S]*?\}\s*\)\s*;/,
);
if (!onChangedBlock || !/syncDailyAlarms\s*\(/.test(onChangedBlock[0])) {
  fail("background.ts: chrome.storage.onChanged ハンドラ内で syncDailyAlarms() を呼んでいない");
}
if (!onChangedBlock || !/STORAGE_KEYS\.settings|["']settings["']/.test(onChangedBlock[0])) {
  fail("background.ts: chrome.storage.onChanged ハンドラが settings キー変更を判定していない");
}

// alarms.onAlarm: プレフィックス判定で showDailyNotification 発火
if (!/chrome\.alarms\.onAlarm\.addListener/.test(bg)) {
  fail("background.ts: chrome.alarms.onAlarm リスナがない");
}
if (!/startsWith\(\s*DAILY_ALARM_PREFIX\s*\)/.test(bg)) {
  fail("background.ts: alarm 名の DAILY_ALARM_PREFIX 判定がない");
}
if (!/function\s+showDailyNotification\s*\(/.test(bg)) {
  fail("background.ts: showDailyNotification 関数定義がない");
}

// --- options 側で chrome.alarms を直接触っていないか (責務分散防止) ---
const optsPath = "src/options.ts";
let optsTs = "";
try {
  optsTs = read(optsPath);
} catch {
  // options.ts は T014 で作成済み想定。なければここでは何もしない。
}
if (optsTs && /chrome\.alarms\.(create|clear|getAll)\s*\(/.test(optsTs)) {
  fail("options.ts: chrome.alarms を直接操作している (background.ts の syncDailyAlarms に集約せよ)");
}

if (failures.length === 0) {
  console.log("✓ daily-prompt integrity check passed");
  process.exit(0);
} else {
  console.error("✗ daily-prompt integrity check FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
