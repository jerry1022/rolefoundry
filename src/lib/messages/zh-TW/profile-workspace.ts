import type { Messages } from "./types";

/**
 * Connected-mode screens: the private career profile and its evidence, the shared skill
 * dictionary and its administration, and the published job catalog with saved roles.
 */
export const profileWorkspace = {
  // Career profile
  "YOUR PRIVATE CAREER PROFILE": "你的私人職涯檔案",
  "Claims, context and evidence.": "主張、脈絡與證據。",
  "Keep your preferences and evidence together. A missing skill record means unknown, and course completion does not prove ability.":
    "把你的偏好與證據放在一起。沒有技能紀錄代表「未知」，完成課程也不等於證明了能力。",
  "This profile is saved to your signed-in account. Other career pages currently use the local demo; its data is uploaded only through the optional reviewed import below.":
    "這份檔案會儲存到你已登入的帳號。其他職涯頁面目前仍使用本機示範；示範資料只會透過下方可選、經你確認的匯入上傳。",
  "View the shared skill dictionary ↗": "查看共用技能詞典 ↗",
  "Loading your private profile…": "正在載入你的私人檔案…",
  "Unable to load the profile. Try again.": "無法載入檔案，請再試一次。",
  "The dictionary changed. Reload before continuing.": "技能詞典已變更，請重新載入後再繼續。",
  "Your profile changed during loading. Reload to continue.":
    "你的檔案在載入期間有所變更，請重新載入以繼續。",
  "Sign in to your account": "登入你的帳號",
  "Reload profile": "重新載入檔案",
  "Evidence saved. Recommendations using an older profile revision need refreshing.":
    "證據已儲存。依據舊版檔案產生的建議需要重新整理。",
  "Preferences saved. Previous recommendations need refreshing.":
    "偏好已儲存。先前的建議需要重新整理。",
  "Evidence and its history deleted. Dependent recommendations need refreshing.":
    "證據及其歷史紀錄已刪除。依賴它的建議需要重新整理。",
  "Reviewed demo preferences and skill claims imported. Other local data remains in this browser.":
    "已匯入確認過的示範偏好與技能主張。其他本機資料仍保留在這個瀏覽器中。",
  "How evidence is interpreted": "證據如何解讀",
  "Self-reports are your own claims.": "自評是你自己的主張。",
  "Portfolio links are references; their contents are not fetched or reviewed.":
    "作品集連結僅作為參考，我們不會擷取或審查其內容。",
  "Scenario responses retain their question and rubric versions.":
    "情境作答會保留對應的題目與評分標準版本。",
  "Resume claims require source confirmation before their producing service records them.":
    "履歷主張須先確認來源，產生它的服務才會記錄。",
  "Edits create new versions; previous versions remain visible until deletion.":
    "編輯會建立新版本；舊版本在刪除前仍可查看。",
  "Current profile revision: {revision}. Updated {date}.":
    "目前檔案修訂版本：{revision}。更新於 {date}。",
  "Current profile revision: {revision}. Updated after your first save.":
    "目前檔案修訂版本：{revision}。第一次儲存後才會有更新時間。",
  "Capability evidence": "能力證據",
  "Evidence is private. A wrong scenario answer does not erase previous experience.":
    "證據是私人的。情境題答錯並不會抹去你過去的經驗。",
  "Add claim or reference": "新增主張或參考資料",
  "No evidence recorded yet": "尚未記錄任何證據",
  "Add a self-report or portfolio reference. We do not turn course progress into verified skills.":
    "新增一筆自評或作品集參考資料。我們不會把課程進度當成已驗證的技能。",
  "Load more evidence": "載入更多證據",

  // Preferences
  "Career preferences": "職涯偏好",
  "Saved privately to this account. Revision {revision}.":
    "以私人方式儲存在這個帳號。修訂版本 {revision}。",
  "Display name": "顯示名稱",
  "Preferred workplaces": "偏好的工作型態",
  "Save preferences": "儲存偏好",

  // Evidence cards and form
  "Self-report": "自評",
  "Portfolio reference": "作品集參考",
  "Scenario response": "情境作答",
  "Resume claim": "履歷主張",
  "Version {version}": "版本 {version}",
  "Observed {date} · Source {source}": "觀察日期 {date} · 來源 {source}",
  "Observed {date} · Source {source} · Rubric {rubric}":
    "觀察日期 {date} · 來源 {source} · 評分標準 {rubric}",
  "View confirmed resume source": "查看已確認的履歷來源",
  "Self-reported experience: {level}/3. This is a claim.": "自評經驗：{level}/3。這是一項主張。",
  "Open portfolio reference ↗": "開啟作品集參考 ↗",
  "Unable to load evidence history.": "無法載入證據歷史紀錄。",
  "View history": "查看歷史紀錄",
  "Edit evidence": "編輯證據",
  "Delete evidence": "刪除證據",
  "Delete this evidence and all its versions? Recommendations based on it will need refreshing.":
    "要刪除這筆證據及其所有版本嗎？依據它產生的建議將需要重新整理。",
  "Confirm deletion": "確認刪除",
  "Evidence history": "證據歷史紀錄",
  "Close history": "關閉歷史紀錄",
  "Revise evidence": "修訂證據",
  "Add a claim or reference": "新增主張或參考資料",
  "A self-report or URL does not verify mastery. Scored evidence is created by its source service.":
    "自評或網址並不能驗證熟練度。已評分的證據由其來源服務建立。",
  "Deselect deprecated skills and choose a current skill before saving.":
    "儲存前請取消勾選已停用的技能，並選擇目前有效的技能。",
  "Choose at least one skill and check the fields. Portfolio references require HTTPS without credentials.":
    "請至少選擇一項技能並檢查各欄位。作品集參考必須使用 HTTPS，且網址中不可包含帳密。",
  "Evidence type": "證據類型",
  "Evidence label": "證據標題",
  Context: "脈絡",
  "Observation date": "觀察日期",
  "Related skills": "相關技能",
  "Self-reported experience": "自評經驗",
  Exploring: "探索中",
  "Practiced with guidance": "在指導下練習過",
  "Applied independently": "能獨立應用",
  "Applied in several contexts": "已在多種情境中應用",
  "Portfolio URL": "作品集網址",
  "Save evidence version": "儲存證據版本",
  "Add evidence": "新增證據",
  Cancel: "取消",

  // Demo import
  "Bring selected demo data into this account": "將選取的示範資料帶入這個帳號",
  "Optional, available only before the first account edit. Review what will be sent. Resume drafts, bookmarks, local scenario results and tracker notes are excluded.":
    "此步驟可選，且僅在第一次編輯帳號前提供。請先確認將傳送的內容；履歷草稿、收藏、本機情境結果與追蹤筆記不會包含在內。",
  "No compatible saved demo was found, or browser storage is unavailable.":
    "找不到相容的已儲存示範資料，或瀏覽器儲存空間無法使用。",
  "Preview demo import": "預覽示範匯入",
  Name: "名稱",
  Direction: "方向",
  "Skills to import as self-reports": "將以自評匯入的技能",
  "I approve uploading these preferences and self-reported skills to my account.":
    "我同意將這些偏好與自評技能上傳到我的帳號。",
  "Import reviewed data": "匯入已確認的資料",

  // Skill dictionary
  "STABLE IDS · REVIEWED MEANING": "穩定 ID · 經審核的定義",
  "SHARED SKILL IDS": "共用技能 ID",
  "The shared language of skills.": "技能的共同語言。",
  "Explore canonical concepts, exact aliases and their versions. Related concepts and completed courses do not automatically prove ability.":
    "探索標準概念、精確別名及其版本。相關概念與已完成的課程不會自動證明能力。",
  "This static demo uses a small seed vocabulary. A configured server provides the reviewed bilingual dictionary, aliases and immutable versions.":
    "這個靜態示範只使用一小組種子詞彙。設定好的伺服器會提供經審核的雙語詞典、別名與不可變更的版本。",
  "Demo skill vocabulary": "示範技能詞彙",
  "Live lookup and administration are unavailable in the static demo.":
    "靜態示範無法使用即時查詢與管理功能。",
  "My private skill profile": "我的私人技能檔案",
  "Unable to load the dictionary. Try again.": "無法載入技能詞典，請再試一次。",
  "Reload current dictionary": "重新載入目前的詞典",
  "Loading the skill dictionary…": "正在載入技能詞典…",
  "Dictionary version published. Results based on an older dictionary need refreshing.":
    "詞典版本已發布。依據舊版詞典產生的結果需要重新整理。",
  "Dictionary version {version}": "詞典版本 {version}",
  "Historical snapshot; editing is disabled.": "歷史快照，無法編輯。",
  "Published current snapshot.": "已發布的目前快照。",
  "Updated {date}.": "更新於 {date}。",
  "Add canonical skill": "新增標準技能",
  "Historical version": "歷史版本",
  "Historical dictionary version": "歷史詞典版本",
  "View snapshot": "查看快照",
  "Current version": "目前版本",
  "Resolve an exact term": "解析精確詞彙",
  "Unresolved and ambiguous terms need review; this lookup does not guess with semantic similarity.":
    "無法解析與有歧義的詞彙需要人工審核；此查詢不會依語意相似度猜測。",
  Term: "詞彙",
  "Skill term": "技能詞彙",
  "Resolution language": "解析語言",
  "Any language; show ambiguity": "不限語言（顯示歧義）",
  English: "英文",
  "Traditional Chinese": "繁體中文",
  "Resolve term": "解析詞彙",
  "Resolved: {skill}": "已解析：{skill}",
  "Ambiguous term; choose a language or review the candidates.":
    "詞彙有歧義，請選擇語言或檢視候選項目。",
  "No approved exact mapping. Keep this term unmapped for review.":
    "沒有經核准的精確對應。請保留此詞彙為未對應，等待審核。",
  "Normalized term: {term} · Dictionary {version}": "正規化詞彙：{term} · 詞典 {version}",
  "Retained ID {from} redirects to {to}.": "保留的 ID {from} 會重新導向至 {to}。",
  "Filter skill concepts": "篩選技能概念",
  "Redirects to {skill} ({id}).": "重新導向至 {skill}（{id}）。",
  "Edit {skill}": "編輯 {skill}",
  "Edit labels": "編輯名稱",
  "Reviewed relationships and track mappings": "經審核的關係與方向對應",
  "No reviewed relationships published yet.": "尚未發布任何經審核的關係。",
  "Priority {priority}": "優先順序 {priority}",

  // Dictionary administration
  "Dictionary administration": "詞典管理",
  "Publishing creates an immutable snapshot and an audit event. Existing source evidence remains available under its original dictionary version.":
    "發布會建立不可變更的快照與一筆稽核事件。既有的來源證據仍會保留在原本的詞典版本下。",
  "Remove an incorrect mapping": "移除錯誤的對應",
  "Removal reason": "移除原因",
  "Mapping removal reason": "對應移除原因",
  "Remove alias: {alias} ({locale})": "移除別名：{alias}（{locale}）",
  "Remove {parent} → {child} ({relation})": "移除 {parent} → {child}（{relation}）",
  "Remove {skill} from {track}": "從 {track} 移除 {skill}",
  "Edit skill labels": "編輯技能名稱",
  "Create a canonical skill": "建立標準技能",
  "Stable skill ID": "穩定技能 ID",
  "English name": "英文名稱",
  "Traditional Chinese name": "繁體中文名稱",
  Description: "說明",
  "Skill description": "技能說明",
  Status: "狀態",
  "Skill status": "技能狀態",
  Active: "使用中",
  "Deprecated; retain history": "已停用（保留歷史紀錄）",
  "Change reason": "變更原因",
  "Skill change reason": "技能變更原因",
  "Publish label update": "發布名稱更新",
  "Publish new skill": "發布新技能",
  "Approve an exact alias": "核准精確別名",
  "Language-specific aliases are unique. Cross-language ambiguity stays unresolved until a language is chosen.":
    "各語言的別名皆不重複。跨語言的歧義在選定語言前會維持未解析。",
  "Alias skill": "別名所屬技能",
  "Alias language": "別名語言",
  Alias: "別名",
  "Alias term": "別名詞彙",
  Reason: "原因",
  "Alias change reason": "別名變更原因",
  "Publish alias": "發布別名",
  "Set a reviewed relationship": "設定經審核的關係",
  "A prerequisite comes before its dependent skill. A broader concept does not prove each child skill.":
    "先備技能排在依賴它的技能之前。較廣的概念並不能證明其下每一項子技能。",
  "Parent skill": "上層技能",
  "Child skill": "下層技能",
  Relationship: "關係",
  "Prerequisite → dependent": "先備 → 依賴",
  "Broader → narrower": "較廣 → 較窄",
  "Relationship change reason": "關係變更原因",
  "Publish relationship": "發布關係",
  "Map a career track": "對應職涯方向",
  "Priority 1 is highest. This editorial mapping does not assign proficiency to a person.":
    "優先順序 1 為最高。這項編輯對應不代表任何人的熟練程度。",
  "Dictionary track": "詞典職涯方向",
  "Track skill": "方向技能",
  Priority: "優先順序",
  "Track priority": "方向優先順序",
  "Track change reason": "方向變更原因",
  "Publish track mapping": "發布方向對應",
  "Merge equivalent concepts": "合併等義概念",
  "The source ID becomes a permanent redirect. Historical dictionary/evidence versions stay unchanged; current joins move to the target. Relationships that would form a cycle are rejected.":
    "來源 ID 會成為永久重新導向。歷史詞典與證據版本保持不變；目前的關聯會移到目標概念。會形成循環的關係將被拒絕。",
  "Source concept": "來源概念",
  "Merge source": "合併來源",
  "Target concept": "目標概念",
  "Merge target": "合併目標",
  "Merge reason": "合併原因",
  "I reviewed both concepts and their relationships.": "我已檢視這兩個概念及其關係。",
  "Merge reviewed concepts": "合併已檢視的概念",

  // Job catalog
  "PUBLISHED ROLES · TRACEABLE SOURCES": "已發布職缺 · 來源可追溯",
  "Browse published AI roles without an account. Sources and unknown requirements stay visible; this catalog does not claim complete market coverage.":
    "不需帳號即可瀏覽已發布的 AI 職缺。來源與未知條件都會清楚標示；本目錄不宣稱涵蓋完整市場。",
  "Browse roles": "瀏覽職缺",
  "My saved roles": "我收藏的職缺",
  "Unable to load the catalog. Try again.": "無法載入職缺目錄，請再試一次。",
  "Check the search fields and try again.": "請檢查搜尋欄位後再試一次。",
  "Saved role removed.": "已移除收藏的職缺。",
  "Role saved privately to your account. No application was sent.":
    "職缺已以私人方式收藏到你的帳號，並未送出任何應徵。",
  "Sign in to save roles": "登入以收藏職缺",
  "Reload catalog": "重新載入目錄",
  "Title, company, skills or specialization": "職稱、公司、技能或專業方向",
  Location: "地點",
  Level: "職級",
  "Any level": "不限職級",
  Intern: "實習",
  Entry: "入門",
  Mid: "中階",
  Lead: "主管級",
  "Search published roles": "搜尋已發布職缺",
  "Reset filters": "重設篩選",
  "Published job results": "已發布職缺結果",
  "Loading published roles…": "正在載入已發布職缺…",
  "No published roles match these filters": "沒有符合這些篩選條件的已發布職缺",
  "Try broader filters. Career guides stay available even when a specialization has no published opening.":
    "試試放寬篩選條件。即使某個專業方向沒有已發布職缺，職涯指南仍可查看。",
  "Load more roles": "載入更多職缺",
  "Save role": "收藏職缺",
  "Workplace not specified": "未註明工作型態",
  "Location not specified": "未註明地點",
  "Level not specified": "未註明職級",
  "Demonstration listing": "示範職缺",
  "Freshness uncertain": "時效不確定",
  "Unknown lower bound": "下限未知",
  "Unknown upper bound": "上限未知",
  hour: "小時",
  month: "月",
  year: "年",
  "Salary undisclosed": "薪資未公開",
  "{count} permitted source · Requirements distinguish mandatory from preferred.":
    "{count} 個授權來源 · 條件已區分必要與加分項目。",
  "{count} permitted sources · Requirements distinguish mandatory from preferred.":
    "{count} 個授權來源 · 條件已區分必要與加分項目。",

  // Job details
  "Close job details": "關閉職缺詳細資訊",
  Close: "關閉",
  "Compare with my evidence": "與我的證據比較",
  Responsibilities: "工作內容",
  Requirements: "條件",
  "Unknown / not supplied": "未知／未提供",
  "{years} years stated by the source": "來源註明 {years} 年",
  "Sources and freshness": "來源與時效",
  "Demonstration listing; fictional data": "示範職缺，資料為虛構",
  "The latest check failed; availability is uncertain.": "最近一次檢查失敗，職缺是否仍開放不確定。",
  "Last observed as active; check the original source before applying.":
    "最後一次觀察時仍開放；應徵前請先查看原始來源。",
  "Last successful validation: {date}.": "最後一次成功驗證：{date}。",
  "Last successful validation: Not yet independently validated.":
    "最後一次成功驗證：尚未經過獨立驗證。",
  "Opening a link or saving this role does not submit an application. No hiring probability is implied. Job version {version}.":
    "開啟連結或收藏這個職缺都不會送出應徵，也不代表任何錄取機率。職缺版本 {version}。",

  // Saved roles
  "Your saved roles": "你收藏的職缺",
  "Private account bookmarks. Retired roles retain their saved title and source reference.":
    "帳號中的私人收藏。已下架的職缺會保留收藏時的職稱與來源參考。",
  "Unable to load saved roles.": "無法載入收藏的職缺。",
  "Sign in to see saved roles": "登入以查看收藏的職缺",
  "Reload saved roles": "重新載入收藏的職缺",
  "Loading saved roles…": "正在載入收藏的職缺…",
  "No saved roles yet": "尚未收藏任何職缺",
  "Browse published openings and save a role to this account.":
    "瀏覽已發布的職缺，並將職缺收藏到這個帳號。",
  "Available in the catalog": "目錄中仍可查看",
  "Retired or unavailable; saved snapshot retained": "已下架或無法取得；保留收藏時的快照",
  "View current role": "查看目前的職缺",
  "Original source ↗": "原始來源 ↗",
  "Remove saved role": "移除收藏的職缺",
  "Load more saved roles": "載入更多收藏的職缺",
} satisfies Messages;
