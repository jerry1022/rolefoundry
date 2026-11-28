import type { CareerPath, CareerPathId } from "./career-paths";
import type { Locale } from "./i18n";
import { careerPathsJa } from "./career-paths-ja";

type GuideText = Pick<CareerPath, "work" | "learning" | "evidence" | "project">;

/**
 * Traditional Chinese text for the editorial career-path guides, keyed by path ID. Titles are
 * translated as UI data labels. `tests/unit/fixtures-locale.test.ts` checks coverage and
 * alignment.
 */
export const careerPathsZhTw: Record<CareerPathId, GuideText> = {
  "ai-llm-applications": {
    work: "打造文件助理、知識搜尋、工具整合與可靠的 AI 應用。",
    learning: [
      "Python、Git、HTTP 與 SQL",
      "後端 API 與 LLM 整合",
      "檢索、工具呼叫與結構化輸出",
      "評估、部署、延遲與成本",
    ],
    evidence: [
      "一個附可重複測試與來源標註的可運作服務。",
      "量測過的品質、失敗案例、回應時間與營運成本。",
    ],
    project: "打造一個領域文件助理：答案附引用、使用保留問題集，並明確定義拒答行為。",
  },
  "machine-learning": {
    work: "開發分類、預測、推薦與異常偵測系統。",
    learning: [
      "Python、SQL、統計與線性代數",
      "以 scikit-learn 建立基準模型",
      "資料驗證、防止資料洩漏與錯誤分析",
      "必要時使用深度學習，再進行模型服務化",
    ],
    evidence: [
      "有理由的基準模型，以及正確的訓練、驗證與測試切分。",
      "可重現的實驗，以及針對有意義族群的成效分析。",
    ],
    project: "比較基準模型與流失或需求預測模型，並說明在保留資料上的錯誤。",
  },
  "data-analytics-science": {
    work: "把資料轉化為商業洞察、實驗、決策支援與合適的預測模型。",
    learning: [
      "SQL 與統計基礎",
      "Python 或 BI 工具，以及清楚的指標定義",
      "商業問題、視覺化與推論的限制",
      "實驗設計、A/B 測試與相關的機器學習",
    ],
    evidence: ["附明確假設的可重現查詢與分析。", "以資料與可信的實驗設計支持的決策建議。"],
    project: "建立指標儀表板與實驗提案，並記錄資料能證明與不能證明的事。",
  },
  "data-engineering": {
    work: "為分析與 AI 團隊建立資料擷取、轉換、儲存與品質的基礎。",
    learning: [
      "SQL 與 Python",
      "資料建模與儲存設計",
      "ETL／ELT、流程編排與排程",
      "品質測試、雲端維運與故障復原",
    ],
    evidence: [
      "可重跑的資料管線，附有文件化的資料契約與品質檢查。",
      "面對延遲、重複、格式錯誤或缺漏輸入時的復原行為。",
    ],
    project: "建立多來源資料管線，包含排程更新、品質檢查與安全的重新執行程序。",
  },
  "mlops-platform": {
    work: "讓模型服務可重現、可部署、可觀測，也能從故障中復原。",
    learning: [
      "Linux 與 Python",
      "Docker、雲端基礎設施與 CI/CD",
      "模型服務、版本管理與監控",
      "必要時處理回滾、可靠性與流程編排",
    ],
    evidence: [
      "使用版本化產出物與可重複部署的自動化交付。",
      "服務指標、故障診斷，以及實際演練過的回滾。",
    ],
    project: "部署一個版本化的模型服務，具備健康檢查、監控與測試過的發布回滾。",
  },
  "computer-vision-edge": {
    work: "打造偵測、辨識與分割應用，包含裝置端推論。",
    learning: [
      "Python 與影像處理",
      "深度學習與影像資料集",
      "偵測／分割、標註與評估",
      "推論最佳化與裝置限制",
    ],
    evidence: [
      "在真實場景變化下的誤判與漏判分析。",
      "量測過的推論速度、資源使用，以及記錄下來的資料集限制。",
    ],
    project: "建立一個小型影像檢測服務，比較不同條件下的錯誤與推論效能。",
  },
  "ai-product-consulting": {
    work: "發掘有價值的 AI 機會、定義產品，並以可衡量的成果引導導入。",
    learning: [
      "使用者訪談與工作流程分析",
      "AI 的能力、限制與替代方案",
      "原型製作、評估與成本估算",
      "交付規劃、導入與成果衡量",
    ],
    evidence: [
      "清楚的需求、研究發現，以及有理由的做法選擇。",
      "附成功指標、風險、成本與務實上線計畫的原型。",
    ],
    project: "以真實的工作流程問題為基礎，產出特定產業的 AI 原型與導入提案。",
  },
  "ai-automation-operations": {
    work: "運用 AI 與自動化，改善文件、報表、客服與行政工作流程。",
    learning: [
      "流程拆解與資料準備",
      "自動化工具與整合模式",
      "必要時使用 API、webhook 與 Python",
      "例外處理、人工核准與流程衡量",
    ],
    evidence: ["量測過的流程前後基準，包含錯誤與時間。", "明確的人工介入、故障復原與核准界線。"],
    project: "建立含核准步驟與測試過備援的文件擷取與審查流程。",
  },
  "ai-research": {
    work: "研究方法、重現論文，並設計嚴謹的模型訓練實驗。",
    learning: [
      "線性代數、機率與最佳化",
      "深度學習與實驗方法",
      "閱讀論文與可重現的實作",
      "訓練、消融實驗與研究溝通",
    ],
    evidence: ["附明確假設的可重現實驗或論文重現。", "基準、對照比較，以及誠實的限制或負面結果。"],
    project: "重現一個範圍明確的已發表結果，接著進行動機清楚的消融實驗並記錄成果。",
  },
  "ai-design-content": {
    work: "結合創意判斷與 AI 工作流程，產出好用且適合受眾的設計與內容。",
    learning: [
      "受眾、創意簡報與創作限制",
      "生成工具與可重複使用的提示流程",
      "迭代、無障礙與事實審查",
      "作品集呈現與記錄個人貢獻",
    ],
    evidence: [
      "一致的創意簡報、審查標準，以及有說明的迭代歷程。",
      "標明個人貢獻、來源權利與限制的作品集。",
    ],
    project: "製作一個小型內容或設計系列，附上文件化的簡報、審查清單與迭代紀錄。",
  },
};

/** Guide text for the viewer's locale; misaligned lists fall back to English. */
export function localizedCareerPath(
  path: CareerPath,
  locale: Locale,
): CareerPath & { lang: "en" | "zh-Hant" | "ja" } {
  const text =
    locale === "zh-TW"
      ? careerPathsZhTw[path.id]
      : locale === "ja"
        ? careerPathsJa[path.id]
        : undefined;
  if (
    !text ||
    text.learning.length !== path.learning.length ||
    text.evidence.length !== path.evidence.length
  )
    return { ...path, lang: "en" };
  return { ...path, ...text, lang: locale === "ja" ? "ja" : "zh-Hant" };
}
