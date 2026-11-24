import type { Messages } from "./types";

/**
 * Connected-mode account screens: sign-in, analysis consent, weekly allowance, data export,
 * account deletion and identity administration. Status codes, IDs and the typed DELETE
 * confirmation stay in English.
 */
export const account = {
  // Account & privacy
  "YOUR ACCOUNT, YOUR CHOICE": "你的帳號，你作主",
  "Account & privacy.": "帳號與隱私。",
  "Invitation-only sign-in, explicit analysis consent and a clear view of your weekly limits.":
    "僅限受邀登入、明確的分析同意，並清楚掌握每週額度。",
  "You're exploring the local demo.": "你正在使用本機示範版。",
  "This static demo does not connect to an identity service. Your workspace remains in this browser.":
    "這個靜態示範版不會連線到身分服務，你的工作區資料只保存在這個瀏覽器中。",
  "Email sign-in and account controls are available in configured server deployments. See the repository's identity setup guide to run them locally.":
    "電子郵件登入與帳號管理功能需在已設定的伺服器部署中使用。若要在本機執行，請參閱儲存庫中的身分設定指南。",
  "Identity setup guide": "身分設定指南",
  "Sign-in protects your private career data. Browser-local demo data is imported only through an explicit reviewed action; signing in does not upload or merge it.":
    "登入可保護你的私人職涯資料。瀏覽器中的示範資料只會在你確認後明確匯入；登入本身不會上傳或合併這些資料。",
  "Loading your account…": "正在載入你的帳號…",
  "Unable to load your account.": "無法載入你的帳號。",
  "The request could not be completed.": "無法完成這項請求。",
  "Sign in with an invitation.": "使用邀請登入。",
  "Use your invited email address. Enter the code from your email to continue.":
    "請使用受邀的電子郵件地址，並輸入信中的驗證碼以繼續。",
  "Email address": "電子郵件地址",
  "Request another code": "重新索取驗證碼",
  "Send sign-in code": "寄送登入驗證碼",
  "Sign-in code": "登入驗證碼",
  "Verify and sign in": "驗證並登入",
  "You are signed in.": "你已登入。",
  "Signed in as a {role}": "已登入，身分為{role}",
  admin: "管理員",
  member: "成員",
  "Account {id} · verified server session": "帳號 {id} · 已驗證的伺服器工作階段",
  "Sign out": "登出",
  "You have signed out of this device.": "你已在這部裝置上登出。",
  "Analysis permissions": "分析同意",
  "Choose separately for each purpose. Revoking permission cancels queued work and prevents an in-progress result from being published. This page does not run an AI analysis.":
    "請針對每個用途分別選擇。撤回同意會取消排隊中的工作，並阻止進行中的結果發布。此頁面不會執行 AI 分析。",
  "Permission granted": "已同意",
  "No current permission": "目前未同意",
  "Assessment analysis": "能力檢測分析",
  "Resume analysis": "履歷分析",
  "Policy version {version}": "政策版本 {version}",
  "Revoke permission": "撤回同意",
  "I agree to this policy": "我同意此政策",
  "Permission revoked. A provider call already in progress cannot be recalled, but its result cannot be published after revocation.":
    "已撤回同意。已在進行中的服務呼叫無法收回，但撤回後其結果不會被發布。",
  "Your permission has been recorded for this policy version.": "已記錄你對此政策版本的同意。",
  "Weekly analysis allowance": "每週分析額度",
  "assessment analysis": "能力檢測分析",
  "resume analysis": "履歷分析",
  "Semantic role ranking": "語意職缺排序",
  "semantic ranking": "語意排序",
  "/ {limit} remaining": "/ {limit} 剩餘",
  "{reserved} reserved · {consumed} consumed": "保留 {reserved} · 已使用 {consumed}",
  "Resets Monday 00:00 UTC": "每週一 00:00 UTC 重設",

  // Data export
  "Your account data export": "你的帳號資料匯出",
  "Download your account data": "下載你的帳號資料",
  "Create a private ZIP with your retained career records, resume source files and generated PDFs. It is available for 24 hours. Deleting source data or disabling your account invalidates retained archives.":
    "建立一個私人 ZIP 檔，內含你保留的職涯紀錄、履歷原始檔與產生的 PDF，可在 24 小時內下載。刪除來源資料或停用帳號後，保留的封存檔將失效。",
  "The archive contains personal information. Save it somewhere you trust. Public catalogs, credentials and other accounts' private records are excluded. An export does not delete your account.":
    "封存檔包含個人資料，請存放在你信任的地方。公開目錄、憑證及其他帳號的私人紀錄不會包含在內。匯出不會刪除你的帳號。",
  "Up to three requests per 24 hours and one pending request. Large requests fail explicitly; records and files are never silently truncated.":
    "每 24 小時最多可請求三次，且同時只能有一個處理中的請求。過大的請求會明確失敗，紀錄與檔案絕不會被默默截斷。",
  "Your export is temporarily unavailable.": "匯出功能暫時無法使用。",
  "Create private account export": "建立私人帳號匯出",
  "Refresh account exports": "重新整理帳號匯出",
  "Loading your exports…": "正在載入你的匯出…",
  "Your archive is being prepared by the background worker. You may leave this page and return.":
    "背景工作程序正在準備你的封存檔。你可以先離開此頁面，稍後再回來。",
  "No account exports yet.": "尚無帳號匯出。",
  "Account archive · {status}": "帳號封存檔 · {status}",
  "Requested {requested}. Available until {expires}.": "請求於 {requested}。可下載至 {expires}。",
  "{size} KB.": "{size} KB。",
  "Download account archive": "下載帳號封存檔",
  "Remove account archive": "移除帳號封存檔",
  "This archive cannot be downloaded. Request a new snapshot of your current data.":
    "此封存檔無法下載。請重新請求一份目前資料的快照。",
  "Load older account exports": "載入較早的帳號匯出",

  // Account deletion
  "Delete your account": "刪除你的帳號",
  "This permanently removes your private career records, resume files and sign-in account. Access stops as soon as the request is accepted; file and account cleanup continue afterward.":
    "這會永久刪除你的私人職涯紀錄、履歷檔案與登入帳號。請求一經受理即停止存取，檔案與帳號清除作業會在之後繼續進行。",
  "Download anything you want to keep first. Your stored account archives will also be removed. Minimal operational records and deletion markers remain; backup copies follow their retention policy.":
    "請先下載任何想保留的內容。你已儲存的帳號封存檔也會一併移除。僅保留最低限度的營運紀錄與刪除標記；備份副本依其保存政策處理。",
  "Type DELETE to confirm": "輸入 DELETE 以確認",
  "Account deletion confirmation": "帳號刪除確認",
  "Permanently delete my account": "永久刪除我的帳號",
  "Account removal is temporarily unavailable. Keep your receipt and check again.":
    "帳號移除功能暫時無法使用。請保留你的收據，稍後再查詢。",
  "Account deletion progress": "帳號刪除進度",
  "Account removal request": "帳號移除請求",
  "Private account access is disabled. Keep the receipt below to check progress after closing this page.":
    "私人帳號存取已停用。請保留下方收據，以便關閉此頁面後查詢進度。",
  "Request {id}": "請求 {id}",
  "Removal status: {status}": "移除狀態：{status}",
  "{count} service failure(s) recorded. Temporary failures retry automatically.":
    "已記錄 {count} 次服務失敗。暫時性失敗會自動重試。",
  "Next attempt no earlier than {time} UTC.": "下次嘗試不早於 {time} UTC。",
  "Your sign-in account, private career records and live files have been removed. Previously downloaded files cannot be recalled; retained backups follow their expiry policy.":
    "你的登入帳號、私人職涯紀錄與線上檔案均已移除。先前下載的檔案無法收回；保留的備份依其到期政策處理。",
  "An operator must review this request. Share the request identifier with support; keep the private receipt secret.":
    "此請求需要營運人員審查。請將請求識別碼提供給客服，並妥善保管私人收據，切勿外流。",
  "Checking removal progress…": "正在查詢移除進度…",
  "Refresh deletion progress": "重新整理刪除進度",
  "Save deletion receipt": "儲存刪除收據",
  "Check an existing deletion receipt": "查詢既有的刪除收據",
  "Paste the code from your saved receipt. It reveals progress only and never restores account access.":
    "貼上已儲存收據中的代碼。它只會顯示進度，絕不會恢復帳號存取權。",
  "Check the saved receipt code.": "請檢查已儲存的收據代碼。",
  "Private deletion receipt": "私人刪除收據",
  "Check deletion receipt": "查詢刪除收據",

  // Identity administration
  "Identity administration": "身分管理",
  "Identity administration is temporarily unavailable.": "身分管理功能暫時無法使用。",
  "Administrator controls": "管理員控制項",
  "Manage unused invitations and future weekly allowances. Refunding an eligible infrastructure failure records an audit reason.":
    "管理尚未使用的邀請與未來的每週額度。退還符合資格的基礎設施失敗額度時，會記錄稽核原因。",
  "Invite a member": "邀請成員",
  "Invite email": "邀請電子郵件",
  "Invitation expires (UTC)": "邀請到期日（UTC）",
  "Add invitation": "新增邀請",
  "Invitation {id} saved. The recipient can sign in before {expiresAt}.":
    "已儲存邀請 {id}。受邀者可在 {expiresAt} 之前登入。",
  "Schedule a future quota": "排定未來額度",
  "Analysis feature": "分析功能",
  Resume: "履歷",
  "Weekly limit": "每週上限",
  "Effective Monday (UTC)": "生效週一（UTC）",
  "Schedule quota": "排定額度",
  "Quota policy scheduled for {feature} from {effectiveFrom}. Existing usage stays unchanged.":
    "已排定 {feature} 自 {effectiveFrom} 起的額度政策。現有使用量維持不變。",
  "Refund failed analysis": "退還失敗的分析",
  "Only consumed analyses that failed because of infrastructure are eligible.":
    "僅限因基礎設施問題而失敗、且已扣用額度的分析。",
  "Task ID": "工作 ID",
  "Refund reason": "退還原因",
  "Record audited refund": "記錄經稽核的退還",
  "The infrastructure-failure refund was recorded in the audit log.":
    "基礎設施失敗的額度退還已記錄於稽核日誌。",
  "Refresh invitations and quota policies": "重新整理邀請與額度政策",
  "Invitation records": "邀請紀錄",
  "Records show identifiers and expiry only. Invitation email addresses and hashes are not returned.":
    "紀錄僅顯示識別碼與到期時間，不會回傳邀請的電子郵件地址與雜湊值。",
  "{status} · expires {expiresAt}": "{status} · 到期 {expiresAt}",
  "Revoke unused invitation": "撤回未使用的邀請",
  "Revoke unused invitation {id}": "撤回未使用的邀請 {id}",
  "Unused invitation revoked. This does not deactivate a signed-in account.":
    "已撤回未使用的邀請。這不會停用已登入的帳號。",
  "No invitations.": "沒有邀請。",
  "Load older invitations": "載入較早的邀請",
  "Quota policy records": "額度政策紀錄",
  "Changes begin on a future Monday at 00:00 UTC. Reusing a future feature/date updates that unused policy through the same audited service.":
    "變更會在未來某個週一 00:00 UTC 生效。重複使用相同的未來功能與日期，會透過同一個稽核服務更新該尚未生效的政策。",
  "{feature}: {limit} per week": "{feature}：每週 {limit} 次",
  "From {effectiveFrom} · policy {id}": "自 {effectiveFrom} 起 · 政策 {id}",
  "Load older quota policies": "載入較早的額度政策",
} satisfies Messages;
