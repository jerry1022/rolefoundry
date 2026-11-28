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
  "Fixture-backed search, overlap matching and course ranking.":
    "以範例資料提供的搜尋、重疊配對與課程排序。",
  "Scenario scoring and local evidence records.": "情境評分與本機證據紀錄。",
  "Local resume editing, text export and an application board.":
    "本機履歷編輯、文字匯出與應徵看板。",
  "NO ACCOUNT NEEDED": "不需要帳號",
  "In this demo": "示範版內容",
  "English, Traditional Chinese and Japanese, light and dark themes.":
    "英文、繁體中文與日文介面，淺色與深色主題。",
  "IMPLEMENTED AND TESTED LOCALLY": "已實作並在本機驗證",
  "With a configured backend": "設定後端之後",
  "Invitation-only Auth, consent, RLS and atomic quota reservations.":
    "邀請制驗證、同意管理、RLS 與原子化額度預留。",
  "Private evidence, assessments, matching, learning plans, resumes and applications.":
    "私人證據、能力檢測、職缺配對、學習計畫、履歷與應徵紀錄。",
  "Durable queue and independent worker with leases, retries and recovery.":
    "持久化佇列與獨立工作程序，具備租約、重試與復原機制。",
  "Reviewed catalog ingestion, translations and administrator tools.":
    "經審核的目錄匯入、翻譯與管理工具。",
  "Account export and deletion, telemetry and an AI gateway with fallbacks.":
    "帳號資料匯出與刪除、遙測，以及具備備援機制的 AI 閘道。",
  "NEEDS PEOPLE OR HOSTING": "需要人工或正式環境",
  "Release gates": "上線前關卡",
  "Approved AI provider and live evaluation.": "核准的 AI 供應商與實際評估。",
  "Expert review of questions, rubrics and course mappings.": "專家審閱題目、評分標準與課程對應。",
  "Authorized live job sources.": "經授權的即時職缺來源。",
  "Hosted deployment, alerts and off-host recovery.": "正式環境部署、警示與異地復原。",
} satisfies Messages;
