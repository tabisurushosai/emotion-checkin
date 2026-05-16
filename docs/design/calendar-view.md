# 設計: calendar-view

T028 (Phase 3 / コア機能 5/5)。T029 実装・T030 整合の基準となる契約を確定する。

本タスクは「過去の感情記録を月単位のカレンダー UI で振り返る」スコープに限定する。emoji-picker (T016-T018) は当日記録、weekly-summary (T022-T024) は今週集計、parent-share (T025-T027) は保護者送信、calendar-view (本タスク) は **過去の閲覧** を担う。記録の編集・削除は本タスクの範囲外 (将来 Premium で検討)。

## 目的
- 過去の `Entry` を月単位のカレンダーで一覧表示し、ユーザが「いつ・どんなきもちを記録したか」を視覚的に振り返れる。
- 各日付セルは「その日に最も多かった emoji glyph」+「記録件数」を表示し、件数 0 のセルは空白。
- セルをクリック (Enter/Space) すると当該日付の Entry 一覧をその場で展開 (popup を遷移させない)。
- 月間ナビゲーション (前月 / 次月) で過去月へ移動できる。
- ネットワーク・外部 API 不使用 (`chrome.storage.local` の `entries` のみ)。
- popup 1 画面に収まる縦サイズ (既存の today / weekly セクションの下に積層)。

## 制約 / 非スコープ
- **編集・削除なし**: 過去 Entry の改変は本タスクで提供しない (誤記の修正導線は将来 Premium 候補)。
- **月単位固定**: 週ビュー / 年ビュー / アジェンダビューは将来 Premium 候補 (T031-T033)。本タスクは月グリッド固定。
- **未来日付なし**: ナビゲーションは「次月」が現在月を超えないように disable。
- **複数 emoji 表示なし**: 1 セルには「最頻 emoji 1 つ」+「件数」のみ。詳細は展開時に見せる。
- **Premium ゲート (Free 制限)**: 無料は **今月 + 過去 3 ヶ月** まで遡れる。さらに過去は Premium (T031-T033) で解放。本タスクでは Free 範囲のみ実装し、Premium ゲートのフックは「3 ヶ月超で navigate 不可」を返すだけにする (実際の課金分岐は T032 で接続)。
- **タイムゾーン**: `weekStartMs` 同様、すべて記録端末のローカルタイムで日付を確定する。
- **a11y (キーボード)**: 矢印キーで日付セル間を移動できるロービング tabindex は Nice-to-have とし、最低限 Tab + Enter/Space で全セルが到達可能であれば本タスクの受け入れ条件を満たす。

## ドメイン契約

### 入力
- `getEntries(): Promise<Entry[]>` (src/storage.ts:95)。`Entry = { ts: number; emoji: EmotionKey; note?: string }`。
- 「対象月」: `{ year: number; month: number }` (month は 0..11)。popup の状態として popup.ts に保持し、初期値は現在月。
- `EMOTION_KEYS` (src/storage.ts:11) を全 byEmoji 初期化のキー揃いに利用 (キー漏れ防止)。

### 出力 (純粋関数, 新規 `src/calendar.ts`)
```ts
import type { EmotionKey, Entry } from "./storage";

export interface DayCell {
  // セルが属する暦上の日 (= year/month/day をローカルで保持)
  year: number;
  month: number;     // 0..11
  day: number;       // 1..31
  // この日がグリッドの「対象月内」かどうか (前月末/翌月頭の埋めセルは false)
  inMonth: boolean;
  // この日の Entry 件数
  count: number;
  // この日の最頻 emoji。タイは EMOTION_KEYS 順 (= happy 優先)。件数 0 のときは null。
  topEmoji: EmotionKey | null;
  // 末日 0:00 のローカル ms (DayDetail 取得用キー)
  dayStartMs: number;
}

export interface MonthGrid {
  year: number;       // 対象月の西暦
  month: number;      // 対象月 (0..11)
  // 6 行 × 7 列 = 42 セル。週頭は月曜 (WEEKDAY_KEYS と一致)。
  // 対象月の 1 日が含まれる週から、対象月の末日が含まれる週まで埋める (常に 6 行とは限らない)。
  weeks: DayCell[][];
}

export function buildMonthGrid(
  entries: Entry[],
  year: number,
  month: number, // 0..11
): MonthGrid;

// 「対象月の 1 つ前の月」「対象月の 1 つ次の月」を返す純粋ヘルパ。
export function shiftMonth(
  year: number,
  month: number,
  delta: -1 | 1,
): { year: number; month: number };

// 対象月の最遠許容月 (Free プラン: 現在から 3 ヶ月前まで)。
// 引数の now で算出を決定的に。
export function earliestAllowedMonth(
  now?: Date,
): { year: number; month: number };

// 対象月の最近許容月 (= 現在月、未来不可)。
export function latestAllowedMonth(
  now?: Date,
): { year: number; month: number };

// 指定日付の Entry 一覧 (時刻降順)。
export function entriesForDay(
  entries: Entry[],
  year: number,
  month: number,
  day: number,
): Entry[];
```

- すべて純粋関数 (引数 `now` を取れば現在時刻に依存しない)。テスト容易性を確保。
- グリッドの週頭は **月曜** (weekly-summary と統一)。`day_mon..day_sun` の i18n キーを流用。
- `weeks[*][*]` の `inMonth=false` セルも `count`/`topEmoji` を埋める (UI 側でグレーアウト表示)。

### 「最頻 emoji」のタイブレーク
- weekly-summary と同じく **`EMOTION_KEYS` の宣言順 (happy → calm → tired → sad → angry → anxious)** で最先のキーを採用。`computeWeeklyStats` の挙動と一致させる。

### Free プランの制限
- `earliestAllowedMonth(now)` は `(now の年月 - 3 ヶ月)` を返す。例: 現在月 2026-05 なら earliest = 2026-02。
- popup.ts は「prev ボタン押下時、shift 後の月 < earliest なら無視 + ボタン disable」で防御する。
- Premium 接続点は T032 で `isPremiumOrTrial()` が true なら `earliestAllowedMonth` をさらに過去 (= 制限なし) に上書き、として組み込む。本タスクでは Free 固定の earliest = -3 ヶ月。
- 実装時、`earliestAllowedMonth` は引数で `allowAll?: boolean` を取らず単一責務にし、Premium 解放は **呼び出し側** (popup.ts) で `Number.NEGATIVE_INFINITY` 相当の earliest を渡せるよう「使わない」分岐に切り替える設計とする。具体的な分岐は T032 で確定。

## i18n キー (既存 + 新規)
| key                 | ja             | en              | 備考                             |
| ------------------- | -------------- | --------------- | ------------------------------- |
| `calendar_title`    | カレンダー      | Calendar         | 既存                             |
| `calendar_prev`     | 前の月          | Previous month   | 既存                             |
| `calendar_next`     | 次の月          | Next month       | 既存                             |
| `calendar_month_label` | $YEAR$ 年 $MONTH$ 月 | $MONTH$ $YEAR$ | **新規**、placeholders $YEAR$/$MONTH$ |
| `calendar_day_detail_empty` | この日の記録はありません | No check-ins on this day | **新規**            |
| `calendar_locked`   | これより前の月は Premium で表示できます | Earlier months require Premium | **新規**, Free 制限の説明 |
| `day_mon`..`day_sun`| 月..日         | Mon..Sun         | 既存 (weekly から流用)              |
| `emoji_*` (6種)     | 既存            | 既存              |                                |
| `popup_no_records`  | まだ記録がありません | No check-ins yet | 既存                             |

- `calendar_month_label` の月表記は **ローカライズ** する。ja は `$YEAR$ 年 $MONTH$ 月` (= 2026 年 5 月)、en は `$MONTH$ $YEAR$` (= May 2026)。`$MONTH$` の値は popup.ts 側で locale に応じて月名 (ja: 「5」 / en: "May") に整形して渡す。本タスクでは **ja は数字のみ、en は英語月名 (Intl.DateTimeFormat 不使用、`["January", ...]` の固定配列で十分)**。
- `calendar_day_detail_empty` は当該日付に Entry がない (= 過去日であっても記録なし) ことを示す。
- `calendar_locked` は Free プランで earliest 月をさらに過去へ navigate しようとしたときの hint。

## UI 拡張 (popup.html / popup.ts / popup.css)

### popup.html
- 既存 `<section class="weekly">` の **直下** に `<section class="calendar" aria-labelledby="calendar-heading">` を追加する:

```html
<section class="calendar" aria-labelledby="calendar-heading">
  <header class="calendar__header">
    <button
      type="button"
      id="calendar-prev"
      class="btn btn--icon"
      data-i18n-attr="aria-label:calendar_prev,title:calendar_prev"
    >‹</button>
    <h2 id="calendar-heading" class="section-title">
      <span id="calendar-month-label"></span>
    </h2>
    <button
      type="button"
      id="calendar-next"
      class="btn btn--icon"
      data-i18n-attr="aria-label:calendar_next,title:calendar_next"
    >›</button>
  </header>

  <ul class="calendar__weekdays" aria-hidden="true">
    <li data-i18n="day_mon">月</li>
    <li data-i18n="day_tue">火</li>
    <li data-i18n="day_wed">水</li>
    <li data-i18n="day_thu">木</li>
    <li data-i18n="day_fri">金</li>
    <li data-i18n="day_sat">土</li>
    <li data-i18n="day_sun">日</li>
  </ul>

  <ul id="calendar-grid" class="calendar__grid" role="grid"></ul>

  <p
    id="calendar-locked-hint"
    class="calendar__hint"
    role="note"
    hidden
    data-i18n="calendar_locked"
  >これより前の月は Premium で表示できます</p>

  <section
    id="calendar-day-detail"
    class="calendar__detail"
    aria-live="polite"
    hidden
  >
    <h3 id="calendar-day-detail-label" class="calendar__detail-label"></h3>
    <ul id="calendar-day-list" class="calendar__detail-list"></ul>
    <p
      id="calendar-day-empty"
      class="calendar__detail-empty"
      data-i18n="calendar_day_detail_empty"
      hidden
    >この日の記録はありません</p>
  </section>
</section>
```

- グリッド `<ul id="calendar-grid">` の中身は popup.ts が `<li role="gridcell">` を 42 個 (= 6 週) または 35 個 (= 5 週) 動的生成する。`<button>` を中に入れて click/Enter/Space で展開可能にする。
- 「月ラベル」(`#calendar-month-label`) は popup.ts で `t("calendar_month_label", { year, month })` を整形して反映 (applyI18n では placeholders を解決できないため `t(key, sub)` の `chrome.i18n.getMessage(key, [year, monthName])` を使う)。

### popup.ts
- 状態: `let viewYear: number; let viewMonth: number;` を module スコープに持つ。初期値は今日のローカル年月。
- `bootstrap()` 末尾で `void refreshCalendar()` を追加。
- `refreshCalendar()`:
  - `getEntries()` → `buildMonthGrid(entries, viewYear, viewMonth)`。
  - `renderCalendar(grid)` で DOM を再構築。
  - `updateCalendarNav()` で prev/next ボタンの disabled 状態を更新。
- `renderCalendar(grid)`:
  - 月ラベルを `formatMonthLabel(viewYear, viewMonth, locale)` で組み立てる (locale は `resolveShareLocale()` を流用)。
  - グリッドの各 `DayCell` について `<li role="gridcell">` を作る:
    - `<button>` 内に: `<span class="calendar__date">日</span>`、`<span class="calendar__cell-emoji">glyph or ""</span>`、`<span class="calendar__cell-count">件数</span>`。
    - `inMonth=false` のセルは `<li class="is-outside">` でグレーアウト、`<button disabled>` でクリック不可。
    - `count=0` のセルは emoji グリフを空、件数を非表示。
    - `aria-label` に `t("calendar_day_detail_empty")` or `${year}-${month}-${day} 件数 X` を組み立て。
  - cellボタン click で `openDayDetail(year, month, day)` を呼ぶ。
- `openDayDetail(y, m, d)`:
  - `entriesForDay(entries, y, m, d)` で当日の Entry を取得。
  - `#calendar-day-detail-label` に `formatDayLabel(y, m, d, locale)` を反映。
  - `#calendar-day-list` を再構築 (時刻降順、emoji glyph + label + 時刻 + note)。
  - `#calendar-day-detail` を `hidden=false`、`scrollIntoView` で見える位置へ。
- prev/next ハンドラ:
  - prev: `shiftMonth(viewYear, viewMonth, -1)` → `earliestAllowedMonth(now)` 以前なら無視 + locked-hint 表示。範囲内なら state を更新して `refreshCalendar()`。
  - next: `shiftMonth(+1)` → `latestAllowedMonth(now)` を超えるなら無視。
- `handleSave` 成功後にも `refreshCalendar()` を呼んで即時反映 (今日のセルの件数/emoji が変わる可能性があるため)。

### popup.css
- 既存 token (背景 / 罫線 / accent / text-secondary) のみ流用。新トークン追加なし。
- `.calendar__weekdays`: 7 列 grid、center align、small font。
- `.calendar__grid`: `display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;`。
- `.calendar__cell` / `.calendar__cell button`: `aspect-ratio: 1;` でほぼ正方形、center 配置。`.is-outside` は opacity 0.4。`.is-today` は border accent。
- `.btn--icon`: 角丸の小さいボタン、`aria-label` で意味を伝える。既存 `.btn--secondary` のバリアントとして追加。
- ダークモード: 既存 `prefers-color-scheme: dark` の token 適用範囲内に収める。
- `prefers-reduced-motion`: scrollIntoView は `behavior: "instant"` 固定 (アニメ不要)。

### a11y
- `<ul role="grid">` + 各 `<li role="gridcell">`。「テーブル意味付け」を保つ。
- 各日付ボタンは `aria-label="2026年5月17日 記録3件 最頻きもち うれしい"` のように具体的に組み立てる (i18n は popup.ts で配列結合)。
- prev/next ボタンは `data-i18n-attr` で `aria-label` を翻訳。
- 詳細パネルは `aria-live="polite"` を持ち、内容変化を読み上げる。
- 矢印キー移動 (左右で前後セル、上下で前後週) は Nice-to-have、最低限 Tab + Enter/Space で全セル到達可能を必須要件とする。

## background.ts への影響
- **影響なし**。本タスクは popup のみで完結する閲覧機能。alarm / 通知は追加しない。

## 受け入れ条件 (T030 で確認)
- [ ] `src/calendar.ts` に `buildMonthGrid` / `shiftMonth` / `earliestAllowedMonth` / `latestAllowedMonth` / `entriesForDay` / `DayCell` / `MonthGrid` が export されている。
- [ ] `buildMonthGrid` は対象月の 1 日が含まれる週から末日が含まれる週まで埋め、各週 7 セル、`inMonth` フラグが正しい。
- [ ] `buildMonthGrid` のセル `topEmoji` は EMOTION_KEYS 順タイブレーク (= happy 優先)。
- [ ] `earliestAllowedMonth` は now の 3 ヶ月前を返す (Free プラン用)。
- [ ] `popup.html` に `<section class="calendar">` が存在し、`id="calendar-prev"` / `id="calendar-next"` / `id="calendar-grid"` / `id="calendar-month-label"` / `id="calendar-day-detail"` が揃っている。
- [ ] `popup.html` に `data-i18n="day_mon"`..`data-i18n="day_sun"` (weekly と別の `<ul class="calendar__weekdays">` 配下に 7 個) が存在する。
- [ ] `popup.ts` が `./calendar` を import し、`chrome.storage.local` を直接触らない (`getEntries` 経由)。
- [ ] `popup.ts` が prev/next クリックで `shiftMonth` を呼び、Free 制限 (earliest) を尊重する。
- [ ] `_locales/ja/messages.json` と `_locales/en/messages.json` の両方に `calendar_month_label` / `calendar_day_detail_empty` / `calendar_locked` が追加されている (既存の `calendar_title` / `calendar_prev` / `calendar_next` と並ぶ)。
- [ ] `npm run lint` (tsc --noEmit) が通る。
- [ ] `npm run check` に `check:calendar-view` が連結されており通過する。

### 静的整合チェッカ (T030 で `scripts/check-calendar-view.mjs` を新規作成)
- `src/calendar.ts` が存在し、`buildMonthGrid` / `shiftMonth` / `entriesForDay` / `MonthGrid` / `DayCell` を export している。
- `src/calendar.ts` が `EMOTION_KEYS` / `EmotionKey` / `Entry` を `./storage` から import している (二重定義禁止)。
- `src/calendar.ts` が `fetch(` / `XMLHttpRequest` / `chrome.identity` を使っていない (SPEC.md 外部送信なし制約のリグレッション防止)。
- `popup.html` に `id="calendar-grid"` / `id="calendar-prev"` / `id="calendar-next"` / `id="calendar-month-label"` / `id="calendar-day-detail"` / `id="calendar-day-list"` が揃っている。
- `popup.html` の `.calendar__weekdays` 配下に `data-i18n="day_mon"`..`data-i18n="day_sun"` の 7 要素が存在する (weekly の `.weekly__days` とは別の DOM ノード)。
- `popup.ts` が `./calendar` を import している (`buildMonthGrid` / `shiftMonth` / `entriesForDay` のいずれかを参照)。
- `popup.ts` が `chrome.storage.local` を直接触っていない (`getEntries`/`getSettings` 経由) — 既存規約の継続。
- ja/en `messages.json` の `calendar_title` / `calendar_prev` / `calendar_next` / `calendar_month_label` / `calendar_day_detail_empty` / `calendar_locked` が両方揃っている (リグレッション防止)。

`npm run check` に `check:calendar-view` を追加し、emoji-picker / daily-prompt / weekly-summary / parent-share と並べて毎回検証する。

## T029 実装スコープ (この設計から派生)
1. `src/calendar.ts` 新規: `DayCell` / `MonthGrid` 型 + `buildMonthGrid` / `shiftMonth` / `earliestAllowedMonth` / `latestAllowedMonth` / `entriesForDay` 純粋関数 export。
2. `_locales/ja,en/messages.json` に `calendar_month_label` (placeholders $YEAR$/$MONTH$) / `calendar_day_detail_empty` / `calendar_locked` を追加。
3. `src/popup.html` 拡張: `<section class="calendar">` ブロック追加 (weekly の直下)。
4. `src/popup.css` 拡張: `.calendar__header` / `.calendar__weekdays` / `.calendar__grid` / `.calendar__cell` / `.calendar__detail` / `.btn--icon` スタイル。
5. `src/popup.ts` 拡張: `viewYear` / `viewMonth` 状態、`refreshCalendar()` / `renderCalendar()` / `openDayDetail()` / prev/next ハンドラ追加、`bootstrap` と `handleSave` 成功後にフック。
6. `package.json` 既存 (`check:calendar-view` 追加は T030)。

## 既知の制約 / スキップ判断
- **DST**: `Date` のローカル算出に従う。境界日 (DST 切替日) のセル件数は記録時刻のローカル日付に従い、特別対応なし (SKIP: 日本対象外、英語圏ユーザは ~1 件のズレが許容範囲内)。
- **長い note の表示**: 詳細パネルの note は CSS で `white-space: pre-wrap; word-break: break-word;` にし、過剰な truncate はしない。NOTE_MAX_LENGTH = 200 で既に上限あり。
- **複数 note の集約**: 1 日に複数 Entry がある場合、詳細パネルで時刻降順に並べる。カレンダーセル上には件数のみ。
- **未来日付セル**: 翌月の頭 (`inMonth=false`) 部分は埋めセル扱い、ボタンを disable。
- **大量データ時のパフォーマンス**: Entry が数千件オーダーまでなら `buildMonthGrid` は O(N) で十分高速。それ以上を想定する場合は Premium で「年単位の集計キャッシュ」を入れる案 (T031-T033 で再評価) — 本タスクではスキップ。
- **i18n プレースホルダの月名**: `calendar_month_label` は `chrome.i18n.getMessage(key, [yearStr, monthName])` で `$YEAR$` / `$MONTH$` を解決する。月名は popup.ts 内の locale 別固定配列 (`["January", ..., "December"]` / `["1", ..., "12"]`) で十分とし、`Intl.DateTimeFormat` は使わない (バンドルサイズ / 決定性優先)。
- **Premium ゲートの実接続**: 本タスクでは `earliestAllowedMonth(now)` = 「3 ヶ月前」固定。Premium 解放時の挙動は T032 で「呼び出し側でガード解除」として実装する。本設計では分岐 API は追加しない。
