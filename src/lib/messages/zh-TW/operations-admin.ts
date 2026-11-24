import type { Messages } from "./types";

/** Administration workspace: section headings, AI recipients, task diagnostics and recovery. */
export const operationsAdmin = {
  ADMINISTRATION: "管理",
  "Review content and operate the workspace.": "審核內容並營運工作區。",
  "Manage reviewed skills, assessment versions, invitations and allowances alongside authorized sources and task recovery.":
    "管理已審核的技能、能力檢測版本、邀請與使用額度，以及授權來源與任務復原。",
  "Checking administrator access…": "正在確認管理員權限…",
  "Administration requires a current administrator session.":
    "管理功能需要有效的管理員登入工作階段。",
  "Administrator access could not be verified. Retry when the identity service is available.":
    "無法驗證管理員權限，請在身分服務恢復後重試。",
  "Check administrator access again": "重新確認管理員權限",
  "Skills and aliases": "技能與別名",
  "Assessment questions and rubrics": "能力檢測題目與評分準則",
  "Invitations and allowances": "邀請與使用額度",
  "AI recipients": "AI 接收方",

  "Recipient approvals are temporarily unavailable.": "接收方核准資料暫時無法使用。",
  "The change could not be confirmed. Refresh before retrying.":
    "無法確認變更，請重新整理後再重試。",
  "Approve each provider (and any reviewed upstream) for the current consent version. A new consent version starts with no approved recipients.":
    "請針對目前的同意書版本逐一核准每個服務供應商（以及任何已審核的上游服務）。新的同意書版本一開始沒有任何已核准的接收方。",
  Purpose: "用途",
  "Consent version": "同意書版本",
  Recipient: "接收方",
  Actions: "操作",
  Revoke: "撤銷",
  "No recipients are approved. Model requests cannot be admitted.":
    "目前沒有已核准的接收方，模型請求無法受理。",
  "Recipient ID": "接收方 ID",
  "Review reason (required for approve and revoke)": "審核原因（核准與撤銷時必填）",
  "Approve recipient": "核准接收方",

  "Task diagnostics are temporarily unavailable.": "任務診斷暫時無法使用。",
  "Task and worker diagnostics": "任務與工作程序診斷",
  "Operational metadata only. Refresh on demand; displayed observations do not change task state.":
    "僅顯示營運中繼資料。需要時再重新整理；顯示的觀測結果不會改變任務狀態。",
  "Checking task diagnostics access…": "正在確認任務診斷權限…",
  "Task diagnostics require an administrator session.": "任務診斷需要管理員登入工作階段。",
  "Refresh task diagnostics": "重新整理任務診斷",
  "Loading task diagnostics…": "正在載入任務診斷…",
  "Task metrics": "任務指標",
  "Queue and lease observations": "佇列與租約觀測",
  "Observed {observedAt}. Physical deliveries: {deliveries}. Invalid deliveries observed in 24 hours: {invalid}.":
    "觀測時間 {observedAt}。實際投遞次數：{deliveries}。24 小時內觀測到的無效投遞：{invalid}。",
  "Task kind": "任務類型",
  "Queued / ready": "排入佇列 / 可執行",
  "Running / expired lease": "執行中 / 租約已過期",
  "Oldest ready / heartbeat age (seconds)": "最久可執行 / 心跳間隔（秒）",
  "Success / failure / retry events (24 hours)": "成功 / 失敗 / 重試事件（24 小時）",
  "Recent active workers": "近期活躍的工作程序",
  "Diagnostic notices": "診斷通知",
  "No configured diagnostic thresholds were exceeded at this observation.":
    "本次觀測未超過任何已設定的診斷門檻。",
  "Ready means the retry deadline has passed. Worker presence is self-reported and becomes stale after {seconds} seconds; task leases remain authoritative. These notices do not send alerts to another service.":
    "「可執行」表示已過重試期限。工作程序的存活狀態由其自行回報，超過 {seconds} 秒即視為過時；任務租約仍是判斷依據。這些通知不會傳送警示給其他服務。",
  "Inspect tasks": "檢查任務",
  "Diagnostic task kind": "診斷任務類型",
  "All kinds": "所有類型",
  "Task state": "任務狀態",
  "Diagnostic task state": "診斷任務狀態",
  "All states": "所有狀態",
  "Apply task filters": "套用任務篩選條件",
  "Applied filters: {kind} / {status}.": "已套用的篩選條件：{kind} / {status}。",
  "all kinds": "所有類型",
  "all states": "所有狀態",
  "Task identifier": "任務識別碼",
  "Diagnostic task identifier": "診斷任務識別碼",
  "Inspect task identifier": "檢查任務識別碼",
  "No tasks match these filters.": "沒有符合這些篩選條件的任務。",
  "{id} · attempts {attempts}/{limit} · {issue}": "{id} · 嘗試 {attempts}/{limit} 次 · {issue}",
  persistent: "持續重試",
  "no classified issue": "無已分類的問題",
  "Inspect task {id}": "檢查任務 {id}",
  "Load older diagnostic tasks": "載入較早的診斷任務",
  "Selected task diagnostics": "所選任務的診斷",
  Attempts: "嘗試次數",
  "Created / started": "建立 / 開始",
  "not started": "尚未開始",
  "Retry due": "預定重試時間",
  "Lease expiry": "租約到期時間",
  "no active lease": "無有效租約",
  "Latest task heartbeat": "最近一次任務心跳",
  none: "無",
  "Result reference recorded": "已記錄結果參照",
  yes: "是",
  no: "否",
  "Safe failure code": "安全失敗代碼",
  "Task event history": "任務事件紀錄",
  "No retained events.": "沒有保留的事件。",
  "Load older task events": "載入較早的任務事件",
  "Task replay requires a separate audited domain operation that revalidates owner and input versions.":
    "重新執行任務需要另一個經稽核的領域操作，重新驗證擁有者與輸入版本。",
  "Worker observations": "工作程序觀測",
  "Observed {observedAt}. Showing {count} latest worker records.":
    "觀測時間 {observedAt}。顯示最新的 {count} 筆工作程序紀錄。",
  "Observed {observedAt}. Showing {count} latest worker records (additional records are not shown).":
    "觀測時間 {observedAt}。顯示最新的 {count} 筆工作程序紀錄（其餘紀錄未顯示）。",
  "No worker presence has been reported.": "尚無工作程序回報存活狀態。",
  "Reported {state} · last seen {lastSeenAt} · concurrency {concurrency} · lease {leaseSeconds}s":
    "回報狀態 {state} · 最後出現 {lastSeenAt} · 並行數 {concurrency} · 租約 {leaseSeconds} 秒",

  "Task recovery is temporarily unavailable. Retry the same operation.":
    "任務復原暫時無法使用，請重試同一項操作。",
  "Task recovery": "任務復原",
  "Recover a failed task": "復原失敗的任務",
  "Recovery validates the original request and creates a new execution. Its previous history stays available. Review the service issue before requesting recovery.":
    "復原會驗證原始請求並建立新的執行，先前的紀錄仍會保留。請先檢視服務問題，再要求復原。",
  "Check recovery eligibility": "檢查是否可復原",
  "A new attempt already exists. Inspect it before taking further action.":
    "已有新的嘗試，請先檢查後再採取進一步行動。",
  "Only a failed task without a committed result can be recovered here.":
    "這裡只能復原沒有已提交結果的失敗任務。",
  "This failure needs a new owner request or domain correction; it cannot be replayed.":
    "這個失敗需要擁有者重新提出請求或修正領域資料，無法重新執行。",
  "The original account is unavailable. Its private work cannot restart.":
    "原始帳號已無法使用，其私人工作無法重新開始。",
  "The accepted input, source permission or version is no longer valid. Use the current domain workflow.":
    "已受理的輸入、來源權限或版本已失效，請改用目前的領域流程。",
  "The original request has reached its recovery or pending-work limit.":
    "原始請求已達復原或待處理工作的上限。",
  "This deployment no longer approves the original feed definition.":
    "此部署已不再核准原始的資料來源定義。",
  "New attempt: {id}": "新的嘗試：{id}",
  "Inspect recovered attempt": "檢查復原後的嘗試",
  "Task recovery reason": "任務復原原因",
  "Operator reviewed": "已由維運人員審核",
  "Configuration restored": "設定已還原",
  "Storage restored": "儲存空間已還原",
  "Directory restored": "目錄服務已還原",
  "Requesting recovery…": "正在要求復原…",
  "Retry this recovery request": "重試這個復原請求",
  "Create new task attempt": "建立新的任務嘗試",

  "Account removal recovery is unavailable.": "帳號移除復原目前無法使用。",
  "Account deletion recovery": "帳號刪除復原",
  "Recover an already accepted deletion request after reviewing its failed task. Resume creates an audited new attempt; it cannot initiate deletion for another account.":
    "檢視失敗的任務後，復原已受理的刪除請求。繼續執行會建立一次經稽核的新嘗試，但無法為其他帳號發起刪除。",
  "Deletion task identifier": "刪除任務識別碼",
  "Find deletion request": "尋找刪除請求",
  "Deletion request identifier": "刪除請求識別碼",
  "Resume failed account deletion": "繼續執行失敗的帳號刪除",
  "Request {id} · {status}": "請求 {id} · {status}",
  "Account deletion recovery requires an administrator session.":
    "帳號刪除復原需要管理員登入工作階段。",
} satisfies Messages;
