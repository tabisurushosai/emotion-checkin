# 設計: emoji-picker

T016 (Phase 3 / コア機能 1/5)。T017 実装・T018 整合の基準となる契約を確定する。

## 目的
- 6種の感情から 1 つを選択し、任意のメモを添えて `Entry` を `chrome.storage.local` に追記する。
- popup を開いた時点で「今すぐ・1タップ近く」で記録完了できる UX を保つ。
- a11y/i18n/ライト・ダーク・キーボード操作を全て満たす。

## ドメイン契約 (storage.ts と一致)
- `EmotionKey`: `"happy" | "calm" | "tired" | "sad" | "angry" | "anxious"` (固定 6種、順序固定)。
- `Entry`: `{ ts: number; emoji: EmotionKey; note?: string }`。
  - `ts` は `Date.now()` (UTC ms)。
  - `note` は trim 後 `NOTE_MAX_LENGTH = 200` で truncate、空なら省略。
- 追記は必ず `storage.ts` の `addEntry()` 経由。popup から `chrome.storage.local` を直接書かない (T017 でリファクタ対象)。

## 絵文字テーブル (UI ↔ key の単一ソース)
| key       | glyph | i18n key       |
| --------- | ----- | -------------- |
| happy     | 😊    | `emoji_happy`   |
| calm      | 😌    | `emoji_calm`    |
| tired     | 😪    | `emoji_tired`   |
| sad       | 😢    | `emoji_sad`     |
| angry     | 😠    | `emoji_angry`   |
| anxious   | 😰    | `emoji_anxious` |

- glyph・label は popup.ts 内のテーブルを唯一の真実とし、HTML 側の `<span class="emoji-btn__icon">` はビルド時固定値で OK。
- 将来 emotion 追加時は `EMOTION_KEYS` (storage.ts) を拡張し、glyph テーブル / messages.json / popup.html を 3点同時更新する。

## インタラクション仕様
1. 初期状態: どの emoji も未選択 (`aria-checked="false"`)、`保存` ボタン disabled。
2. emoji ボタン click / Space / Enter で選択 → 該当 1つを `aria-checked="true"` + `.is-selected`、他は false。
3. 再選択 (同じ emoji を再 click) は no-op (UI 変化なし)。別 emoji を選ぶと上書き。
4. 選択後は `保存` ボタン enable。ステータステキストはクリア。
5. メモは任意。空白のみ・空文字は保存しない (note フィールド省略)。`maxlength=200` を HTML 側でも担保。
6. 保存中: `保存` ボタンを一旦 disable。完了後 `popup_saved` を `role=status / aria-live=polite` に表示し、2秒後に消える (`SAVED_STATUS_RESET_MS`)。
7. 保存成功時: フォームリセット (選択解除・メモクリア・保存 disable) → 今日の記録を再描画。
8. 保存失敗時: `error_save` を表示、保存ボタンを再 enable、ユーザが再試行可能。

## a11y
- `role="radiogroup"` + 各ボタン `role="radio"` + `aria-checked`。
- ラベル文字列は i18n 経由 (`data-i18n-attr="aria-label:emoji_*,title:emoji_*"`)。
- focus-visible スタイルは popup.css で実装済 (T012)。
- `prefers-reduced-motion` 対応も同 CSS で済 (アニメ最小)。
- 注: 現状の radio 実装は「click のみ」。矢印キーロービング (左右で選択移動) は T017 で追加検討するが、最低限 Tab + Space/Enter で全 emoji が操作可能であれば AA を満たすため、矢印キーは Nice-to-have とする。

## i18n
- glyph 自体は文字化けしない Unicode のため、言語に依存しない。
- ラベル文字列は `_locales/{ja,en}/messages.json` の `emoji_*` キーを参照。`applyI18n(document)` が bootstrap で適用する。

## 描画パス
1. `DOMContentLoaded` → `bootstrap()` → `applyI18n` → `bindEmojiPicker()` + `bindActions()` + `refreshToday()`。
2. `refreshToday()`: `getEntries()` → 当日 0:00 (ローカル時刻) 以降を新しい順に並べる → `renderToday()` で li 再構築。
3. `handleSave()`: `addEntry()` → `setStatus(popup_saved)` → `resetForm()` → `refreshToday()`。

## 受け入れ条件 (T018 で確認)
- [ ] 6種すべてが click / Space / Enter で選択可能、`aria-checked` が排他的に true になる。
- [ ] 未選択時は保存 disabled。選択後は enable。
- [ ] 保存後、`chrome.storage.local.entries` に `Entry` が追記されている。
- [ ] 保存後、今日の記録に最新が最上段で表示され、メモがあれば本文も出る。
- [ ] 失敗時に `error_save` が表示され、ボタンが再 enable される。
- [ ] ja / en どちらの locale でもラベルが切り替わる。
- [ ] light / dark どちらのテーマでもコントラストが取れている。

## T017 で行うリファクタ予定
- popup.ts の `loadEntries / saveEntry` をローカル定義から削除し、`storage.ts` の `getEntries / addEntry` に置換 (二重実装解消)。
- emoji glyph / label テーブルを `src/emoji.ts` (新規) に抽出し、popup と将来の calendar-view / weekly-summary から再利用できるようにする。
- 矢印キーロービング (radiogroup の標準挙動) を追加する場合はこのタイミング。
