import type { Messages } from "./types";

/** Connected-mode resume workspace and application tracker (private, signed-in screens). */
export const resumeTracking = {
  // Resume workspace
  "PRIVATE SOURCES · CONFIRMED FACTS": "私人來源 · 已確認事實",
  "Express your experience with facts you can stand behind.": "用你站得住腳的事實呈現經歷。",
  "Review extracted statements, save confirmed versions and choose how they fit a target role. Proposals preserve your facts; exports refer to a fixed version.":
    "檢視擷取出的敘述、儲存已確認的版本，並決定如何對應目標職缺。建議會保留你的事實；匯出檔對應固定版本。",
  "The private resume workspace is temporarily unavailable.": "私人履歷工作區暫時無法使用。",
  "Sign in to your private workspace": "登入你的私人工作區",
  "Reload private resume data": "重新載入私人履歷資料",
  "Loading private resume history…": "正在載入私人履歷紀錄…",
  "{count} linked, unreviewed resume claims": "{count} 項已連結、尚未審核的履歷主張",
  "Retry parsing this source": "重新解析這份來源",
  "The source upload is not complete. Choose a new source above or remove this unfinished draft.":
    "來源尚未上傳完成。請在上方選擇新的來源，或移除這份未完成的草稿。",
  "Check resume status": "檢查履歷狀態",
  "Delete this private resume": "刪除這份私人履歷",
  "Automatic status checks paused. You can check again while the worker continues.":
    "自動狀態檢查已暫停。背景處理仍在進行，你可以再次手動檢查。",
  "Delete this source, its confirmed versions, proposals, exports and linked resume claims? Reports based on those claims will be invalidated.":
    "要刪除這份來源及其已確認版本、建議、匯出檔與已連結的履歷主張嗎？以這些主張為依據的報告將會失效。",
  "Delete source and derived data": "刪除來源與衍生資料",
  "Keep this source": "保留這份來源",
  "Targeted review and fixed exports": "針對職缺檢視與固定版本匯出",
  "Resume target role": "履歷目標職缺",
  "Load more resume target roles": "載入更多目標職缺",
  "Suggest a fact-preserving order": "建議保留事實的排序",
  "Create a fixed PDF export": "建立固定版本的 PDF 匯出",
  "Review linked claims in your skill profile": "在技能檔案中檢視已連結的主張",
  "Confirmed version history": "已確認版本紀錄",
  "View version {version}": "檢視版本 {version}",
  "Private proposal history": "私人建議紀錄",
  "historical inputs": "依據舊的輸入",
  "Review proposal": "檢視建議",
  "Export this historical version": "匯出這個歷史版本",
  "Private PDF exports": "私人 PDF 匯出",
  "Each PDF uses its selected confirmed version. Download authority expires and is checked against your session and the source's current access.":
    "每份 PDF 都使用所選的已確認版本。下載授權會過期，並依你的登入狀態與來源目前的存取權限進行檢查。",
  "PDF · version {version}": "PDF · 版本 {version}",
  "PDF · version saved": "PDF · 已儲存版本",
  "Download fixed PDF": "下載固定版本 PDF",
  "Resume access and derived claims were removed. Private file cleanup is continuing in the background.":
    "已移除履歷存取權與衍生主張。私人檔案清理仍在背景進行中。",
  "Resume and derived claims were removed.": "已移除履歷與衍生主張。",

  // Document processing results
  "No extractable text was found. Scanned documents can use the paste-text option.":
    "找不到可擷取的文字。掃描文件可以改用貼上文字的方式。",
  "Use an unencrypted text PDF, or paste the statements you want to review.":
    "請使用未加密的文字型 PDF，或貼上你想檢視的敘述。",
  "This file could not be parsed safely. Its original is retained; try a text PDF/DOCX or paste text.":
    "無法安全解析這個檔案。原始檔仍會保留；請改用文字型 PDF／DOCX，或直接貼上文字。",
  "This document contains unsupported content. Use a plain text PDF/DOCX or the paste option.":
    "這份文件包含不支援的內容。請使用純文字的 PDF／DOCX，或改用貼上文字。",
  "The file or extracted content exceeds the processing limits. Try a smaller source.":
    "檔案或擷取出的內容超過處理上限。請改用較小的來源。",
  "The PDF font cannot represent a character in this version. Review the text before creating another export.":
    "PDF 字型無法呈現這個版本中的某個字元。請先檢查文字，再建立新的匯出檔。",
  "Document processing exceeded its time limit. The original source is unchanged.":
    "文件處理超過時間上限。原始來源沒有任何變更。",
  "The document processor was unavailable. The original source is unchanged.":
    "文件處理服務暫時無法使用。原始來源沒有任何變更。",
  "The result did not pass validation. No partial result was published.":
    "結果未通過驗證，不會發布任何部分結果。",

  // Source upload
  "Choose a PDF or DOCX file no larger than 5 MiB.": "請選擇不超過 5 MiB 的 PDF 或 DOCX 檔案。",
  "Paste the text you want to review.": "請貼上你想檢視的文字。",
  "Add a private source": "新增私人來源",
  "Text PDF or DOCX, up to 5 MiB. Scanned or password-protected documents can use the paste option. Your browser-local demo is imported only if you choose to copy and paste it.":
    "文字型 PDF 或 DOCX，上限 5 MiB。掃描或有密碼保護的文件可以改用貼上文字。瀏覽器本機的示範資料只有在你自行複製貼上時才會匯入。",
  "Resume file": "履歷檔案",
  "Saving private source…": "正在儲存私人來源…",
  "Upload private resume": "上傳私人履歷",
  "Paste text instead": "改為貼上文字",
  "Resume text": "履歷文字",
  "Paste resume text": "貼上履歷文字",
  "Paste only the statements you want to review. This creates a separate private source; it does not replace an uploaded file.":
    "只貼上你想檢視的敘述。這會建立另一份私人來源，不會取代已上傳的檔案。",
  "Create a private text draft": "建立私人文字草稿",

  // Source history
  "Your private sources": "你的私人來源",
  "No saved resume sources yet.": "尚未儲存任何履歷來源。",
  "Open private source": "開啟私人來源",
  "Load more private sources": "載入更多私人來源",

  // Fact review
  "Review and confirm the facts": "檢視並確認事實",
  "Extracted text is a draft. Check each statement, completion state and linked skill. Confirmed links become unreviewed resume claims in your private skill profile; learning goals do not become ability evidence.":
    "擷取出的文字只是草稿。請逐一檢查每項敘述、完成狀態與連結的技能。確認後的連結會成為你私人技能檔案中尚未審核的履歷主張；學習目標不會被當作能力證據。",
  "A newer source version is available. Your unsaved edits are still here. Review it before confirming again.":
    "來源有較新的版本。你尚未儲存的編輯仍保留在這裡，請先檢視再重新確認。",
  "Discard draft and load latest facts": "捨棄草稿並載入最新事實",
  "Load latest confirmed facts": "載入最新已確認事實",
  "Keep this draft for review": "保留這份草稿以便檢視",
  "Keeping this draft allows a new confirmation against the latest revision. Review the current version before replacing its claims.":
    "保留草稿後，可以依最新修訂重新確認。取代現有主張前，請先檢視目前的版本。",
  "Section heading": "區段標題",
  "Resume section heading": "履歷區段標題",
  "Move a statement here to use this section. Empty sections are omitted when confirming.":
    "將敘述移到這裡即可使用這個區段。確認時會略過空白區段。",
  "Statement {number}": "敘述 {number}",
  "Extracted page {page}": "擷取自第 {page} 頁",
  "Extracted text": "擷取的文字",
  "Owner-added statement": "本人新增的敘述",
  "Statement text": "敘述內容",
  "This statement is too long. Split it without dropping its text, or edit it before confirming.":
    "這項敘述太長。請在不刪減文字的情況下拆分，或在確認前先編輯。",
  "Split long statement": "拆分過長的敘述",
  "Statement type": "敘述類型",
  "Statement type {number}": "敘述類型 {number}",
  experience: "工作經歷",
  project: "專案",
  education: "學歷",
  credential: "證照",
  "skill-claim": "技能主張",
  contact: "聯絡資訊",
  other: "其他",
  "Completion state": "完成狀態",
  "Completion state {number}": "完成狀態 {number}",
  Unspecified: "未指定",
  "In progress": "進行中",
  "Learning goal": "學習目標",
  Section: "區段",
  "Section for statement {number}": "敘述 {number} 的區段",
  "Untitled section": "未命名區段",
  "Linked skills (up to 20)": "連結的技能（最多 20 項）",
  "Linked skills {number}": "連結的技能 {number}",
  "Review the extracted source": "檢視擷取的來源",
  "Remove statement": "移除敘述",
  "Add a statement": "新增敘述",
  "Add a section": "新增區段",
  "Removing a linked statement or changing it to a learning goal removes its profile claim and can invalidate reports based on it. Your confirmation creates a new version; it never edits an older one.":
    "移除已連結的敘述或將它改為學習目標，會移除對應的檔案主張，並可能使以它為依據的報告失效。每次確認都會建立新版本，絕不會修改舊版本。",
  "Review empty or oversized statements, section names and skill counts before confirming.":
    "確認前，請檢查空白或過長的敘述、區段名稱與技能數量。",
  "Confirming facts…": "正在確認事實…",
  "Confirm facts and linked claims": "確認事實與連結的主張",
  "Unsaved edits stay in this tab until you confirm or leave.":
    "尚未儲存的編輯會保留在此分頁，直到你確認或離開。",

  // Proposal review
  "Review suggested changes": "檢視建議的變更",
  "This deterministic fallback reorders exact confirmed statements for the target role. It does not write new claims or give an ATS score.":
    "這個固定規則的備用方案只會針對目標職缺，重新排列原封不動的已確認敘述。它不會撰寫新的主張，也不會提供 ATS 分數。",
  "This proposal uses earlier inputs. Create a fresh proposal before accepting changes.":
    "這份建議使用的是較早的輸入。接受變更前，請先建立新的建議。",
  "Your individual choices were saved as a new version.": "你逐項做出的選擇已儲存為新版本。",
  "View accepted version": "檢視已接受的版本",
  "The worker is preparing this proposal.": "系統正在準備這份建議。",
  "No proposal was published. Your confirmed source is unchanged.":
    "沒有發布任何建議。你已確認的來源沒有變更。",
  "Accept this change": "接受這項變更",
  "Use this change": "採用這項變更",
  Before: "變更前",
  After: "變更後",
  "The existing statement order already fits this rule-based suggestion. No wording was invented.":
    "現有的敘述順序已符合這項規則建議，沒有虛構任何措辭。",
  "Save selected changes as a new version": "將選取的變更儲存為新版本",
  "Questions for missing evidence": "補充證據的問題",
  "Suggestion limits": "建議的限制",

  // Confirmed version
  "Confirmed version {version}": "已確認版本 {version}",
  "Saved {date}. This version is immutable. Later edits create separate versions.":
    "儲存於 {date}。這個版本無法修改，之後的編輯會建立新的版本。",
  "Owner-reported complete": "本人回報已完成",
  "Owner-confirmed statement": "本人確認的敘述",

  // Application tracker
  "PRIVATE · MANUAL PROGRESS": "私人 · 手動記錄進度",
  "Track preparation, your reported applications and the next action. Visiting a source never changes a stage.":
    "追蹤準備進度、你回報的應徵與下一步行動。開啟來源連結絕不會變更階段。",
  "The tracker is temporarily unavailable. Retry without changing your draft.":
    "追蹤清單暫時無法使用。請重試，你的草稿不會被變更。",
  "Your account changed. Refresh the private tracker.": "你的帳號已變更，請重新整理私人追蹤清單。",
  "Published roles could not be loaded. Existing tracker records remain available.":
    "無法載入已發布的職缺。現有的追蹤紀錄仍可使用。",
  "Reload published roles if the catalog changed.": "若職缺目錄有變動，請重新載入已發布的職缺。",
  "The record, event history and follow-ups were deleted.": "已刪除這筆紀錄、事件紀錄與後續追蹤。",
  "Refresh private tracker": "重新整理私人追蹤清單",
  "Loading private tracker…": "正在載入私人追蹤清單…",
  "Sign in for your private tracker": "登入以使用私人追蹤清單",
  "Your browser-local demo is not uploaded automatically.": "瀏覽器本機的示範資料不會自動上傳。",
  "Account and sign in": "帳號與登入",
  "Track a published role": "追蹤已發布的職缺",
  "This records preparation as Saved. A closed cycle stays closed until you explicitly create a new one.":
    "這會將準備進度記錄為「已收藏」。已結束的應徵週期會維持結束，直到你明確建立新的週期。",
  "Published role": "已發布的職缺",
  "Role to track": "要追蹤的職缺",
  "No published roles available": "目前沒有已發布的職缺",
  "Show more published roles": "顯示更多已發布的職缺",
  "Track selected role": "追蹤選取的職缺",
  "Selected application record": "選取的應徵紀錄",
  "{company} · cycle {cycle} · {stage} · revision {revision}":
    "{company} · 第 {cycle} 輪 · {stage} · 修訂 {revision}",
  "Preparation only": "僅在準備中",
  "{stage} (user-reported)": "{stage}（本人回報）",
  "Saved job snapshot.": "已儲存的職缺快照。",
  "The catalog currently has this role; verify availability at its source.":
    "職缺目錄目前仍有這個職缺；請到原始來源確認是否仍開放。",
  "This listing is no longer available in the catalog. Your notes and history remain accessible.":
    "職缺目錄中已沒有這則職缺。你的備註與紀錄仍可存取。",
  "Fictional demonstration role": "虛構的示範職缺",
  "Historical source · current link unavailable": "歷史來源 · 目前連結無法使用",
  "The saved source had uncertain availability. A failed check does not prove closure.":
    "儲存時這個來源的開放狀態不確定。檢查失敗不代表職缺已關閉。",
  "Opening a source does not submit an application. No automatic submission or outcome verification occurs.":
    "開啟來源不會送出應徵。系統不會自動送出應徵，也不會驗證結果。",
  "Start a new application cycle": "開始新的應徵週期",
  "Remove this private record": "移除這筆私人紀錄",
  "Deletes this cycle, its private notes, events and follow-ups. It does not delete the independent resume source.":
    "刪除這個週期及其私人備註、事件與後續追蹤，但不會刪除獨立的履歷來源。",
  "Confirm application deletion": "確認刪除應徵紀錄",
  "Confirm record deletion": "確認刪除紀錄",
  "Keep record": "保留紀錄",
  "Delete this record": "刪除這筆紀錄",
  "Tracked roles": "追蹤中的職缺",
  "Your tracked roles": "你追蹤的職缺",
  "{count} loaded record": "已載入 {count} 筆紀錄",
  "{count} loaded records": "已載入 {count} 筆紀錄",
  "more history available": "還有更多紀錄",
  "Choose a role to begin a private record.": "選擇一個職缺，開始建立私人紀錄。",
  "{company} · cycle {cycle} · {stage}": "{company} · 第 {cycle} 輪 · {stage}",
  "listing unavailable": "職缺已下架",
  "Show earlier tracked roles": "顯示較早追蹤的職缺",
  "Refresh tracked roles": "重新整理追蹤的職缺",

  // Application editor
  "Edit tracked role": "編輯追蹤的職缺",
  "Record your progress": "記錄你的進度",
  "Stages are your own report. Saving here sends no application or message. No response does not mean rejection.":
    "階段由你自行回報。在這裡儲存不會送出任何應徵或訊息。沒有回音不代表被拒絕。",
  "This record changed. Your unsaved draft is retained.":
    "這筆紀錄已變更。你尚未儲存的草稿仍會保留。",
  "Load latest saved fields": "載入最新儲存的欄位",
  "Keep draft for review on latest revision": "保留草稿，並依最新修訂檢視",
  Stage: "階段",
  "Application stage": "應徵階段",
  "Private note": "私人備註",
  "Application note": "應徵備註",
  "Submission reference (optional)": "送出參考編號（選填）",
  "Submission reference": "送出參考編號",
  "This is a private reference you supply; it is not independent confirmation.":
    "這是你自行提供的私人參考資訊，並非第三方確認。",
  "Confirmed resume version": "已確認的履歷版本",
  "No version selected": "未選擇版本",
  "{filename} · version {version}": "{filename} · 版本 {version}",
  "Show more resume versions": "顯示更多履歷版本",
  "Save application record": "儲存應徵紀錄",
  "View selected fixed resume version ↗": "檢視選取的固定履歷版本 ↗",
  "Deleting that source removes this link. Tracking keeps no copy of its statements.":
    "刪除該來源會移除這個連結。追蹤清單不會保留其敘述的副本。",

  // Follow-ups
  "Choose an existing date and time in your device timezone.":
    "請選擇在你裝置時區中存在的日期與時間。",
  "The record changed. Review the current tasks before saving this draft.":
    "紀錄已變更。儲存這份草稿前，請先檢視目前的待辦事項。",
  "Use latest revision for this draft": "讓這份草稿使用最新修訂",
  "Next step": "下一步",
  "Edit next step": "編輯下一步",
  "Due date and time": "截止日期與時間",
  "Edit due date and time": "編輯截止日期與時間",
  "Save follow-up": "儲存後續追蹤",
  "Add follow-up": "新增後續追蹤",
  "Cancel follow-up edit": "取消編輯後續追蹤",
  "Follow-up tasks": "後續追蹤事項",
  "Next actions": "下一步行動",
  "Dates use your device timezone and are stored in UTC. These are private reminders on this page; no email or calendar messages are sent.":
    "日期依你的裝置時區顯示，並以 UTC 儲存。這些只是此頁面上的私人提醒，不會寄送任何電子郵件或行事曆通知。",
  "No next action recorded.": "尚未記錄下一步行動。",
  Open: "未完成",
  Overdue: "已逾期",
  "Edit follow-up": "編輯後續追蹤",
  "Remove follow-up": "移除後續追蹤",
  "Confirm follow-up removal": "確認移除後續追蹤",
  "Remove this follow-up?": "要移除這項後續追蹤嗎？",
  "Keep follow-up": "保留後續追蹤",

  // Event history
  "Application event history": "應徵事件紀錄",
  "Your record history": "你的紀錄歷程",
  "Every stage is manually reported. Edits and follow-ups do not imply an application was submitted.":
    "每個階段都是手動回報。編輯與後續追蹤不代表已送出應徵。",
  "{from} → {to} (user-reported)": "{from} → {to}（本人回報）",
  "Tracked as Saved": "已追蹤並標為「已收藏」",
  "Deleted resume source unlinked": "已解除與已刪除履歷來源的連結",
  "Follow-up updated": "已更新後續追蹤",
  "Private fields updated": "已更新私人欄位",
  "revision {revision}": "修訂 {revision}",
  "Your reference: {reference}": "你的參考編號：{reference}",
  "Loading history…": "正在載入紀錄…",
  "Show earlier events": "顯示較早的事件",
  "Refresh event history": "重新整理事件紀錄",
  // Optional AI wording suggestions.
  "AI wording is not enabled on this deployment. Your allowance was returned.":
    "此部署未啟用 AI 措辭建議，額度已退還。",
  "No statement was long enough to reword. Your allowance was returned.":
    "沒有足夠長的陳述需要改寫，額度已退還。",
  "Permission was withdrawn before AI wording ran.": "AI 措辭建議執行前同意已撤回。",
  "The suggestions changed facts or numbers, so none are shown.":
    "建議內容更動了事實或數字，因此不予顯示。",
  "AI wording could not complete. The order proposal is still available.":
    "AI 措辭建議未能完成，順序建議仍可使用。",
  "AI wording suggestions": "AI 措辭建議",
  "Each suggestion rewrites one confirmed statement without adding facts or numbers. Use one to edit your draft, check it, then confirm a new version.":
    "每則建議只改寫一項已確認的陳述，不會新增事實或數字。套用到草稿、檢查後，再確認為新版本。",
  "Use in my draft": "套用到我的草稿",
  "Your statements already read clearly; no rewording suggested.":
    "你的陳述已經很清楚，沒有需要改寫的建議。",
  "Your weekly AI allowance is used up; the order proposal was still created.":
    "本週 AI 額度已用完；仍已建立順序建議。",
  "AI wording needs your resume analysis permission in Account & privacy; the order proposal was still created.":
    "AI 措辭建議需要你在「帳號與隱私」中同意履歷分析；仍已建立順序建議。",
  "Confirmed version {version}. Order suggestions reorder existing statements. Optional AI wording is only a suggestion until you edit and confirm it.":
    "已確認版本 {version}。順序建議只會重新排列既有陳述；選用的 AI 措辭在你編輯並確認前都只是建議。",
  "Also suggest clearer wording with AI": "同時以 AI 建議更清楚的措辭",
  "Needs your resume analysis permission and uses one weekly allowance. Suggestions keep every fact and number, and change nothing until you confirm.":
    "需要你的履歷分析同意，並使用一次每週額度。建議會保留所有事實與數字，在你確認前不會更動任何內容。",
  "Suggestion added to your draft. Review it, then confirm a new version.":
    "已將建議加入草稿，請檢查後再確認為新版本。",
} satisfies Messages;
