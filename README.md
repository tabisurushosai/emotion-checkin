# きもち記録 (emotion-checkin)

[日本語](#日本語) | [English](#english)

---

## 日本語

1日数回の絵文字感情記録 + 週次保護者通知に特化した Chrome 拡張機能 (Manifest V3)。
不登校児・発達特性児・その保護者、教育支援者、療育関係者、集中困難や感覚過敏を持つ大人向け。
個人情報を外部に送信せず、すべて `chrome.storage.local` 上で完結します。

### 機能一覧

| 機能 | 説明 | 区分 |
| --- | --- | --- |
| Emoji Picker | ワンクリックで現在のきもちを記録 | 無料 |
| Daily Prompt | 1日数回の記録リマインダ (chrome.alarms) | 無料 |
| Weekly Summary | 週次サマリの自動生成と通知 | 無料 |
| Parent Share | 保護者向け共有テキストの生成 | 無料 |
| Calendar View (3ヶ月) | 直近3ヶ月の履歴カレンダー | 無料 |
| Calendar View (5年) | 5年間の履歴カレンダー | Premium |
| 詳細統計 / カスタマイズ拡張 | より細かい統計表示と設定 | Premium |
| 7日無料お試し | 初回インストール時に Premium を 7 日間試用 | 体験 |

### 使用例

1. Chrome ツールバーの 「きもち記録」 アイコンをクリックして Popup を開く。
2. 絵文字を 1 つ選んでタップすると、その時点のきもちが保存されます。
3. オプションページ (拡張機能設定 → 詳細) で通知時刻と保護者共有設定を調整できます。
4. 週末に自動で週次サマリ通知が届きます (通知をクリックすると Popup が開きます)。
5. Premium 解放: Popup 内 「Premium 解放」 ボタンから Stripe Checkout (買い切り $3 USD) へ遷移。購入完了後 unlock code を入力すると永続有効。

### インストール (開発者向け)

```bash
npm install
npm run lint       # tsc --noEmit
npm run build      # dist/ 生成
npm run check      # lint + build + e2e
node scripts/package.mjs  # release/emotion-checkin.zip 生成
```

`chrome://extensions` で 「デベロッパー モード」 を有効化し 「パッケージ化されていない拡張機能を読み込む」 で `dist/` を指定します。

### プライバシーと制約

- 個人情報の収集・外部送信なし (オフライン動作前提)
- 広告・トラッキングなし
- 必要権限のみ: `storage`, `alarms`, `notifications`
- 詳細は `legal/PRIVACY.md`, `legal/TERMS.md`

---

## English

A Chrome extension (Manifest V3) for logging emotions with emojis multiple times per day and sharing weekly summaries with caregivers.
Designed for children who struggle with school attendance, neurodivergent children and their guardians, education and care professionals, and adults with focus or sensory challenges.
No personal data is transmitted externally — all state lives in `chrome.storage.local`.

### Features

| Feature | Description | Tier |
| --- | --- | --- |
| Emoji Picker | One-click mood logging | Free |
| Daily Prompt | Scheduled reminders via `chrome.alarms` | Free |
| Weekly Summary | Auto-generated weekly digest with notification | Free |
| Parent Share | Shareable text snippet for guardians | Free |
| Calendar View (3 months) | Recent history calendar | Free |
| Calendar View (5 years) | Long-range history calendar | Premium |
| Advanced stats & customization | Detailed analytics and extended settings | Premium |
| 7-day free trial | Premium features unlocked for first install | Trial |

### Usage

1. Click the "emotion-checkin" toolbar icon to open the popup.
2. Tap one of the emojis to log your current mood.
3. Open the options page (Extensions → Details → Extension options) to configure reminder times and parent-share preferences.
4. A weekly summary notification will appear automatically on weekends; clicking it opens the popup.
5. To unlock Premium, use the "Unlock Premium" button in the popup. It opens a Stripe Checkout page (one-time $3 USD purchase). Enter the unlock code after purchase to permanently enable Premium features.

### Local development

```bash
npm install
npm run lint       # tsc --noEmit
npm run build      # outputs dist/
npm run check      # lint + build + e2e
node scripts/package.mjs  # generates release/emotion-checkin.zip
```

Load `dist/` as an unpacked extension at `chrome://extensions` after enabling Developer mode.

### Privacy & constraints

- No personal data collection or external transmission (offline-first).
- No ads or trackers.
- Permissions are minimal: `storage`, `alarms`, `notifications`.
- See `legal/PRIVACY.md` and `legal/TERMS.md` for full policy.

---

## Store

Chrome Web Store (submission in progress).

## License

See the `legal/` directory.
