import type { Messages } from "./types";

/** Source imports, approved feeds, source registration and publication review (administrators). */
export const ingestionAdmin = {
  // Import workspace
  "allowed hosts: {hosts}": "允許的主機：{hosts}",
  "Permitted fields: {fields}": "授權欄位：{fields}",
  "Enable authorized uploads for {name}": "啟用「{name}」的授權上傳",
  "Allow explicit closure for {name}": "允許「{name}」明確關閉職缺",
  "Save settings for {name}": "儲存「{name}」的設定",
  "The import workspace is temporarily unavailable. Your upload draft is still here.":
    "匯入工作區暫時無法使用，你的上傳草稿仍保留在這裡。",
  "The import exceeds 2 MiB. Split it into smaller batches.":
    "匯入內容超過 2 MiB，請拆成較小的批次。",
  "Source import administration": "來源匯入管理",
  "Source imports and publication review": "來源匯入與發布審核",
  "Upload authorized job or course metadata, inspect the proposed changes and record a publication decision. Uploads never publish automatically.":
    "上傳已授權的職缺或課程中繼資料，檢視提議的變更並記錄發布決定。上傳內容絕不會自動發布。",
  "Reload import workspace": "重新載入匯入工作區",
  "Administrator access is required.": "需要管理員權限。",
  "Authorized source settings ({count})": "授權來源設定（{count}）",
  "No authorized sources are configured. Create and review a source policy before enabling uploads.":
    "尚未設定任何授權來源。啟用上傳前，請先建立並審核來源政策。",
  "Upload a source batch": "上傳來源批次",
  "Up to 100 records and 2 MiB. Keep a stable batch identifier when retrying the same file. Missing fields preserve curated values; explicit null clears a field.":
    "最多 100 筆紀錄、2 MiB。重試同一個檔案時請沿用相同的批次識別碼。缺少的欄位會保留已編修的值；明確填入 null 則會清除該欄位。",
  "Authorized source": "授權來源",
  "Import source": "匯入來源",
  "Choose an enabled source": "選擇已啟用的來源",
  "Permitted fields: {fields}. Original links must use {hosts}.":
    "授權欄位：{fields}。原始連結必須使用 {hosts}。",
  "Batch identifier": "批次識別碼",
  "Import batch identifier": "匯入批次識別碼",
  "File format": "檔案格式",
  "Import format": "匯入格式",
  "Choose a local import file": "選擇本機匯入檔案",
  "Import file": "匯入檔案",
  "Choose a file no larger than 2 MiB.": "請選擇不超過 2 MiB 的檔案。",
  "The decoded file exceeds 2 MiB.": "解碼後的檔案超過 2 MiB。",
  "Import content": "匯入內容",
  "File structure": "檔案結構",
  "JSON uses a records array. Each record has externalId, url, state (active or closed) and fields containing only permitted metadata. CSV uses externalId,url,state and permitted metadata columns; structured cells contain JSON. A blank CSV cell means missing, and null means an explicit clear.":
    "JSON 使用 records 陣列，每筆紀錄包含 externalId、url、state（active 或 closed），以及只含授權中繼資料的 fields。CSV 使用 externalId,url,state 與授權的中繼資料欄位；結構化儲存格內容為 JSON。CSV 空白儲存格代表缺少，null 代表明確清除。",
  "Queue import for review": "將匯入排入審核",
  "Import batch history": "匯入批次紀錄",
  "Refresh batches and settings": "重新整理批次與設定",
  "No batches yet.": "目前還沒有批次。",
  "{total} records · {rejected} rejected": "{total} 筆紀錄 · {rejected} 筆遭拒",
  "Open batch {id}": "開啟批次 {id}",
  "Load older import batches": "載入較早的匯入批次",
  "Selected import batch": "選取的匯入批次",
  "Batch {id}": "批次 {id}",
  "{total} records · {items} review items · {rejected} rejected":
    "{total} 筆紀錄 · {items} 個審核項目 · {rejected} 筆遭拒",
  "Source permissions or settings changed after submission.": "提交後來源的授權或設定已變更。",
  "Processing stopped: {code}. Review source settings before creating a new batch.":
    "處理已停止：{code}。建立新批次前，請先檢查來源設定。",
  "Refresh selected batch": "重新整理選取的批次",
  "Automatic polling paused. Refresh to resume checking.": "已暫停自動輪詢，重新整理即可繼續檢查。",
  "Rejected input rows": "遭拒的輸入列",
  "Row {position} · {id}:": "第 {position} 列 · {id}：",
  unidentified: "未識別",
  "Row {position}: {id}": "第 {position} 列：{id}",
  "{count} changes": "{count} 項變更",
  "Review row {position}": "審核第 {position} 列",

  // Approved feeds and schedules
  "Source {status}. Next scheduled check: {time}.": "來源狀態：{status}。下次排程檢查：{time}。",
  "not scheduled": "尚未排程",
  "Automatic retrieval is paused for operator review. Reported provider wait: {wait} seconds. Earliest retry: {retry}.":
    "自動擷取已暫停，等待營運人員審核。提供者回報的等待時間：{wait} 秒。最早可重試時間：{retry}。",
  "requires review": "需要審核",
  "Last retrieval issue: {issue}. Published metadata is retained; availability may be uncertain.":
    "上次擷取問題：{issue}。已發布的中繼資料會保留，但開放狀態可能不確定。",
  "The approved feed definition changed or is unavailable. Review and save the current configuration before fetching.":
    "核准的資料來源定義已變更或無法使用。擷取前請檢查並儲存目前的設定。",
  "Approved feed for {name}": "「{name}」的核准資料來源",
  "Select an approved feed": "選擇核准的資料來源",
  "Enable scheduled retrieval for {name}": "啟用「{name}」的排程擷取",
  "Refresh interval for {name} (minutes)": "「{name}」的更新間隔（分鐘）",
  "Refresh interval for {name}": "「{name}」的更新間隔",
  "Resume after reviewing the provider wait for {name}":
    "已檢查「{name}」提供者的等待時間，恢復擷取",
  "Saving assigns this schedule to your administrator account. Revoked sources and inactive owners are skipped. A reported provider wait cannot be resumed early.":
    "儲存後，這個排程會歸屬於你的管理員帳號。已撤銷的來源和停用的擁有者會被略過。提供者回報的等待時間無法提前恢復。",
  "Save feed settings for {name}": "儲存「{name}」的資料來源設定",
  "Fetch approved feed for {name}": "擷取「{name}」的核准資料來源",
  "The feed request or refresh could not be completed. Refresh saved runs before retrying.":
    "無法完成資料來源請求或重新整理。重試前請先重新整理已儲存的執行紀錄。",
  "Approved feed administration": "核准資料來源管理",
  "Approved remote feeds and schedules": "核准的遠端資料來源與排程",
  "Fetch only deployment-approved feeds. Retrieved data becomes a batch for review; it is never published automatically. Missing rows do not close existing records.":
    "只擷取部署環境核准的資料來源。擷取的資料會成為待審核的批次，絕不會自動發布；缺少的資料列也不會關閉既有紀錄。",
  "Loading feed settings…": "正在載入資料來源設定…",
  "No approved feeds are available on this deployment. An operator must register an authorized feed before retrieval can be enabled.":
    "這個部署環境沒有可用的核准資料來源。營運人員必須先登記授權的資料來源，才能啟用擷取。",
  "Refresh approved feeds and runs": "重新整理核准資料來源與執行紀錄",
  "Recent feed runs": "最近的資料來源執行紀錄",
  "No retrieval runs yet.": "目前還沒有擷取紀錄。",
  "Inspect feed run {id}": "檢視資料來源執行 {id}",
  "Open fetched batch {id}": "開啟擷取的批次 {id}",
  "Selected feed run": "選取的資料來源執行",
  "Retrieval issue: {code}": "擷取問題：{code}",
  "Automatic checking paused. Inspect the run to resume.": "已暫停自動檢查，檢視這次執行即可繼續。",
  "Review fetched batch": "審核擷取的批次",

  // Record review
  "The review could not be saved. Your edits are still here.":
    "無法儲存審核結果，你的編輯內容仍保留在這裡。",
  "Explain this review decision before saving.": "儲存前請說明這項審核決定。",
  "Check the reviewed metadata: {issues}": "請檢查審核後的中繼資料：{issues}",
  "Saved {decision}. Publication reference: {id}": "已儲存 {decision}。發布參考編號：{id}",
  "Import record review": "匯入紀錄審核",
  "Review source record {id}": "審核來源紀錄 {id}",
  "Preview {version}": "預覽 {version}",
  "Source ID: {id}.": "來源 ID：{id}。",
  "Open original source": "開啟原始來源",
  "This preview needs attention: {reasons}. Rebuild a current preview before publishing. Superseded rows can only be rejected.":
    "這份預覽需要注意：{reasons}。發布前請重建最新預覽；已被取代的資料列只能拒絕。",
  "source permissions or settings changed": "來源授權或設定已變更",
  "skill dictionary changed": "技能字典已變更",
  "catalog target changed": "目錄目標已變更",
  "a newer source batch supersedes this row": "較新的來源批次已取代這一列",
  "Recorded decision: {decision} · reference {id}": "已記錄的決定：{decision} · 參考編號 {id}",
  "Source changes ({count})": "來源變更（{count}）",
  Field: "欄位",
  "Previous value": "先前的值",
  "Source proposal": "來源提議",
  "Unknown / absent": "未知／未提供",
  "needs correction": "需要修正",
  "Unmapped source skills: {skills}. Review canonical mappings before publishing.":
    "未對應的來源技能：{skills}。發布前請審核標準技能對應。",
  "Catalog target": "目錄目標",
  "Import catalog target": "匯入目錄目標",
  "Create a separate catalog record": "建立獨立的目錄紀錄",
  "Current linked record": "目前連結的紀錄",
  "Potential duplicate": "可能重複",
  "Choosing a target takes effect only after rebuilding the preview. Rebuilding or reloading replaces unsaved editorial edits with the new source proposal.":
    "選擇的目標要在重建預覽後才會生效。重建或重新載入會以新的來源提議取代尚未儲存的編輯內容。",
  "Rebuilt preview. Review the new differences before deciding.":
    "已重建預覽。做決定前請先檢視新的差異。",
  "Rebuild preview and discard unsaved edits": "重建預覽並捨棄未儲存的編輯",
  "Reviewed publication metadata": "審核後的發布中繼資料",
  "I reviewed the possible duplicates and intend to create a separate record.":
    "我已檢查可能重複的紀錄，並確定要建立獨立紀錄。",
  "Review decision reason": "審核決定原因",
  "Import decision reason": "匯入決定原因",
  "Publish reviewed metadata": "發布審核後的中繼資料",
  "Confirm unchanged record": "確認紀錄未變更",
  "Confirm explicit source closure": "確認來源明確關閉",
  "Reject source proposal": "拒絕來源提議",
  "Reloaded saved preview; unsaved edits were discarded.":
    "已重新載入儲存的預覽，未儲存的編輯已捨棄。",
  "Reload review and discard unsaved edits": "重新載入審核並捨棄未儲存的編輯",

  // Reviewed metadata editor
  "Role title": "職缺名稱",
  Company: "公司",
  "Editorial summary": "編輯摘要",
  "Disclosed salary": "公開薪資",
  Minimum: "最低",
  Maximum: "最高",
  "Currency (ISO code)": "幣別（ISO 代碼）",
  "Pay period": "計薪週期",
  Responsibility: "工作內容",
  Requirement: "條件",
  "Requirement text": "條件內容",
  "Canonical skill IDs": "標準技能 ID",
  "Skill ID": "技能 ID",
  "Employment conditions": "聘僱條件",
  "Required years of experience": "要求年資",
  "Expiry (ISO timestamp with timezone)": "到期時間（含時區的 ISO 時間戳記）",
  "Prerequisite skill IDs": "先備技能 ID",
  "Prerequisite course IDs": "先修課程 ID",
  "Course ID": "課程 ID",
  "Official study minutes": "官方學習分鐘數",
  "Editorial study minutes": "編輯估計學習分鐘數",
  "Duration basis and uncertainty": "時長依據與不確定性",
  "Independent practice": "自主練習",
  "Practice prompt": "練習題目",
  "Completion criteria": "完成標準",
  "Include {field}": "包含{field}",
  "Remove {item}": "移除{item}",
  Remove: "移除",
  "Add {field}": "新增{field}",
  "Unknown / undisclosed": "未知／未公開",
  "Choose a value": "選擇一個值",
  "Enter a number": "輸入數字",
  "Enter reviewed metadata": "輸入審核後的中繼資料",

  // Job source registration
  "Register a job metadata source": "登記職缺中繼資料來源",
  "Complete the source policy, use lowercase hostnames without paths, and select the fields you are authorized to publish.":
    "請填寫完整的來源政策，主機名稱使用小寫且不含路徑，並勾選你獲授權發布的欄位。",
  "Record the publisher and your authorization basis before enabling uploads. Source registration does not verify or grant rights.":
    "啟用上傳前，請記錄發布者與你的授權依據。登記來源並不會驗證或授予權利。",
  "For course sources, use {link} to select an approved provider.":
    "課程來源請到{link}選擇核准的提供者。",
  "course administration": "課程管理",
  "Job source name": "職缺來源名稱",
  "Job source publisher": "職缺來源發布者",
  "Job source authorization basis (private)": "職缺來源授權依據（不公開）",
  "Job source public rights summary": "職缺來源公開權利摘要",
  "Allowed source hostnames": "允許的來源主機名稱",
  "Job source allowed hostnames": "職缺來源允許的主機名稱",
  "Permitted job metadata fields": "授權的職缺中繼資料欄位",
  "This source contains fictional demonstration metadata": "這個來源包含虛構的示範中繼資料",
  "Register job source with uploads disabled": "登記職缺來源（上傳預設停用）",
} satisfies Messages;
