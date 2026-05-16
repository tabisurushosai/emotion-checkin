# 設計: daily-prompt

T019 (Phase 3 / コア機能 2/5)。T020 実装・T021 整合の基準となる契約を確定する。

## 目的
- ユーザが設定した時刻 (デフォルト 09:00 / 13:00 / 20:00) に「きもちを記録しよう」通知を出し、popup を開く導線を作る。
- 1日に複数回の感情記録を促し、emoji-picker (T016-T018) と直接連携する。
- ネットワーク・外部 API 不使用 (chrome.notifications + chrome.alarms のみ)。

## ドメイン契約 (storage.ts と一致)
- `Settings.notifications_enabled: boolean` — 通知 ON/OFF (デフォルト `false`、ユーザが options 画面で opt-in)。
- `Settings.notification_times: string[]` — `HH:MM` (24h) のリスト。`isValidTimeString` (storage.ts:59) で正規化済み。デフォルト `["09:00", "13:00", "20:00"]`。
- 通知発火条件:
  - `notifications_enabled === true`
  - かつ alarm 発火時刻が `notification_times` のいずれかと一致 (HH:MM 単位)
- 通知タップ → popup を開く (`chrome.action.openPopup` が使えない環境では `chrome.runtime.openOptionsPage()` 相当のフォールバックを取らず、通知 click ハンドラ内では何もしない。Chrome の通知 click は単に通知を閉じる挙動でも UX として許容)。

## chrome.alarms 設計
- alarm 名: `daily-prompt-{HH}-{MM}` (例: `daily-prompt-09-00`)。
- 1つの時刻 = 1 alarm。`notification_times` の変更時に
  1. 既存 `daily-prompt-*` alarm を全削除
  2. `notifications_enabled === true` のときのみ新規作成
- 各 alarm は `when: 次回の HH:MM (ローカル時刻)`、`periodInMinutes: 24 * 60`。
- background.ts:46 の `ensureDailyAlarm` が現在ハードコードで `daily-prompt` 1本を作っているのを、本タスクで `notification_times` ベースに置換する (T020)。
- onStartup / onInstalled / settings 変更時 (`chrome.storage.onChanged` リスナ) で `syncDailyAlarms()` を呼ぶ。

## 通知仕様
- `chrome.notifications.create(notificationId, {...})`:
  - `type: "basic"`
  - `iconUrl: chrome.runtime.getURL("icons/icon128.png")`
  - `title: t("notif_daily_title")` (i18n)
  - `message: t("notif_daily_body")` (i18n)
  - `priority: 0` (静かに表示、子供向け配慮)
  - `requireInteraction: false` (自動で消える)
  - `silent: true` (音なし、感覚過敏の利用者配慮)
- `notificationId` は `daily-prompt-{ts}` でユニーク化 (重複表示防止)。
- 通知 click 時の挙動:
  - Chrome 拡張では popup を programmatic に開く API が制限される (`chrome.action.openPopup` は user gesture 必要)。
  - そのため click ハンドラでは通知を閉じるだけ、ユーザがツールバーアイコンをクリックして popup を開く想定。
  - 将来 `chrome.action.openPopup` が安定したら差し替え可能なよう、`handleNotificationClick` を関数化しておく。

## 権限追加 (manifest.json)
- `"notifications"` を `permissions` に追加 (T020)。
- ホスト権限は不要 (通知 API はホスト権限不要)。
- 既存の `"storage"`, `"alarms"` は維持。

## i18n 追加キー (T020 で `_locales/{ja,en}/messages.json` に追加)
| key                 | ja                          | en                                |
| ------------------- | --------------------------- | --------------------------------- |
| `notif_daily_title` | きもちを記録しよう          | Time to check in                  |
| `notif_daily_body`  | 今のきもちを教えてね 😊     | How are you feeling right now? 😊 |

- 既存の `options_notification_*` キーは流用 (追加不要)。

## options 画面との接続
- options.ts は既に `notifications_enabled` と `notification_times` を `setSettings()` で保存する (T014)。
- 本タスクでは **保存後に必ず `syncDailyAlarms()` を呼ぶ** ことを T020 でフックする。
  - 方式 A: options.ts から直接 `chrome.alarms` を触る → 責務分散・テストしづらい。
  - 方式 B (採用): `chrome.storage.onChanged` を background.ts で監視し、`settings` キー変更時に `syncDailyAlarms()` を発火。options.ts は storage 書き込みだけ責任を持つ。

## a11y / UX 配慮
- `silent: true` で通知音オフ (感覚過敏ユーザ配慮)。
- 通知本文は短く、絵文字 1つだけ (子供にも読める)。
- 通知デフォルト OFF (opt-in)。インストール直後は何も鳴らない。
- 1日上限 = `notification_times.length` (デフォルト 3回)。連続通知のスパムを避けるため、同じ HH:MM の alarm は 1つだけ。

## 受け入れ条件 (T021 で確認)
- [ ] `notifications_enabled = true` + `notification_times` を設定すると、次回 HH:MM で `chrome.alarms.getAll()` に対応 alarm が並ぶ。
- [ ] `notifications_enabled = false` に切り替えると `daily-prompt-*` alarm が全て消える。
- [ ] `notification_times` を変更 ([09:00, 13:00] → [10:00, 22:00]) すると、古い alarm が消え新しい alarm のみ残る。
- [ ] alarm 発火時 `chrome.notifications.create` が呼ばれ、`title` / `message` が i18n キー経由になっている。
- [ ] manifest.json `permissions` に `"notifications"` が含まれる。
- [ ] ja / en どちらの locale でも通知文字列が切り替わる。
- [ ] `chrome.storage.onChanged` で `settings` 変更を検知し、`syncDailyAlarms()` が再実行される。

### 静的整合チェッカ (T021 で `scripts/check-daily-prompt.mjs` を新規作成)
- manifest.json に `"notifications"` 権限があるか
- ja/en messages.json に `notif_daily_title` / `notif_daily_body` が両方揃っているか
- background.ts が `chrome.notifications.create` を呼んでいるか
- background.ts が `chrome.storage.onChanged.addListener` 経由で `syncDailyAlarms()` を呼んでいるか
- alarm 名が `daily-prompt-` プレフィックスで動的生成されているか (= ハードコード `"daily-prompt"` 単体がないか)

`npm run check` に `check:daily-prompt` を追加し、emoji-picker と合わせて毎回検証する。

## T020 実装スコープ (この設計から派生)
1. `manifest.json` に `"notifications"` 権限追加。
2. `_locales/{ja,en}/messages.json` に `notif_daily_title` / `notif_daily_body` 追加。
3. `src/background.ts`:
   - `ensureDailyAlarm()` を `syncDailyAlarms()` に置換 (`settings.notification_times` をループして alarm 生成)。
   - `chrome.alarms.onAlarm` で `daily-prompt-` プレフィックス判定 → `showDailyNotification()`。
   - `chrome.storage.onChanged` リスナで `settings` 変更時 `syncDailyAlarms()` 再実行。
   - `chrome.notifications.onClicked` リスナで通知を閉じる (将来 `openPopup` 差し替え可能な関数化)。
4. `chrome.notifications` の型は `@types/chrome` に含まれるため devDeps 追加不要。

## 既知の制約 / スキップ判断
- service_worker は idle で停止するが、`chrome.alarms` 発火時に再起動するため、長時間 keep-alive 不要 (SPEC.md 準拠)。
- `chrome.action.openPopup` の利用は将来検討 (Chrome 127+ で安定。現状は user gesture 必須でスキップ)。
- Premium 機能 (通知文カスタマイズ等) は T031-T032 で扱う。本タスクは無料機能としての基本通知のみ。
