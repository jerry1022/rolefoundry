import type { Messages } from "../zh-TW/types";

export const operationsAdmin = {
  ADMINISTRATION: "管理",
  "Review content and operate the workspace.": "コンテンツの確認とワークスペースの運用。",
  "Manage reviewed skills, assessment versions, invitations and allowances alongside authorized sources and task recovery.":
    "スキル、評価版、招待、利用枠と、許諾済みソースやタスク復旧を管理します。",
  "Administration requires a current administrator session.":
    "管理には現在有効な管理者セッションが必要です。",
  "Administrator access could not be verified. Retry when the identity service is available.":
    "管理者権限を確認できませんでした。認証サービスの復旧後に再試行してください。",
  "Check administrator access again": "管理者権限を再確認",
  "Skills and aliases": "スキルと別名",
  "Assessment questions and rubrics": "評価問題と採点基準",
  "Invitations and allowances": "招待と利用枠",
  "AI recipients": "AI送信先",
  "Recipient approvals are temporarily unavailable.": "送信先の承認を一時的に利用できません。",
  "The change could not be confirmed. Refresh before retrying.":
    "変更を確認できませんでした。更新してから再試行してください。",
  "Approve each provider (and any reviewed upstream) for the current consent version. A new consent version starts with no approved recipients.":
    "現在の同意版に対して提供元とレビュー済み上流送信先を承認してください。新しい同意版では承認先は空になります。",
  Purpose: "目的",
  "Consent version": "同意バージョン",
  Recipient: "送信先",
  Actions: "操作",
  Revoke: "取り消す",
  "No recipients are approved. Model requests cannot be admitted.":
    "承認済み送信先がありません。モデルへのリクエストは許可されません。",
  "Recipient ID": "送信先ID",
  "Review reason (required for approve and revoke)": "レビュー理由（承認・取り消しに必須）",
  "Approve recipient": "送信先を承認",
  "Task diagnostics are temporarily unavailable.": "タスク診断を一時的に利用できません。",
  "Task and worker diagnostics": "タスクとワーカーの診断",
  "Operational metadata only. Refresh on demand; displayed observations do not change task state.":
    "運用メタデータのみです。必要時に更新してください。表示してもタスク状態は変えません。",
  "Checking task diagnostics access…": "タスク診断の権限を確認中…",
  "Task diagnostics require an administrator session.":
    "タスク診断には管理者セッションが必要です。",
  "Refresh task diagnostics": "タスク診断を更新",
  "Loading task diagnostics…": "タスク診断を読み込み中…",
  "Task metrics": "タスク指標",
  "Queue and lease observations": "キューとリースの観察",
  "Observed {observedAt}. Physical deliveries: {deliveries}. Invalid deliveries observed in 24 hours: {invalid}.":
    "観察 {observedAt}。配信数：{deliveries}。24時間の無効配信：{invalid}。",
  "Task kind": "タスク種別",
  "Queued / ready": "待機 / 実行可能",
  "Running / expired lease": "実行中 / リース切れ",
  "Oldest ready / heartbeat age (seconds)": "最古の実行可能タスク / ハートビート経過秒",
  "Success / failure / retry events (24 hours)": "成功 / 失敗 / 再試行（24時間）",
  "Recent active workers": "最近の稼働ワーカー",
  "Diagnostic notices": "診断のお知らせ",
  "No configured diagnostic thresholds were exceeded at this observation.":
    "今回の観察では設定済みのしきい値を超えていません。",
  "Ready means the retry deadline has passed. Worker presence is self-reported and becomes stale after {seconds} seconds; task leases remain authoritative. These notices do not send alerts to another service.":
    "実行可能は再試行の待ち時間経過を意味します。ワーカー状態は自己申告で、{seconds}秒後に古くなります。タスクリースが正となります。この通知は外部へアラートを送りません。",
  "Inspect tasks": "タスクを調べる",
  "Diagnostic task kind": "診断するタスク種別",
  "All kinds": "すべての種別",
  "Task state": "タスク状態",
  "Diagnostic task state": "診断するタスク状態",
  "All states": "すべての状態",
  "Apply task filters": "タスクの絞り込みを適用",
  "Applied filters: {kind} / {status}.": "適用中：{kind} / {status}。",
  "all kinds": "すべての種別",
  "all states": "すべての状態",
  "Task identifier": "タスクID",
  "Diagnostic task identifier": "診断するタスクID",
  "Inspect task identifier": "タスクIDを調べる",
  "No tasks match these filters.": "条件に合うタスクはありません。",
  "{id} · attempts {attempts}/{limit} · {issue}": "{id}・試行 {attempts}/{limit}・{issue}",
  persistent: "永続",
  "no classified issue": "分類済みの問題なし",
  "Inspect task {id}": "タスク {id}を調べる",
  "Load older diagnostic tasks": "以前の診断タスクを読み込む",
  "Selected task diagnostics": "選択したタスクの診断",
  Attempts: "試行回数",
  "Created / started": "作成 / 開始",
  "not started": "未開始",
  "Retry due": "再試行可能時刻",
  "Lease expiry": "リース有効期限",
  "no active lease": "有効なリースなし",
  "Latest task heartbeat": "最新のタスクハートビート",
  none: "なし",
  "Result reference recorded": "結果参照を記録済み",
  yes: "はい",
  no: "いいえ",
  "Safe failure code": "安全なエラーコード",
  "Task event history": "タスクイベント履歴",
  "No retained events.": "保存済みイベントなし。",
  "Load older task events": "以前のタスクイベントを読み込む",
  "Task replay requires a separate audited domain operation that revalidates owner and input versions.":
    "タスク再実行には、所有者と入力版を再検証する個別の監査付き操作が必要です。",
  "Worker observations": "ワーカーの観察",
  "Observed {observedAt}. Showing {count} latest worker records.":
    "観察 {observedAt}。最新{count}件を表示。",
  "Observed {observedAt}. Showing {count} latest worker records (additional records are not shown).":
    "観察 {observedAt}。最新{count}件を表示（追加の記録は未表示）。",
  "No worker presence has been reported.": "ワーカーの稼働報告はありません。",
  "Reported {state} · last seen {lastSeenAt} · concurrency {concurrency} · lease {leaseSeconds}s":
    "申告状態 {state}・最終確認 {lastSeenAt}・並列数 {concurrency}・リース {leaseSeconds}秒",
  "Task recovery is temporarily unavailable. Retry the same operation.":
    "タスク復旧を一時的に利用できません。同じ操作を再試行してください。",
  "Task recovery": "タスク復旧",
  "Recover a failed task": "失敗タスクを復旧",
  "Recovery validates the original request and creates a new execution. Its previous history stays available. Review the service issue before requesting recovery.":
    "元のリクエストを検証して新しい実行を作ります。過去の履歴は保持します。復旧前にサービスの問題を確認してください。",
  "Check recovery eligibility": "復旧対象か確認",
  "A new attempt already exists. Inspect it before taking further action.":
    "新しい試行が既にあります。次の操作の前に確認してください。",
  "Only a failed task without a committed result can be recovered here.":
    "ここで復旧できるのは、結果が確定していない失敗タスクのみです。",
  "This failure needs a new owner request or domain correction; it cannot be replayed.":
    "新しい本人リクエストかドメイン修正が必要です。再実行はできません。",
  "The original account is unavailable. Its private work cannot restart.":
    "元のアカウントを利用できないため、非公開処理を再開できません。",
  "The accepted input, source permission or version is no longer valid. Use the current domain workflow.":
    "入力、許諾、バージョンが無効です。現在のドメインの操作を使ってください。",
  "The original request has reached its recovery or pending-work limit.":
    "元のリクエストが復旧または待機処理の上限に達しています。",
  "This deployment no longer approves the original feed definition.":
    "このデプロイでは元のフィード定義は承認されていません。",
  "New attempt: {id}": "新しい試行：{id}",
  "Inspect recovered attempt": "復旧した試行を確認",
  "Task recovery reason": "タスク復旧の理由",
  "Operator reviewed": "運用担当者の確認済み",
  "Configuration restored": "設定を復旧",
  "Storage restored": "ストレージを復旧",
  "Directory restored": "ディレクトリーを復旧",
  "Requesting recovery…": "復旧を要求中…",
  "Retry this recovery request": "この復旧リクエストを再試行",
  "Create new task attempt": "新しいタスク試行を作成",
  "Account removal recovery is unavailable.": "アカウント削除の復旧を利用できません。",
  "Account deletion recovery": "アカウント削除の復旧",
  "Recover an already accepted deletion request after reviewing its failed task. Resume creates an audited new attempt; it cannot initiate deletion for another account.":
    "失敗タスクを確認し、受付済みの削除を復旧します。再開は監査付きの新しい試行を作成し、他アカウントの削除を新規開始しません。",
  "Deletion task identifier": "削除タスクID",
  "Find deletion request": "削除リクエストを検索",
  "Deletion request identifier": "削除リクエストID",
  "Resume failed account deletion": "失敗したアカウント削除を再開",
  "Request {id} · {status}": "リクエスト {id}・{status}",
  "Account deletion recovery requires an administrator session.":
    "アカウント削除の復旧には管理者セッションが必要です。",
  "Ready work has waited at least five minutes.": "実行可能な処理が5分以上待機しています。",
  "No recent active worker reports handling this ready work.":
    "この処理を扱う最近の稼働ワーカー報告がありません。",
  "Running work has an expired or missing lease.":
    "実行中タスクのリースが期限切れ、またはありません。",
  "Account removal has retried repeatedly. Inspect worker configuration and service availability.":
    "アカウント削除の再試行が続いています。ワーカー設定とサービス状態を確認してください。",
  "At least ten percent of terminal work failed in the last 24 hours (minimum ten tasks).":
    "24時間の終了タスクの10%以上が失敗しました（最低10タスク）。",
  "Workers observed invalid queue deliveries in the last 24 hours.":
    "24時間以内にワーカーが無効なキュー配信を観察しました。",
} satisfies Messages;
