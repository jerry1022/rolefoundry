import type { Messages } from "./types";

/**
 * Server messages (`ApplicationError` literals and mapped database failures). The UI shows them
 * with `t(error)`; `npm run i18n:check` scans `src/modules` so a new message needs a key here.
 */
export const errors = {
  "Invalid archive reference.": "無效的封存參考。",
  "Private export storage is temporarily unavailable.": "私人匯出儲存空間暫時無法使用。",
  "The private object exceeds its limit.": "私人物件超過其上限。",
  "Invalid source reference.": "無效的來源參考。",
  "The archive exceeds its limit.": "封存檔超過其上限。",
  "Private archive storage is temporarily unavailable.": "私人封存儲存空間暫時無法使用。",
  "Private export cleanup will be retried.": "私人匯出的清理作業將會重試。",
  "The export cursor is invalid.": "匯出分頁游標無效。",
  "The export query is invalid.": "匯出查詢無效。",
  "The private archive failed its integrity check.": "私人封存檔未通過完整性檢查。",
  "The private archive is no longer available.": "私人封存檔已無法取得。",
  "The export resource is unavailable.": "無法取得匯出資源。",
  "Check the export request or identifier.": "請檢查匯出請求或識別碼。",
  "Account removal will retry when the identity service is available.":
    "身分服務恢復後，將重試移除帳號。",
  "The cleanup reference is outside the accepted account.": "清理參考不屬於已接受的帳號。",
  "Account file cleanup will retry.": "帳號檔案的清理作業將會重試。",
  "Deletion receipts are accepted only in a private request body.":
    "刪除收據只接受放在私人請求內容中。",
  "The account deletion operation is unavailable.": "無法執行帳號刪除作業。",
  "Check the deletion confirmation or private receipt.": "請檢查刪除確認或私人收據。",
  "The history cursor is invalid.": "歷史紀錄分頁游標無效。",
  "The resume cursor is invalid.": "履歷分頁游標無效。",
  "The query is invalid.": "查詢無效。",
  "The resource is unavailable.": "無法取得此資源。",
  "Check the application fields and revision.": "請檢查應徵欄位與版本。",
  "The task is unavailable.": "無法取得此任務。",
  "The assessment is unavailable.": "無法取得此評估。",
  "Check the assessment fields and answers.": "請檢查評估欄位與答案。",
  "The link-check query is invalid.": "連結檢查查詢無效。",
  "The link-check recovery input is invalid.": "連結檢查的恢復輸入無效。",
  "The recipient change is invalid.": "接收者變更無效。",
  "The request is invalid.": "請求無效。",
  "The usage window is invalid.": "使用量區間無效。",
  "The administration cursor is invalid.": "管理分頁游標無效。",
  "The invitation identifier is invalid.": "邀請識別碼無效。",
  "Sign in to continue.": "請登入以繼續。",
  "This operation is not permitted.": "不允許此操作。",
  "A valid invitation is required.": "需要有效的邀請。",
  "Review the current consent policy before continuing.": "繼續之前，請先檢視目前的同意政策。",
  "Current consent is required for this analysis.": "此分析需要你目前的同意。",
  "The weekly analysis limit has been reached.": "已達每週分析上限。",
  "The request conflicts with the current resource version or state.":
    "此請求與資源目前的版本或狀態衝突。",
  "Identity is not configured for this deployment.": "此部署未設定身分服務。",
  "Identity is temporarily unavailable.": "身分服務暫時無法使用。",
  "The request origin is not permitted.": "不允許此請求來源。",
  "The request is too large.": "請求內容過大。",
  "The batch owner or task is no longer available.": "批次的擁有者或任務已無法取得。",
  "The batch cursor is invalid.": "批次分頁游標無效。",
  "Check the approved feed, source and schedule settings.": "請檢查核准的資料源、來源與排程設定。",
  "Select a deployment-approved feed for this source kind.": "請為這種來源選擇部署核准的資料源。",
  "Review the current deployment-approved feed configuration before fetching.":
    "擷取之前，請先檢視目前部署核准的資料源設定。",
  "Check the review fields, target choice and expected revision.":
    "請檢查審查欄位、目標選擇與預期版本。",
  "The source row cannot be rebased.": "無法以新的基準更新此來源資料列。",
  "This decision does not accept replacement metadata.": "此決定不接受替換的中繼資料。",
  "Check the import source, batch identifier and file format.":
    "請檢查匯入來源、批次識別碼與檔案格式。",
  "The source configuration could not be verified.": "無法驗證來源設定。",
  "Check the import settings or resource identifier.": "請檢查匯入設定或資源識別碼。",
  "The page cursor is invalid.": "頁面分頁游標無效。",
  "Use the page cursor with its original filters.": "請搭配原本的篩選條件使用此頁面游標。",
  "The bookmark cursor belongs to another session.": "此收藏分頁游標屬於另一個工作階段。",
  "The job is unavailable.": "無法取得此職缺。",
  "The catalog is not configured for this deployment.": "此部署未設定職缺目錄。",
  "Check the catalog fields and try again.": "請檢查目錄欄位後再試一次。",
  "The course catalog is not configured.": "未設定課程目錄。",
  "Check the learning fields and versions.": "請檢查學習欄位與版本。",
  "Check the matching request and versions.": "請檢查配對請求與版本。",
  "The diagnostics cursor is invalid.": "診斷分頁游標無效。",
  "The diagnostics query is invalid.": "診斷查詢無效。",
  "The diagnostics resource is unavailable.": "無法取得診斷資源。",
  "Replay accepts no query parameters.": "重新執行不接受查詢參數。",
  "The task recovery resource is unavailable.": "無法取得任務恢復資源。",
  "The task identifier is invalid.": "任務識別碼無效。",
  "Choose a recovery reason and a valid request identifier.":
    "請選擇恢復原因並提供有效的請求識別碼。",
  "The deployment no longer approves this feed definition.": "此部署已不再核准這個資料源定義。",
  "The original request is no longer eligible for recovery.": "原始請求已不符合恢復資格。",
  "Check the task filters or resource identifier.": "請檢查任務篩選條件或資源識別碼。",
  "The export exceeds its daily, file or data size limit. No data was truncated.":
    "匯出超過每日、檔案或資料大小上限。沒有任何資料被截斷。",
  "This import exceeds the batch, row or source history limit.":
    "此匯入超過批次、資料列或來源歷史上限。",
  "The tracker has reached its record, event or follow-up limit.":
    "追蹤器已達紀錄、事件或後續提醒的上限。",
  "This resume operation exceeds the document, history or content limit.":
    "此履歷操作超過文件、歷史或內容上限。",
  "Historical versions cannot be overwritten. Create a new confirmed version.":
    "歷史版本無法覆寫。請建立新的已確認版本。",
  "Course prerequisites would form a cycle. Review the required foundations.":
    "課程先修條件會形成循環。請檢查必要的基礎課程。",
  "This learning request exceeds the initial planning or reference limit.":
    "此學習請求超過初始規劃或參考資料的上限。",
  "This analysis is too large. Choose one target role or reduce the profile evidence before refreshing.":
    "此分析規模過大。重新整理前，請選擇一個目標職缺或減少檔案中的證據。",
  "This track needs three reviewed questions before an assessment can start.":
    "此方向需要三題已審查的題目，才能開始評估。",
  "The task inputs changed. Start from the current version.":
    "任務的輸入已變更。請從目前版本開始。",
  "The data changed. Reload before trying again.": "資料已變更。請重新載入後再試一次。",
  "The service is temporarily unavailable.": "服務暫時無法使用。",
  "This service is not configured for this deployment.": "此部署未設定這項服務。",
  "The public catalog is not configured.": "未設定公開目錄。",
  "The verified PDF is unavailable.": "無法取得已驗證的 PDF。",
  "The export exceeds its download limit.": "匯出超過下載上限。",
  "The resume history cursor is invalid.": "履歷歷史分頁游標無效。",
  "The private object reference is invalid.": "私人物件參考無效。",
  "The file exceeds the private storage limit.": "檔案超過私人儲存空間上限。",
  "Private file storage is temporarily unavailable.": "私人檔案儲存空間暫時無法使用。",
  "The private file is unavailable.": "無法取得私人檔案。",
  "The private file exceeds its size limit.": "私人檔案超過大小上限。",
  "Private file cleanup will be retried.": "私人檔案的清理作業將會重試。",
  "The file exceeds the upload limit.": "檔案超過上傳上限。",
  "A resume file is required.": "需要履歷檔案。",
  "The resume resource is unavailable.": "無法取得履歷資源。",
  "Check the resume fields and versions.": "請檢查履歷欄位與版本。",
  "The resume file must be between 1 byte and 5 MiB.":
    "履歷檔案大小必須介於 1 位元組到 5 MiB 之間。",
  "The file type differs from its upload intent.": "檔案類型與上傳時宣告的類型不同。",
  "Stored file verification failed. Create a fresh upload intent.":
    "已儲存的檔案驗證失敗。請重新建立上傳。",
  "The upload authority has expired.": "上傳授權已過期。",
  "The fixed export could not be verified.": "無法驗證固定匯出檔。",
  "The download is unavailable.": "無法下載。",
  "The dictionary is not configured.": "未設定技能辭典。",
  "Check the dictionary fields and try again.": "請檢查辭典欄位後再試一次。",
} satisfies Messages;
