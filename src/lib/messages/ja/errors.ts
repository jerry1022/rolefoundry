import type { Messages } from "../zh-TW/types";

export const errors = {
  "Invalid archive reference.": "アーカイブ参照が無効です。",
  "Private export storage is temporarily unavailable.":
    "非公開エクスポート用ストレージを一時的に利用できません。",
  "The private object exceeds its limit.": "非公開オブジェクトが上限を超えています。",
  "Invalid source reference.": "元データの参照が無効です。",
  "The archive exceeds its limit.": "アーカイブが上限を超えています。",
  "Private archive storage is temporarily unavailable.":
    "非公開アーカイブ用ストレージを一時的に利用できません。",
  "Private export cleanup will be retried.": "非公開エクスポートの削除を再試行します。",
  "The export cursor is invalid.": "エクスポートのカーソルが無効です。",
  "The export query is invalid.": "エクスポートのクエリーが無効です。",
  "The private archive failed its integrity check.":
    "非公開アーカイブの整合性チェックに失敗しました。",
  "The private archive is no longer available.": "非公開アーカイブは利用できなくなりました。",
  "The export resource is unavailable.": "エクスポート対象を利用できません。",
  "Check the export request or identifier.": "エクスポートのリクエストかIDを確認してください。",
  "Account removal will retry when the identity service is available.":
    "認証サービスが復旧したらアカウント削除を再試行します。",
  "The cleanup reference is outside the accepted account.":
    "削除対象の参照が許可されたアカウントの範囲外です。",
  "Account file cleanup will retry.": "アカウントのファイル削除を再試行します。",
  "Deletion receipts are accepted only in a private request body.":
    "削除受付票は非公開のリクエスト本文でのみ受け付けます。",
  "The account deletion operation is unavailable.": "アカウント削除操作を利用できません。",
  "Check the deletion confirmation or private receipt.":
    "削除確認の入力か非公開受付票を確認してください。",
  "The history cursor is invalid.": "履歴のカーソルが無効です。",
  "The resume cursor is invalid.": "履歴書のカーソルが無効です。",
  "The query is invalid.": "クエリーが無効です。",
  "The resource is unavailable.": "リソースを利用できません。",
  "Check the application fields and revision.": "応募の入力項目とリビジョンを確認してください。",
  "The task is unavailable.": "タスクを利用できません。",
  "The assessment is unavailable.": "スキル評価を利用できません。",
  "Check the assessment fields and answers.": "評価の項目と回答を確認してください。",
  "The link-check query is invalid.": "リンク確認のクエリーが無効です。",
  "The link-check recovery input is invalid.": "リンク確認の復旧入力が無効です。",
  "The recipient change is invalid.": "送信先の変更が無効です。",
  "The request is invalid.": "リクエストが無効です。",
  "The usage window is invalid.": "利用状況の集計期間が無効です。",
  "The administration cursor is invalid.": "管理用カーソルが無効です。",
  "The invitation identifier is invalid.": "招待IDが無効です。",
  "Sign in to continue.": "続けるにはログインしてください。",
  "This operation is not permitted.": "この操作は許可されていません。",
  "A valid invitation is required.": "有効な招待が必要です。",
  "Review the current consent policy before continuing.":
    "続ける前に現在の同意ポリシーを確認してください。",
  "Current consent is required for this analysis.":
    "この分析には現在のポリシーへの同意が必要です。",
  "The weekly analysis limit has been reached.": "週の分析利用枠の上限に達しました。",
  "The request conflicts with the current resource version or state.":
    "リクエストが現在のバージョンまたは状態と競合しています。",
  "Identity is not configured for this deployment.": "このデプロイでは認証が設定されていません。",
  "Identity is temporarily unavailable.": "認証を一時的に利用できません。",
  "The request origin is not permitted.": "リクエストのオリジンが許可されていません。",
  "The request is too large.": "リクエストが大きすぎます。",
  "The batch owner or task is no longer available.":
    "バッチの所有者かタスクは利用できなくなりました。",
  "The batch cursor is invalid.": "バッチのカーソルが無効です。",
  "Check the approved feed, source and schedule settings.":
    "承認済みフィード、ソース、スケジュールの設定を確認してください。",
  "Select a deployment-approved feed for this source kind.":
    "このソース種別に対応する、デプロイで承認済みのフィードを選択してください。",
  "Review the current deployment-approved feed configuration before fetching.":
    "取得する前に、現在の承認済みフィード設定を確認してください。",
  "Check the review fields, target choice and expected revision.":
    "レビュー項目、対象の選択、想定リビジョンを確認してください。",
  "The source row cannot be rebased.": "元の行を再対応付けできません。",
  "This decision does not accept replacement metadata.":
    "この判断では差し替えメタデータを受け付けません。",
  "Check the import source, batch identifier and file format.":
    "取り込み元、バッチID、ファイル形式を確認してください。",
  "The source configuration could not be verified.": "ソース設定を検証できませんでした。",
  "Check the import settings or resource identifier.":
    "取り込み設定かリソースIDを確認してください。",
  "The page cursor is invalid.": "ページのカーソルが無効です。",
  "Use the page cursor with its original filters.":
    "ページカーソルは元の絞り込み条件と合わせて使用してください。",
  "The bookmark cursor belongs to another session.":
    "ブックマークのカーソルは別のセッションのものです。",
  "The job is unavailable.": "求人を利用できません。",
  "The catalog is not configured for this deployment.":
    "このデプロイではカタログが設定されていません。",
  "Check the catalog fields and try again.": "カタログの入力項目を確認して再試行してください。",
  "The course catalog is not configured.": "コースカタログが設定されていません。",
  "Check the learning fields and versions.": "学習の項目とバージョンを確認してください。",
  "Check the matching request and versions.":
    "マッチングのリクエストとバージョンを確認してください。",
  "The diagnostics cursor is invalid.": "診断のカーソルが無効です。",
  "The diagnostics query is invalid.": "診断のクエリーが無効です。",
  "The diagnostics resource is unavailable.": "診断リソースを利用できません。",
  "Replay accepts no query parameters.": "再実行ではクエリーパラメーターを受け付けません。",
  "The task recovery resource is unavailable.": "タスク復旧リソースを利用できません。",
  "The task identifier is invalid.": "タスクIDが無効です。",
  "Choose a recovery reason and a valid request identifier.":
    "復旧理由と有効なリクエストIDを選択してください。",
  "The deployment no longer approves this feed definition.":
    "このフィード定義はデプロイで承認されていません。",
  "The original request is no longer eligible for recovery.":
    "元のリクエストは復旧の対象ではありません。",
  "Check the task filters or resource identifier.":
    "タスクの絞り込みかリソースIDを確認してください。",
  "The export exceeds its daily, file or data size limit. No data was truncated.":
    "エクスポートが日次、ファイル数、容量の上限を超えています。データは省略していません。",
  "This import exceeds the batch, row or source history limit.":
    "取り込みがバッチ、行、ソース履歴の上限を超えています。",
  "The tracker has reached its record, event or follow-up limit.":
    "応募管理の記録、イベント、フォローアップの上限に達しました。",
  "This resume operation exceeds the document, history or content limit.":
    "履歴書操作が文書、履歴、内容の上限を超えています。",
  "Historical versions cannot be overwritten. Create a new confirmed version.":
    "過去のバージョンは上書きできません。新しい確認済みバージョンを作成してください。",
  "Course prerequisites would form a cycle. Review the required foundations.":
    "先修条件が循環します。必要な基礎項目を確認してください。",
  "This learning request exceeds the initial planning or reference limit.":
    "この学習リクエストは初回計画または参照の上限を超えています。",
  "This analysis is too large. Choose one target role or reduce the profile evidence before refreshing.":
    "分析対象が多すぎます。求人をひとつ選ぶか、プロフィールの裏付けを減らして更新してください。",
  "This track needs three reviewed questions before an assessment can start.":
    "この分野の評価を始めるには、レビュー済みの問題が3問必要です。",
  "The task inputs changed. Start from the current version.":
    "タスクの入力が変わりました。現在のバージョンからやり直してください。",
  "The data changed. Reload before trying again.":
    "データが変更されました。再読み込みしてからお試しください。",
  "The service is temporarily unavailable.": "サービスを一時的に利用できません。",
  "This service is not configured for this deployment.":
    "このデプロイではサービスが設定されていません。",
  "The public catalog is not configured.": "公開カタログが設定されていません。",
  "The verified PDF is unavailable.": "検証済みPDFを利用できません。",
  "The export exceeds its download limit.": "エクスポートのダウンロード上限を超えています。",
  "The resume history cursor is invalid.": "履歴書履歴のカーソルが無効です。",
  "The private object reference is invalid.": "非公開オブジェクト参照が無効です。",
  "The file exceeds the private storage limit.": "ファイルが非公開ストレージの上限を超えています。",
  "Private file storage is temporarily unavailable.":
    "非公開ファイルストレージを一時的に利用できません。",
  "The private file is unavailable.": "非公開ファイルを利用できません。",
  "The private file exceeds its size limit.": "非公開ファイルが容量上限を超えています。",
  "Private file cleanup will be retried.": "非公開ファイルの削除を再試行します。",
  "The file exceeds the upload limit.": "ファイルがアップロード上限を超えています。",
  "A resume file is required.": "履歴書ファイルが必要です。",
  "The resume resource is unavailable.": "履歴書リソースを利用できません。",
  "Check the resume fields and versions.": "履歴書の項目とバージョンを確認してください。",
  "The resume file must be between 1 byte and 5 MiB.":
    "履歴書ファイルは1バイト以上5 MiB以下にしてください。",
  "The file type differs from its upload intent.": "ファイル種別がアップロード申請と異なります。",
  "Stored file verification failed. Create a fresh upload intent.":
    "保存したファイルの検証に失敗しました。新しいアップロード申請を作成してください。",
  "The upload authority has expired.": "アップロード権限の有効期限が切れています。",
  "The fixed export could not be verified.": "固定版エクスポートを検証できませんでした。",
  "The download is unavailable.": "ダウンロードを利用できません。",
  "The dictionary is not configured.": "辞典が設定されていません。",
  "Check the dictionary fields and try again.": "辞典の項目を確認して再試行してください。",
} satisfies Messages;
