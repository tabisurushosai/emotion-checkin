# 設計: weekly-summary

T022 (Phase 3 / コア機能 3/5)。T023 実装・T024 整合の基準となる契約を確定する。

本タスクは「今週の感情記録を集計し、popup 上で 1 ブロックの可視化を提供する」スコープに限定する。保護者へ送る共有導線は parent-share (T025-T027) で扱い、本タスクは **集計・描画・i18n** のみを担う。

## 目的
- 直近 7 日 (= 今週) の `Entry` を集計し、`合計回数 / 最頻 emoji / emoji 別件数 / 曜日別件数` をユーザに 1 画面で見せる。
- popup を開いた時点で「今日 + 今週」が同時に分かる UX を保つ。
- ネットワーク・外部 API 不使用 (`chrome.storage.local` の `entries` のみが入力)。
- 親共有メール / Stripe / 通知文カスタマイズ等は本タスクの範囲外。

## ドメイン契約 (storage.ts と一致)
- 入力: `getEntries(): Promise<Entry[]>` (storage.ts:95)。`Entry = { ts: number; emoji: EmotionKey; note?: string }`。
- 「今週」の定義: **月曜 00:00 (ローカルタイム) から、現在時刻まで**。
  - ISO 8601 / 教育現場で一般的な「月曜始まり」を採用 (`day_mon` が messages.json 上の最初の曜日キーであることとも一致)。
  - 算出: `const day = (now.getDay() + 6) % 7;` で 月=0..日=6 へ変換し、`now - day` の 0:00 を週頭とする。
  - 曜日表示順は `[mon, tue, wed, thu, fri, sat, sun]` 固定。
- 「最頻 emoji」: emoji 別件数を降順ソートし、最大件数を持つキー。タイの場合は `EMOTION_KEYS` (storage.ts:11) の宣言順で最先のもの (= happy が優先される) を採用し、決定的に。
- 全件数 0 のときは「最頻 emoji」を表示しない (`null` を返す)。

## 集計関数 (新規 `src/weekly.ts`)
```ts
export interface WeeklyStats {
  weekStart: number;          // 月曜 00:00 のローカルタイム ms
  total: number;              // 今週の Entry 件数
  byEmoji: Record<EmotionKey, number>;  // 各感情の件数 (0 を含む)
  byDay: Record<WeekdayKey, number>;     // 各曜日の件数 (0 を含む)
  topEmotion: EmotionKey | null;         // 最頻 emoji (タイは EMOTION_KEYS 順)
}

export type WeekdayKey =
  | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAY_KEYS: readonly WeekdayKey[] = [
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
] as const;

export function weekStartMs(now?: Date): number;
export function computeWeeklyStats(entries: Entry[], now?: Date): WeeklyStats;
```

- `weekStartMs` と `computeWeeklyStats` は **純粋関数** (引数 `now` を受け取れば現在時刻に依存しない) としてテスト容易性を確保。
- `EMOTION_KEYS` を import して `byEmoji` の初期化に使う (キー漏れ防止)。

## i18n キー (既存・追加不要)
| key                  | ja             | en                  |
| -------------------- | -------------- | ------------------- |
| `weekly_title`       | 今週のきもち   | This week's mood    |
| `weekly_total`       | 記録回数       | Check-ins           |
| `weekly_top_emotion` | 一番多いきもち | Most frequent mood  |
| `day_mon` … `day_sun`| 月 … 日        | Mon … Sun           |
| `emoji_*` (6種)      | 既存           | 既存                 |
| `popup_no_records`   | まだ記録がありません | No check-ins yet |

**本タスクでは新規 i18n キーを追加しない。** 既存キーで成立する範囲に UI を寄せる。

## popup UI 拡張 (T023 実装スコープ)
- `popup.html` の `<section class="today">` の下に `<section class="weekly" aria-labelledby="weekly-heading">` を追加。
  - 見出し `<h2 id="weekly-heading" data-i18n="weekly_title">今週のきもち</h2>`
  - サマリ行: `weekly_total`: 件数、`weekly_top_emotion`: glyph + label (件数 0 のときは非表示)。
  - 曜日別バー: `<ul class="weekly__days">` で 7 個の `<li>` を生成。各 `<li>` は
    - 曜日ラベル `day_mon..day_sun`
    - 件数 (数字)
    - 視覚バー `<div class="weekly__bar" style="--ratio: 0.6">` (件数 / 最大件数 × 100% を CSS var で渡す)
- 件数 0 のときは `<p class="weekly__empty" data-i18n="popup_no_records">` を表示し、リストは隠す。
- `popup.css` に対応スタイル追加 (`.weekly`, `.weekly__days`, `.weekly__bar` 等)。
  - 既存の `.today` を踏襲したカードレイアウト。
  - prefers-reduced-motion: バー描画にトランジションを使う場合は media query でオフ。
  - dark mode: 既存の color tokens を流用 (新トークン追加しない)。

## a11y
- `.weekly` セクションは `aria-labelledby="weekly-heading"` で見出しと関連付け。
- 各曜日バーは装飾。スクリーンリーダ用には `<li>` に「曜日 X 件」とテキスト併記し、`<div class="weekly__bar" aria-hidden="true">` でバーを隠す。
- 件数 0 の状態でも「今週のきもち」見出しは表示 (空状態であることが伝わる)。

## 描画パス (popup.ts 拡張)
1. `bootstrap()` 内で `bindWeeklyRefresh()` を追加し、`refreshWeekly()` を呼ぶ。
2. `refreshWeekly()`:
   - `getEntries()` (storage.ts) → `computeWeeklyStats(entries)`。
   - `renderWeekly(stats)` で DOM を再構築。
3. `handleSave()` 成功後に `refreshToday()` と一緒に `refreshWeekly()` も呼んで即座反映。

## 制約 / 非スコープ
- **今週限定**: 過去週の閲覧は calendar-view (T028-T030) で扱う。本タスクは「今週」1 ブロックのみ。
- **保護者送信**: parent-share (T025-T027) で `mailto:` または Stripe 連携扱い (詳細は当該タスクで設計)。本タスクでは送信ボタン・メール文面を作らない。
- **Premium ゲート**: 曜日別の細かい統計は無料機能としてリリースしつつ、Premium 拡張 (月次 / 期間指定) は T031-T032 で扱う。本タスクは無料機能のみ。
- **chrome.alarms**: weekly-summary 自体は alarm 不要 (popup を開いた瞬間に集計する live 表示)。background.ts:101 の `ensureWeeklyAlarm` (`weekly-summary` alarm) は parent-share の発火タイミング用として **本タスクでは触らない**。

## 受け入れ条件 (T024 で確認)
- [ ] `src/weekly.ts` に `WeeklyStats` / `WEEKDAY_KEYS` / `computeWeeklyStats` / `weekStartMs` が公開されている。
- [ ] `computeWeeklyStats` は EMOTION_KEYS の全キーで `byEmoji` を初期化する (0 を含む)。
- [ ] `computeWeeklyStats` は WEEKDAY_KEYS の全キーで `byDay` を初期化する (0 を含む)。
- [ ] `popup.html` に `<section class="weekly">` が存在し、`weekly_title` / `weekly_total` / `weekly_top_emotion` の i18n 属性が揃っている。
- [ ] `popup.html` の曜日ラベルは `day_mon..day_sun` (`data-i18n="day_mon"` 等) を参照している。
- [ ] `popup.ts` が `chrome.storage.local` を直接触らず、`storage.ts` (`getEntries`) と `weekly.ts` (`computeWeeklyStats`) 経由で集計する。
- [ ] 件数 0 のときに `popup_no_records` が表示され、最頻 emoji 行が非表示になる。
- [ ] ja / en どちらの locale でも `weekly_*` / `day_*` の文字列が切り替わる (既存キーのみで成立)。
- [ ] `npm run lint` (tsc --noEmit) が通る。

### 静的整合チェッカ (T024 で `scripts/check-weekly-summary.mjs` を新規作成)
- `src/weekly.ts` が存在し、`WEEKDAY_KEYS` の 7 要素 (mon..sun) を export している。
- `src/weekly.ts` の `EMOTION_KEYS` import が `./storage` 経由 (二重定義禁止)。
- `popup.html` に `data-i18n="weekly_title"` / `data-i18n="weekly_total"` / `data-i18n="weekly_top_emotion"` が存在。
- `popup.html` に `data-i18n="day_mon"` … `data-i18n="day_sun"` が 7 個揃っている。
- ja/en `messages.json` の `weekly_title` / `weekly_total` / `weekly_top_emotion` / `day_mon..day_sun` が両方揃っている (リグレッション防止)。
- `popup.ts` が `weekly.ts` を import しており、`chrome.storage.local` を直接触っていない (既存規約の継続)。

`npm run check` に `check:weekly-summary` を追加し、emoji-picker / daily-prompt と並べて毎回検証する。

## T023 実装スコープ (この設計から派生)
1. `src/weekly.ts` 新規: `WEEKDAY_KEYS` / `weekStartMs` / `computeWeeklyStats` / 型定義。
2. `src/popup.html` 拡張: `<section class="weekly">` ブロック追加 (今日の記録の直下)。
3. `src/popup.css` 拡張: `.weekly` / `.weekly__days` / `.weekly__bar` のスタイル。
4. `src/popup.ts` 拡張: `refreshWeekly()` + `renderWeekly()` + `handleSave` 成功後の呼出フック。
5. `package.json` 既存 (`check:weekly-summary` 追加は T024)。

## 既知の制約 / スキップ判断
- 曜日バーの「最大件数」: 全件 0 の場合は `Math.max(...byDay) || 1` で 0 除算回避し、全バー幅 0% に。
- DST (夏時間) の境界: 日本は対象外。英語圏ユーザでも `Date` のローカル算出が DST を吸収するため特別対応なし。
- 過去 7 日 / 月曜起点切り替えは将来 Premium 機能としてオプション化候補。本タスクでは月曜起点固定。
