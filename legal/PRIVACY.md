# プライバシーポリシー / Privacy Policy

最終更新日 / Last Updated: 2026-05-23

---

## 日本語

### 1. はじめに
「きもち記録」(以下、「本拡張機能」) は、ユーザーが日々の感情を絵文字で記録し、週次でその傾向を振り返るための Chrome 拡張機能です。本拡張機能は、ユーザーのプライバシー保護を最優先に設計されています。

### 2. 収集する情報
本拡張機能の開発者は、以下の個人情報を外部サーバーへ**収集・送信しません**。
- 氏名、メールアドレス、電話番号、住所などの個人を特定できる情報
- ブラウジング履歴、検索履歴、Cookie などのトラッキング情報
- 位置情報
- デバイス識別子、広告 ID

### 3. ローカルに保存される情報
本拡張機能は、以下の情報を**ユーザーのブラウザ内 (`chrome.storage.local`) に保存**します。これらの情報は、後述のユーザー操作による例外を除き、外部サーバーには送信されません。
- 感情記録 (絵文字、タイムスタンプ、任意のメモ)
- 設定 (通知時刻、週次サマリー設定、保護者メールアドレスなど)
- インストール日時 (`installed_at`) と保存形式のバージョン (`schema_version`)
- Premium 試用期間の開始日時 (`trial_start_ts`)
- Premium 購入状態 (`premium_unlocked`)
- Premium 購入フロー開始時に生成されるランダムなインストール ID (`installation_id`)

### 4. 外部送信
本拡張機能は、通常の記録・集計処理でユーザーデータを外部サーバーに送信しません。記録・集計処理はユーザーのブラウザ内で完結します。

ただし、以下の場合に限り、ユーザー操作により外部サービスとの通信または外部アプリへの引き渡しが発生します。
- **保護者への共有時**: 週次サマリーの共有ボタンを押すと、`mailto:` URL によりユーザーの既定メールアプリを開きます。本拡張機能自体はメールを送信しません。
- **Premium 購入時**: Stripe Payment Link が設定されている場合、Stripe Checkout (`https://buy.stripe.com/`) のページに遷移します。この際、購入照合のためランダムなインストール ID (`installation_id`) と表示言語が URL パラメータとして Stripe に渡されることがあります。決済情報の取り扱いは Stripe のプライバシーポリシーに従います。本拡張機能は決済情報を保持しません。

### 5. 第三者への提供
本拡張機能は、上記のユーザー操作による外部アプリ・Stripe への引き渡しを除き、ユーザー情報を第三者に提供しません。

### 6. 広告
本拡張機能は、広告を表示しません。

### 7. 子どものプライバシー
本拡張機能は子どもの利用を想定しており、子どもからも個人情報を収集しません。米国 COPPA、EU GDPR-K、日本の関連法令に準拠した運用を行います。

### 8. データの削除
ユーザーは、Chrome の拡張機能管理画面から本拡張機能をアンインストールすることで、ローカルに保存されたすべてのデータを削除できます。また、拡張機能内の設定からデータをリセットすることも可能です。

### 9. ポリシーの変更
本ポリシーを変更する場合、本ファイル (GitHub リポジトリ上) を更新します。重要な変更がある場合は、拡張機能内で通知します。

### 10. お問い合わせ
ご質問・ご要望は、GitHub Issues (https://github.com/tabisurushosai/emotion-checkin/issues) までご連絡ください。

---

## English

### 1. Introduction
"Emotion Check-in" (hereinafter "the Extension") is a Chrome extension that allows users to record daily emotions with emoji and review weekly trends. Privacy protection is a top priority in its design.

### 2. Information We Collect
The developer of the Extension does **NOT collect or transmit** the following personally identifiable information to external servers:
- Name, email address, phone number, postal address
- Browsing history, search history, tracking cookies
- Location data
- Device identifiers, advertising IDs

### 3. Locally Stored Information
The Extension stores the following information **within the user's browser (`chrome.storage.local`)**. Except for the user-initiated cases described below, this data is not transmitted to external servers.
- Emotion records (emoji, timestamp, optional notes)
- Settings (notification times, weekly summary setting, caregiver email address)
- Install timestamp (`installed_at`) and storage schema version (`schema_version`)
- Premium trial start timestamp (`trial_start_ts`)
- Premium purchase state (`premium_unlocked`)
- Random installation ID generated when starting the Premium purchase flow (`installation_id`)

### 4. External Transmission
The Extension does not transmit user data to external servers during normal logging or summary processing. Logging and summary processing are completed within the user's browser.

The following user-initiated cases involve external service communication or handing data to an external app:
- **Sharing with a caregiver**: Pressing the weekly summary share button opens the user's default email app via a `mailto:` URL. The Extension itself does not send email.
- **Premium Purchase**: If a Stripe Payment Link is configured, users are redirected to Stripe Checkout (`https://buy.stripe.com/`). A random installation ID (`installation_id`) and UI locale may be passed to Stripe as URL parameters for purchase reconciliation. Payment information is handled according to Stripe's privacy policy. The Extension does not retain payment information.

### 5. Third-Party Sharing
The Extension does not share user information with third parties except for the user-initiated handoff to an external email app or Stripe described above.

### 6. Advertising
The Extension does not display advertisements.

### 7. Children's Privacy
The Extension is designed with children in mind and does not collect personal information from children. It is operated in compliance with COPPA (US), GDPR-K (EU), and relevant Japanese laws.

### 8. Data Deletion
Users can delete all locally stored data by uninstalling the Extension via Chrome's extension management page. Data can also be reset from within the Extension's settings.

### 9. Policy Changes
If this policy changes, this file (on the GitHub repository) will be updated. Significant changes will be notified within the Extension.

### 10. Contact
For questions or requests, please contact us via GitHub Issues (https://github.com/tabisurushosai/emotion-checkin/issues).
