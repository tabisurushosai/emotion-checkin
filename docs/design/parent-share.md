# 設計: parent-share

T025 (Phase 3 / コア機能 4/5)。T026 実装・T027 整合の基準となる契約を確定する。

本タスクは「今週の感情記録サマリーを保護者に共有するための導線」を扱う。**個人情報非収集 / 外部送信なし**の SPEC.md 制約を守るため、拡張機能自身は何も送信せず、ユーザの既定メールクライアントを起動する `mailto:` 方式に限定する。Stripe や任意 SMTP サーバ連携は本タスクの範囲外。

## 目的
- 保護者 (家族・支援者) に「今週のきもち」サマリーを 1 タップで共有できる UX を提供する。
- 共有手段は `mailto:` URL のみ (= ユーザ端末のメールアプリが本人として送信)。拡張機能はネットワークを使わない。
- 共有内容は `computeWeeklyStats` (T023) の戻り値から決定的に生成する純粋関数で組み立て、テスト容易性と i18n 両立を確保。
- 週次 alarm (`weekly-summary` / background.ts:101) と連動して「日曜 9:00 に "共有しますか?" のリマインド通知」を出す。送信自体は手動。

## 制約 / 非スコープ
- **外部送信なし**: `fetch` / `XMLHttpRequest` / `chrome.identity` 一切使わない。`mailto:` のみ。
- **個人情報非収集**: 子供本人の `note` 本文は本文に含めない (緊急時の保護を優先しつつ、家族間で語られたコメントは別チャネルで扱う想定)。emoji 集計値のみ送る。
- **Premium ゲートなし**: 保護者共有は無料基本機能 (SPEC.md「コア機能」)。月次 / 期間指定共有は Premium (T031-T033) で扱う。
- **CC / BCC 複数宛先なし**: 単一の `parent_email` のみ。複数宛先は将来の Premium 機能候補。
- **HTML メール / 添付ファイルなし**: `mailto:` のプレーンテキスト本文のみ。`Content-Type` を立てる手段がない & スパムフィルタ回避のため。
- **calendar-view (T028-T030) との重複なし**: 過去週の遡及共有は calendar-view の責務。本タスクは「今週」1 回分のみ。

## ドメイン契約

### 入力
- `WeeklyStats` (src/weekly.ts:24, T023 で確定)。`total / byEmoji / byDay / topEmotion / weekStart` を持つ。
- `Settings.parent_email` (src/storage.ts:29)。空文字列の場合は共有不可。
- `Settings.weekly_summary_enabled` (src/storage.ts:30)。OFF のとき alarm 由来の通知を出さない。popup の手動ボタンは常時表示するが `parent_email` 空のときは無効化。

### 出力 (純粋関数)
```ts
// src/parentShare.ts (新規)
export interface ShareMail {
  to: string;           // parent_email
  subject: string;      // i18n 'parent_share_subject' + 週頭 YYYY-MM-DD
  body: string;         // プレーンテキスト本文 (改行は LF)
  mailtoUrl: string;    // mailto:to?subject=...&body=... (encodeURIComponent 済)
}

export function buildShareMail(
  stats: WeeklyStats,
  parentEmail: string,
  locale?: "ja" | "en",  // 省略時は chrome.i18n.getUILanguage 判定 (popup 側で解決)
): ShareMail;

export function formatWeekStartDate(weekStartMs: number): string; // 'YYYY-MM-DD' (local)
```

- `buildShareMail` は `chrome.i18n` を直接呼ばず、引数化された `t(key)` 結果を内部で組み立てる構造にする (テスト容易性)。実装上は popup から `t` (src/i18n.ts) で取得して渡すか、`parentShare.ts` 内に locale → labels マップを持つ。**実装では後者** (popup と分離し、純粋関数化を維持) を採用する。
- `formatWeekStartDate` は `new Date(weekStartMs)` のローカル年月日を `YYYY-MM-DD` で返す (UTC 変換しない)。

### 本文テンプレ (例: ja)
```
今週のきもち記録 (2026-05-11〜2026-05-17)

記録回数: 17 回
一番多いきもち: 😊 うれしい (6 回)

曜日別:
  月 3 回
  火 2 回
  水 4 回
  木 1 回
  金 3 回
  土 2 回
  日 2 回

きもち別:
  😊 うれしい  6
  😌 おだやか  4
  😪 つかれた  3
  😢 かなしい  2
  😠 いらいら  1
  😰 ふあん    1

— きもち記録 (Chrome 拡張) より
```

- 行頭にインデントなし or 半角スペース 2 個。`mailto:` の URL エンコード後でも視認性が落ちないよう、装飾文字 (━ など) は使わない。
- 末尾に固定のフッタを置き、自動送信ではなくユーザ操作で送られたものであることを暗黙に示す。
- emoji グリフは `EMOJI_GLYPH` (src/emoji.ts) を流用、ラベルは `EMOJI_LABEL_KEY` 経由で `t(key)` 解決。

### mailto: URL 仕様
- 形式: `mailto:<to>?subject=<encoded>&body=<encoded>`。
- エンコードは `encodeURIComponent`。改行は LF (`%0A`)。
- `to` が空文字のときは `mailtoUrl` を空文字で返し、呼び出し側 (popup) はボタンを無効化する。
- 本文長: 一部メーラ (古い IE / 一部 iOS) で 2000 文字程度の制限あり。`computeWeeklyStats` 由来の本文は数百バイト程度で収まる想定 → 切り詰め処理は実装しない (SKIP 判断: T027 で再評価)。

## i18n キー (新規追加が必要)
| key                           | ja                                   | en                                  |
| ----------------------------- | ------------------------------------ | ----------------------------------- |
| `parent_share_button`         | 保護者に共有                          | Share with parent                   |
| `parent_share_subject`        | 今週のきもち記録 ($1$)                 | Weekly check-in summary ($1$)       |
| `parent_share_body_intro`     | 今週のきもち記録 ($1$〜$2$)            | Weekly check-ins ($1$ — $2$)        |
| `parent_share_body_total`     | 記録回数                              | Check-ins                           |
| `parent_share_body_top`       | 一番多いきもち                        | Most frequent mood                  |
| `parent_share_body_by_day`    | 曜日別                                | By day                              |
| `parent_share_body_by_emoji`  | きもち別                              | By mood                             |
| `parent_share_body_footer`    | — きもち記録 (Chrome 拡張) より        | — From Mood Check-in (Chrome ext.)  |
| `parent_share_no_email`       | 保護者のメールアドレスを設定で入力してください | Set the parent's email in Options |
| `parent_share_disabled_hint`  | 週次サマリー通知は設定でオンにできます  | Enable weekly summary in Options    |
| `notif_weekly_title`          | 今週のサマリーを共有しよう              | Share this week's summary           |
| `notif_weekly_body`           | popup を開いて保護者に送れます          | Open popup to send to your parent   |

- `parent_share_subject` / `parent_share_body_intro` は `placeholders` で `$1` / `$2` を持つ (週頭 / 週末日付)。
- `parent_share_body_total` / `_top` は既存の `weekly_total` / `weekly_top_emotion` と意味が重複するが、メール本文では「テキスト一体化」のため別キーにする (UI 側と独立にチューニング可)。**ただし重複コスト判断としては既存キー流用も可** — T026 実装時に最終確定。本設計では明確性を優先して別キーを採る。

## UI 拡張 (popup.html / popup.ts / popup.css)

### popup.html
- 既存 `<section class="weekly">` (popup.html:151) の最後に共有 CTA を追加する:
```html
<div class="weekly__share">
  <button
    type="button"
    id="share-parent-btn"
    class="btn btn--secondary"
    data-i18n="parent_share_button"
    disabled
  >
    保護者に共有
  </button>
  <p
    id="share-parent-hint"
    class="weekly__share-hint"
    role="note"
    hidden
  ></p>
</div>
```
- 別 `<section>` には**しない**: weekly-summary とセマンティック的に結合しており、`aria-labelledby="weekly-heading"` の文脈下で扱える。

### popup.ts
- 起動時 (bootstrap) / `refreshWeekly` 成功後に `refreshShareButton()` を呼ぶ:
  - `getSettings()` → `parent_email` 空ならボタン `disabled = true`、hint に `t("parent_share_no_email")` を表示。
  - `parent_email` あり & `stats.total === 0` のときも `disabled = true` (送る記録なし) → hint は `popup_no_records` 流用。
  - 上記以外は `disabled = false`、hint hidden。
- クリック時:
  - `buildShareMail(stats, parent_email, locale)` を呼ぶ。
  - `window.location.href = mailtoUrl` (popup ウィンドウからメーラを起動)。
    - 注: popup ウィンドウは閉じても OS のメーラは独立して起動する。
    - 万一失敗した場合は `setStatus(t("error_generic"))`。
- `chrome.tabs` 権限は使わない (manifest 拡張不要)。

### popup.css
- 既存 `.weekly__row` のすぐ下に `.weekly__share` を追加。`.weekly__share-hint` は警告色ではなく secondary なメッセージ色 (既存 token 流用)。

## background.ts 拡張 (parent-share alarm)
- `ensureWeeklyAlarm` (background.ts:101) は既に存在し、placeholder のまま。本タスクで以下を有効化:
  - `chrome.alarms.onAlarm` の `WEEKLY_ALARM_NAME` 分岐 (background.ts:161) で `showWeeklyShareNotification()` を呼ぶ。
  - `showWeeklyShareNotification()`:
    - `getSettings()` を読み、`weekly_summary_enabled === false` または `parent_email === ""` のときは何もしない。
    - `getEntries()` → `computeWeeklyStats` → `total === 0` のときも何もしない (静かに skip)。
    - 上記いずれでもないとき、`chrome.notifications.create` で `notif_weekly_title` / `notif_weekly_body` を表示 (silent:true / requireInteraction:false)。
    - 通知 ID プレフィックス: `WEEKLY_NOTIFICATION_PREFIX = "weekly-share-"`。
- `chrome.notifications.onClicked` で `WEEKLY_NOTIFICATION_PREFIX` を受けたら popup を開く代替として、`chrome.action.openPopup()` (Manifest V3) を試す。**ただし V3 で `openPopup` は限定的にしか動かない**ため、フォールバックとして `chrome.runtime.openOptionsPage()` ではなく **無動作 + 通知クリア** とし、ユーザが手動で popup を開く前提とする (SKIP 判断: 確実な popup 起動 API がない)。
- `chrome.storage.onChanged` の settings 変更時 (background.ts:166) は `syncDailyAlarms` だけでなく `ensureWeeklyAlarm` も呼ぶ (weekly OFF→ON 切替を即時反映)。実際には `ensureWeeklyAlarm` は重複呼出に対し冪等 (`chrome.alarms.get` で既存判定)。
- alarm 発火タイミング: `nextWeeklyAnchor(0, 9)` (= 日曜 9:00 ローカル)。これは現在の実装と一致しており変更不要。

## 受け入れ条件 (T027 で確認)
- [ ] `src/parentShare.ts` に `buildShareMail` / `formatWeekStartDate` / `ShareMail` 型が公開されている。
- [ ] `buildShareMail` は `parentEmail === ""` のとき `mailtoUrl === ""` を返し、subject/body は通常通り組み立てる (テスト用)。
- [ ] `buildShareMail` の `mailtoUrl` は `mailto:` で始まり、`subject` と `body` が `encodeURIComponent` 済である。
- [ ] `popup.html` に `id="share-parent-btn"` の `<button data-i18n="parent_share_button">` がある。
- [ ] `popup.ts` がクリック時 `buildShareMail` を呼び、`chrome.storage.local` を直接触らず `getSettings`/`getEntries` 経由でデータを得る。
- [ ] `background.ts` の `WEEKLY_ALARM_NAME` 分岐で `chrome.notifications.create` が `notif_weekly_title`/`notif_weekly_body` を発火する (空 email / 空 entries / weekly OFF はスキップ)。
- [ ] `_locales/ja/messages.json` と `_locales/en/messages.json` の両方に `parent_share_button` / `parent_share_subject` / `parent_share_body_*` (intro/total/top/by_day/by_emoji/footer) / `parent_share_no_email` / `notif_weekly_title` / `notif_weekly_body` が揃っている。
- [ ] `npm run lint` (tsc --noEmit) が通る。
- [ ] `npm run check` に `check:parent-share` が連結されており通過する。

### 静的整合チェッカ (T027 で `scripts/check-parent-share.mjs` を新規作成)
- `src/parentShare.ts` が存在し、`buildShareMail` / `formatWeekStartDate` を export している。
- `src/parentShare.ts` が `EMOTION_KEYS` / `Entry` 型を `./storage` から、`WeeklyStats` / `WEEKDAY_KEYS` を `./weekly` から import している (二重定義禁止)。
- `src/parentShare.ts` 内に `mailto:` リテラルが存在し、`encodeURIComponent(` も使われている (生 `<` `>` 等の混入禁止)。
- `src/parentShare.ts` が `fetch(` / `XMLHttpRequest` / `chrome.identity` / `XHR` を一切使っていない (SPEC.md 外部送信なし制約のリグレッション防止)。
- `popup.html` に `id="share-parent-btn"` と `data-i18n="parent_share_button"` が揃っている。
- `popup.ts` が `./parentShare` を import している。
- `background.ts` が `WEEKLY_NOTIFICATION_PREFIX` を定義し、`WEEKLY_ALARM_NAME` 分岐で `chrome.notifications.create` を呼んでいる。
- ja/en `messages.json` の `parent_share_*` / `notif_weekly_*` キーが両方揃っている (リグレッション防止)。

`npm run check` に `check:parent-share` を追加し、emoji-picker / daily-prompt / weekly-summary と並べて毎回検証する。

## T026 実装スコープ (この設計から派生)
1. `src/parentShare.ts` 新規: `ShareMail` 型 / `buildShareMail` / `formatWeekStartDate` 純粋関数 + locale → labels マップ。
2. `_locales/ja,en/messages.json` に `parent_share_*` (8 キー) と `notif_weekly_*` (2 キー) 追加。
3. `src/popup.html` 拡張: `.weekly__share` ブロック追加 (`<button id="share-parent-btn">` + hint)。
4. `src/popup.ts` 拡張: `refreshShareButton()` / `handleShareClick()` 追加、`refreshWeekly` 成功後にフック。
5. `src/popup.css` 拡張: `.weekly__share` / `.weekly__share-hint` スタイル。
6. `src/background.ts` 拡張: `WEEKLY_NOTIFICATION_PREFIX` 定義、`showWeeklyShareNotification()` 実装、`onAlarm` 分岐から呼出、`onClicked` で通知クリア、`chrome.storage.onChanged` で `ensureWeeklyAlarm` も再実行。
7. `package.json` 既存 (`check:parent-share` 追加は T027)。

## 既知の制約 / スキップ判断
- **mailto: の本文上限**: 古いメーラで切れる可能性あり。SKIP: T027 で要観察、必要なら本文を簡略化する。
- **`chrome.action.openPopup` 不安定**: 通知クリックから popup を確実に開く API は V3 に存在しない (ユーザジェスチャ要件)。SKIP: 通知タップでは何もしない (`notifications.clear` のみ)。ユーザは手動で popup を開く前提。
- **複数宛先 / CC / BCC**: 単一 `parent_email` のみ。複数宛先 (祖父母など) は将来 Premium 候補。
- **過去週の遡及共有**: calendar-view (T028-T030) で扱う。本タスクは「今週」固定。
- **note 本文の同梱**: emoji 集計のみ送信し、本文 (note) は送らない。子供本人のセンシティブなコメントを保護者へ無断送信しないための保護策。Premium で「note 同梱オプション」を提供する案あり (T031-T033 で検討)。
- **DST / タイムゾーン**: `weekStartMs` (T023) のローカル算出に従う。共有相手のタイムゾーンが異なる場合、件名/本文の `YYYY-MM-DD` は記録端末のローカル日付。Markdown/UTC 注記は付けない (シンプル優先)。
