import type { Messages } from "../zh-TW/types";

export const account = {
  "YOUR ACCOUNT, YOUR CHOICE": "アカウントも選択も、あなたのもの",
  "Account & privacy.": "アカウントとプライバシー。",
  "Invitation-only sign-in, explicit analysis consent and a clear view of your weekly limits.":
    "招待制ログイン、目的別の分析同意、週の利用枠を確認できます。",
  "You're exploring the local demo.": "ブラウザー内のデモを利用中です。",
  "This static demo does not connect to an identity service. Your workspace remains in this browser.":
    "この静的デモは認証サービスに接続していません。データはこのブラウザーに保持されます。",
  "Email sign-in and account controls are available in configured server deployments. See the repository's identity setup guide to run them locally.":
    "メールログインとアカウント管理は、設定済みのサーバー環境で利用できます。ローカル起動はリポジトリーの認証設定ガイドをご覧ください。",
  "Identity setup guide": "認証設定ガイド",
  "Sign-in protects your private career data. Browser-local demo data is imported only through an explicit reviewed action; signing in does not upload or merge it.":
    "ログインで非公開のキャリアデータを保護します。デモデータは確認と承認を経てインポートされ、ログインだけでは送信や統合されません。",
  "Loading your account…": "アカウントを読み込み中…",
  "Unable to load your account.": "アカウントを読み込めません。",
  "The request could not be completed.": "リクエストを完了できませんでした。",
  "Sign in with an invitation.": "招待を使ってログイン。",
  "Use your invited email address. Enter the code from your email to continue.":
    "招待されたメールアドレスを使い、メールのコードを入力してください。",
  "Email address": "メールアドレス",
  "Request another code": "コードを再送する",
  "Send sign-in code": "ログインコードを送信",
  "Sign-in code": "ログインコード",
  "Verify and sign in": "確認してログイン",
  "You are signed in.": "ログインしました。",
  "Signed in as a {role}": "{role}としてログイン中",
  admin: "管理者",
  member: "メンバー",
  "Account {id} · verified server session": "アカウント {id}・サーバーで検証済みのセッション",
  "Sign out": "ログアウト",
  "You have signed out of this device.": "この端末からログアウトしました。",
  "Analysis permissions": "分析の許可",
  "Choose separately for each purpose. Revoking permission cancels queued work and prevents an in-progress result from being published. This page does not run an AI analysis.":
    "目的ごとに選択してください。許可を取り消すと待機中の処理が中止され、実行中の結果も公開されません。このページではAI分析は実行しません。",
  "Permission granted": "許可済み",
  "No current permission": "現在の許可なし",
  "Assessment analysis": "スキル評価の分析",
  "Resume analysis": "履歴書の分析",
  "Policy version {version}": "ポリシーバージョン {version}",
  "Revoke permission": "許可を取り消す",
  "I agree to this policy": "このポリシーに同意する",
  "Permission revoked. A provider call already in progress cannot be recalled, but its result cannot be published after revocation.":
    "許可を取り消しました。実行済みのプロバイダー呼び出しは取り消せませんが、以後その結果は公開されません。",
  "Your permission has been recorded for this policy version.":
    "このポリシーバージョンへの同意を記録しました。",
  "Weekly analysis allowance": "週の分析利用枠",
  "assessment analysis": "スキル評価の分析",
  "resume analysis": "履歴書の分析",
  "Semantic role ranking": "意味に基づく求人順位付け",
  "semantic ranking": "意味に基づく順位付け",
  "/ {limit} remaining": "/ {limit}回 残り",
  "{reserved} reserved · {consumed} consumed": "{reserved}回予約済み・{consumed}回使用済み",
  "Resets Monday 00:00 UTC": "月曜日00:00 UTCにリセット",
  "Your account data export": "アカウントデータのエクスポート",
  "Download your account data": "アカウントデータをダウンロード",
  "Create a private ZIP with your retained career records, resume source files and generated PDFs. It is available for 24 hours. Deleting source data or disabling your account invalidates retained archives.":
    "保存中のキャリア記録、履歴書の元ファイル、生成PDFを非公開ZIPにまとめます。有効期間は24時間です。元データの削除やアカウント無効化によりアーカイブも無効になります。",
  "The archive contains personal information. Save it somewhere you trust. Public catalogs, credentials and other accounts' private records are excluded. An export does not delete your account.":
    "個人情報を含むため、信頼できる場所に保存してください。公開カタログ、認証情報、他のアカウントのデータは含みません。エクスポートしてもアカウントは削除されません。",
  "Up to three requests per 24 hours and one pending request. Large requests fail explicitly; records and files are never silently truncated.":
    "24時間に3回まで、処理待ちは1件までです。上限を超える場合は明示的に失敗し、データやファイルを黙って省略しません。",
  "Your export is temporarily unavailable.": "エクスポートを一時的に利用できません。",
  "Create private account export": "非公開エクスポートを作成",
  "Refresh account exports": "エクスポート一覧を更新",
  "Loading your exports…": "エクスポートを読み込み中…",
  "Your archive is being prepared by the background worker. You may leave this page and return.":
    "バックグラウンドワーカーでアーカイブを作成中です。このページを離れて後で戻れます。",
  "No account exports yet.": "エクスポートはまだありません。",
  "Account archive · {status}": "アカウントアーカイブ・{status}",
  "Requested {requested}. Available until {expires}.":
    "リクエスト：{requested}。有効期限：{expires}。",
  "{size} KB.": "{size} KB。",
  "Download account archive": "アーカイブをダウンロード",
  "Remove account archive": "アーカイブを削除",
  "This archive cannot be downloaded. Request a new snapshot of your current data.":
    "このアーカイブはダウンロードできません。現在のデータで新しく作成してください。",
  "Load older account exports": "以前のエクスポートを読み込む",
  "Delete your account": "アカウントを削除",
  "This permanently removes your private career records, resume files and sign-in account. Access stops as soon as the request is accepted; file and account cleanup continue afterward.":
    "非公開のキャリア記録、履歴書ファイル、ログインアカウントを完全に削除します。受け付け直後にアクセスを停止し、その後ファイルとアカウントの削除を進めます。",
  "Download anything you want to keep first. Your stored account archives will also be removed. Minimal operational records and deletion markers remain; backup copies follow their retention policy.":
    "必要なデータは先にダウンロードしてください。保存済みのアーカイブも削除されます。最小限の運用記録と削除マーカーは残り、バックアップは保持ポリシーに従います。",
  "Type DELETE to confirm": "確認のためDELETEと入力",
  "Account deletion confirmation": "アカウント削除の確認",
  "Permanently delete my account": "アカウントを完全に削除",
  "Account removal is temporarily unavailable. Keep your receipt and check again.":
    "アカウント削除を一時的に利用できません。受付票を保存し、後で確認してください。",
  "Account deletion progress": "アカウント削除の進行状況",
  "Account removal request": "アカウント削除リクエスト",
  "Private account access is disabled. Keep the receipt below to check progress after closing this page.":
    "非公開データへのアクセスを停止しました。ページを閉じた後も進行状況を確認できるよう、以下の受付票を保存してください。",
  "Request {id}": "リクエスト {id}",
  "Removal status: {status}": "削除の状態：{status}",
  "{count} service failure(s) recorded. Temporary failures retry automatically.":
    "サービスエラーを{count}件記録しました。一時的な障害は自動で再試行します。",
  "Next attempt no earlier than {time} UTC.": "次回の試行は{time} UTC以降です。",
  "Your sign-in account, private career records and live files have been removed. Previously downloaded files cannot be recalled; retained backups follow their expiry policy.":
    "ログインアカウント、非公開のキャリア記録、稼働中のファイルを削除しました。ダウンロード済みファイルは回収できません。バックアップは保持期限に従います。",
  "An operator must review this request. Share the request identifier with support; keep the private receipt secret.":
    "運用担当者の確認が必要です。リクエストIDをサポートに伝え、非公開の受付票は秘密にしてください。",
  "Checking removal progress…": "削除の進行状況を確認中…",
  "Refresh deletion progress": "削除状況を更新",
  "Save deletion receipt": "削除受付票を保存",
  "Check an existing deletion receipt": "保存済みの削除受付票を確認",
  "Paste the code from your saved receipt. It reveals progress only and never restores account access.":
    "保存した受付票のコードを入力してください。進行状況の確認専用であり、アクセスの復元はできません。",
  "Check the saved receipt code.": "保存した受付票のコードを確認してください。",
  "Private deletion receipt": "非公開の削除受付票",
  "Check deletion receipt": "削除受付票を確認",
  "Identity administration": "認証管理",
  "Identity administration is temporarily unavailable.": "認証管理を一時的に利用できません。",
  "Administrator controls": "管理者コントロール",
  "Manage unused invitations and future weekly allowances. Refunding an eligible infrastructure failure records an audit reason.":
    "未使用の招待と今後の週別利用枠を管理します。対象のインフラ障害に対する利用枠返却では監査理由を記録します。",
  "Invite a member": "メンバーを招待",
  "Invite email": "招待メールアドレス",
  "Invitation expires (UTC)": "招待の有効期限（UTC）",
  "Add invitation": "招待を追加",
  "Invitation {id} saved. The recipient can sign in before {expiresAt}.":
    "招待 {id}を保存しました。{expiresAt}までログインできます。",
  "Schedule a future quota": "今後の利用枠を予約",
  "Analysis feature": "分析機能",
  Resume: "履歴書",
  "Weekly limit": "週の上限",
  "Effective Monday (UTC)": "適用する月曜日（UTC）",
  "Schedule quota": "利用枠を予約",
  "Quota policy scheduled for {feature} from {effectiveFrom}. Existing usage stays unchanged.":
    "{feature}の利用枠を{effectiveFrom}から予約しました。既存の使用状況は変わりません。",
  "Refund failed analysis": "失敗した分析の利用枠を返却",
  "Only consumed analyses that failed because of infrastructure are eligible.":
    "インフラ障害により失敗し、使用済みとなった分析のみが対象です。",
  "Task ID": "タスクID",
  "Refund reason": "返却の理由",
  "Record audited refund": "監査付き返却を記録",
  "The infrastructure-failure refund was recorded in the audit log.":
    "インフラ障害に対する返却を監査ログに記録しました。",
  "Refresh invitations and quota policies": "招待と利用枠を更新",
  "Invitation records": "招待の記録",
  "Records show identifiers and expiry only. Invitation email addresses and hashes are not returned.":
    "IDと有効期限のみ表示します。招待メールアドレスやハッシュは返しません。",
  "{status} · expires {expiresAt}": "{status}・有効期限 {expiresAt}",
  "Revoke unused invitation": "未使用の招待を取り消す",
  "Revoke unused invitation {id}": "未使用の招待 {id}を取り消す",
  "Unused invitation revoked. This does not deactivate a signed-in account.":
    "未使用の招待を取り消しました。ログイン済みアカウントは無効化しません。",
  "No invitations.": "招待はありません。",
  "Load older invitations": "以前の招待を読み込む",
  "Quota policy records": "利用枠ポリシーの記録",
  "Changes begin on a future Monday at 00:00 UTC. Reusing a future feature/date updates that unused policy through the same audited service.":
    "今後の月曜日00:00 UTCから適用します。同じ将来の日付と機能を再指定すると、同じ監査付きサービスで未使用のポリシーを更新します。",
  "{feature}: {limit} per week": "{feature}：週{limit}回",
  "From {effectiveFrom} · policy {id}": "{effectiveFrom}から・ポリシー {id}",
  "Load older quota policies": "以前の利用枠ポリシーを読み込む",
  "Approved recipients: {recipients}": "承認済みの送信先：{recipients}",
  "No AI recipient is approved for this version, so nothing is sent.":
    "このバージョンではAI送信先が承認されていないため、何も送信されません。",
} satisfies Messages;
