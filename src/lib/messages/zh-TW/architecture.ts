import type { Messages } from "./types";

/** System architecture overview. */
export const architecture = {
  "OPEN BY DESIGN": "以開放為設計原則",
  "One connected career system.": "一個互相連結的職涯系統。",
  "A modular foundation built around shared skills, traceable evidence and clear service boundaries.":
    "以共用技能、可追溯證據與清楚服務邊界為核心的模組化基礎。",
  "Read the design docs": "閱讀設計文件",
  EXPERIENCE: "使用體驗",
  "Next.js web application": "Next.js 網頁應用程式",
  "Public catalog · personal workspace · admin": "公開目錄 · 個人工作區 · 管理後台",
  "Typed service interfaces": "具型別的服務介面",
  "DOMAIN MODULES": "領域模組",
  "Identity & access": "身分與存取",
  "Profile & evidence": "個人檔案與證據",
  "Job catalog": "職缺目錄",
  Assessment: "能力檢測",
  "Courses & learning": "課程與學習",
  "Application tracker": "應徵追蹤",
  "Repositories & task contracts": "資料存取層與任務合約",
  "PostgreSQL + pgvector": "PostgreSQL + pgvector",
  "Records · evidence · retrieval": "紀錄 · 證據 · 檢索",
  "Private Storage": "私人儲存空間",
  "Resumes · exports": "履歷 · 匯出檔",
  "Queue + Node worker": "佇列 + Node 工作程序",
  "Imports · parsing · analysis": "匯入 · 解析 · 分析",
  "Server-side provider boundary": "伺服器端供應商邊界",
  "AI Gateway": "AI 閘道",
  "Structured output · versions · quotas · no live provider in demo":
    "結構化輸出 · 版本 · 額度 · 示範版未連接真實供應商",
  "What runs today": "目前已運作",
  "Next.js routes and a responsive application shell.": "Next.js 路由與響應式應用程式外框。",
  "Fixture-backed search, overlap matching and course ranking.":
    "以範例資料提供的搜尋、重疊配對與課程排序。",
  "Scenario scoring and local evidence records.": "情境評分與本機證據紀錄。",
  "Local resume editing, text export and an application board.":
    "本機履歷編輯、文字匯出與應徵看板。",
  "Optional invitation-only Auth, consent, RLS and atomic quota reservations.":
    "可選用的邀請制驗證、同意管理、RLS 與原子化額度預留。",
  "Private preferences and evidence history through replaceable service ports.":
    "透過可替換的服務埠管理私人偏好與證據歷程。",
  "Published catalog, source permissions/freshness and private bookmarks.":
    "已發布目錄、來源授權／新鮮度與私人書籤。",
  "Typed repository, provider and worker contracts.": "具型別的資料存取、供應商與工作程序合約。",
  "What comes next": "接下來的規劃",
  "Private document storage and account-backed career workflows.":
    "私人文件儲存與以帳號為基礎的職涯流程。",
  "Authorized live source adapters and import review workflows.":
    "經授權的即時來源轉接器與匯入審核流程。",
  "Persistent queues and isolated document processing.": "持久化佇列與隔離的文件處理。",
  "Model adapters and output validation using versioned consent.":
    "模型轉接器，以及搭配版本化同意的輸出驗證。",
  "Production telemetry, backups and deployment controls.": "正式環境遙測、備份與部署控管。",
} satisfies Messages;
