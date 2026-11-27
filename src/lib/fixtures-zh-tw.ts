/**
 * Traditional Chinese text for the fictional demo fixtures in `fixtures.ts`, keyed by fixture ID.
 * Demo roles are invented, and course summaries and exercises are RoleFoundry's own editorial
 * text; official course titles stay in English because they name the linked course page.
 * `tests/unit/fixtures-locale.test.ts` checks that every fixture is covered and aligned.
 */
export const jobsZhTw: Record<
  string,
  { title: string; summary: string; responsibilities: string[] }
> = {
  "rf-01": {
    title: "AI 應用工程師",
    summary: "打造細膩的 AI 產品，把複雜文件轉化為實用的答案。",
    responsibilities: [
      "建立具可靠來源標註的檢索流程。",
      "開發 Python 服務並維護評估資料集。",
      "衡量回應品質、延遲與營運成本。",
    ],
  },
  "rf-02": {
    title: "LLM 產品工程師",
    summary: "從第一個原型到可靠產品，塑造實用的代理體驗。",
    responsibilities: [
      "將 LLM 工具接入既有的產品流程。",
      "建立安全的工具介面與明確的失敗處理。",
      "與設計師合作打造好用的 AI 互動。",
    ],
  },
  "rf-03": {
    title: "AI 產品經理",
    summary: "找出值得解決的客戶問題，設計可衡量的 AI 產品實驗。",
    responsibilities: [
      "把研究洞察轉化為清楚的產品需求。",
      "定義品質、採用率與商業成果指標。",
      "規劃人工審查與產品上線。",
    ],
  },
  "rf-04": {
    title: "資料與機器學習工程師",
    summary: "以乾淨的資料與可重現的實驗，作為更好預測的基礎。",
    responsibilities: [
      "建立經過測試的資料管線與基準模型。",
      "防止資料洩漏，並依族群評估成效。",
      "記錄資料品質與模型限制。",
    ],
  },
  "rf-05": {
    title: "AI 工作流程專員",
    summary: "以可靠的 AI 工作流程，讓營運團隊把時間留給更有意義的工作。",
    responsibilities: [
      "盤點重複性流程並設計自動化。",
      "加入核准步驟與備援處理。",
      "比較流程時間與錯誤率。",
    ],
  },
  "rf-06": {
    title: "生成式內容設計師",
    summary: "結合創意判斷與 AI 工具，創作有辨識度又實用的內容。",
    responsibilities: [
      "建立可重複使用的創意簡報與生成流程。",
      "審查事實正確性、無障礙與品牌契合度。",
      "記錄創意決策與迭代過程。",
    ],
  },
  "rf-07": {
    title: "AI 解決方案顧問",
    summary: "協助團隊選擇可實現的 AI 機會，並讓導入真正落地。",
    responsibilities: [
      "主導需求探索與工作流程分析。",
      "評估效益、成本與交付限制。",
      "設計具可衡量驗收標準的試行計畫。",
    ],
  },
  "rf-08": {
    title: "AI 成長分析師",
    summary: "運用資料與審慎評估過的 AI 工具，把客戶洞察轉化為實驗。",
    responsibilities: [
      "以 SQL 分析漏斗成效。",
      "設計有對照組的內容與行銷活動實驗。",
      "區分相關性與因果證據。",
    ],
  },
};

export const coursesZhTw: Record<string, { summary: string; exercise: string }> = {
  "dl-prompt": {
    summary: "建立可重複的提示方法，並在真實應用上測試。",
    exercise: "用十個固定範例比較三種提示，記錄失敗案例。",
  },
  "dl-rag": {
    summary: "把檢索知識連接到文件助理，產生可追溯來源的答案。",
    exercise: "建立一個小型文件助理，用十個問題測試來源涵蓋率。",
  },
  "dl-agent": {
    summary: "探索具備明確評估與復原路徑的多步驟 AI 工作流程。",
    exercise: "建立含人工核准點與失敗測試的兩步驟工作流程。",
  },
  "dl-ml": {
    summary: "打好模型建構、評估與實務機器學習的基礎。",
    exercise: "在保留資料集上比較基準模型與訓練後的模型。",
  },
  "dl-everyone": {
    summary: "了解 AI 能幫上什麼、做不到什麼，以及如何定義有用的專案。",
    exercise: "撰寫一頁機會簡報，包含基準、風險與成功標準。",
  },
  "dl-genai": {
    summary: "探索不同角色的生成式 AI 應用情境與負責任的工作流程。",
    exercise: "建立含審查清單與限制說明的內容工作流程。",
  },
  "dl-advanced-rag": {
    summary: "學習句窗與自動合併等進階檢索方法，並評估與迭代 RAG 管線。",
    exercise: "用相同的十個問題比較兩種檢索設定，記錄哪些答案失去來源。",
  },
  "dl-vector-apps": {
    summary: "打造以向量資料庫驅動的應用，包含語意搜尋、檢索增強生成與異常偵測。",
    exercise: "為二十份文件建立索引，衡量正確文件出現在前三名的頻率。",
  },
  "dl-unstructured": {
    summary: "從 PDF、簡報與 HTML 擷取並正規化內容，讓 RAG 系統能檢索多種文件類型。",
    exercise: "把三種文件格式轉成一致的結構，並列出各自遺失的內容。",
  },
  "dl-multimodal-rag": {
    summary: "打造能跨文字與影像進行檢索與生成的搜尋及 RAG 應用。",
    exercise: "為小型搜尋索引加入影像描述，測試五個圖文混合查詢。",
  },
  "dl-agentic-rag": {
    summary: "開發能分流問題、根據文件回答並摘要的代理式 RAG 系統，並學習除錯代理推理。",
    exercise: "在兩組文件之間建立路由器，記錄每個被分錯的問題。",
  },
  "dl-eval-agents": {
    summary: "以結構化評估有系統地評估、改進並迭代 AI 代理。",
    exercise: "為代理的一個步驟撰寫五個測試案例，追蹤兩個提示版本的通過率。",
  },
  "dl-improve-agentic": {
    summary:
      "建立能指出代理不足之處的測試，用程式評估器與經驗證的 LLM 評審自動評分，並確認每次修改是否真的改善。",
    exercise: "先用十個人工評分的輸出驗證 LLM 評審，再依賴它。",
  },
  "dl-data-agents": {
    summary: "建立、評估並改進能規劃步驟、連接資料來源並提供洞察的多代理系統。",
    exercise: "用三種方式提出同一個資料問題，比較代理寫出的查詢。",
  },
  "dl-db-agent": {
    summary: "用自然語言操作表格資料與 SQL 資料庫，讓分析更有效率也更容易上手。",
    exercise: "將十個生成的 SQL 查詢與手寫版本比對，記錄每個差異。",
  },
  "dl-data-analytics": {
    summary: "以業界標準與 AI 工具建立資料分析基礎，用來擷取洞察、做出決策並解決商業問題。",
    exercise: "用一個查詢、一張圖表和一項明確的限制說明回答一個商業問題。",
  },
  "dl-python": {
    summary: "在 AI 輔助下學習 Python 基礎，並用來自動化實際工作。",
    exercise: "自動化一項重複的檔案工作，記錄一週省下的時間。",
  },
  "dl-jupyter-ai": {
    summary: "使用 Jupyter AI 在筆記本中產生程式碼、取得解說並分析資料。",
    exercise: "分別在有無 AI 協助下重做同一份分析，比較你會保留的程式碼。",
  },
  "dl-prompting-everyone": {
    summary: "培養能從目前 AI 模型取得有用結果的提示技巧，從找資料到打造應用都適用。",
    exercise: "把同一個提示改寫三次，記錄每次輸出的變化。",
  },
  "dl-context": {
    summary: "學習在對的時間、以對的格式，提供 AI 代理對的資訊。",
    exercise: "把代理的上下文減半，測試五項任務是否仍能成功。",
  },
  "dl-chatgpt-system": {
    summary: "拆解複雜任務、串接 LLM 呼叫、自動化工作流程，並評估輸入與輸出的安全性與相關性。",
    exercise: "把一項任務拆成三個串接呼叫，並在每一步之後加上檢查。",
  },
  "dl-crewai": {
    summary: "透過自然語言設計並提示一組 AI 代理，自動化商業工作流程。",
    exercise: "給兩個代理不同角色，記錄它們輸出互相衝突的地方。",
  },
  "dl-doc-workflows": {
    summary: "打造事件驅動的代理式工作流程，結合 RAG 與人工回饋來處理文件並填寫表單。",
    exercise: "處理五份表單，記錄每個需要人工修正的欄位。",
  },
  "dl-genai-software": {
    summary: "學習實用的提示工程，並與 LLM 結對程式設計來撰寫、測試與改進程式碼。",
    exercise: "請 LLM 為一個函式撰寫測試，檢查哪些測試真的能抓到植入的錯誤。",
  },
  "dl-vision-prompting": {
    summary: "學習以 Stable Diffusion 為視覺模型撰寫提示，包含物件偵測與局部重繪。",
    exercise: "以固定種子產生一組影像，記錄每次提示修改帶來的變化。",
  },
  "dl-media-agents": {
    summary: "打造能生成影像與影片、自動評估輸出並反覆迭代直到達到品質標準的代理。",
    exercise: "為生成影像定義三項可衡量的品質檢查，並套用在十個輸出上。",
  },
  "dl-genai-llms": {
    summary: "了解大型語言模型如何運作，以及如何調整與應用，從提示到微調。",
    exercise: "針對同一項任務，比較提示與微調兩種做法的成本與準確度。",
  },
  "dl-ml-production": {
    summary: "學習在正式環境中設計、部署與監控機器學習系統。",
    exercise: "撰寫一份監控計畫，包含兩項資料檢查與一個回滾觸發條件。",
  },
  "dl-semantic-kernel": {
    summary:
      "使用 Microsoft 開源的 Semantic Kernel 協調器，以及記憶、連接器、串鏈與規劃器等 LLM 元件。",
    exercise: "為一個團隊流程草擬外掛，並列出它需要的資料。",
  },
  "dl-guardrails": {
    summary: "加入能檢查並修正 LLM 應用輸出的防護機制，讓應用更安全可靠。",
    exercise: "為一個助理列出三種失敗模式，並各寫一個防護測試。",
  },
};

export const questionsZhTw: Record<
  string,
  { prompt: string; options: string[]; explanation: string }
> = {
  "q-0-0": {
    prompt: "你的文件助理回答流暢，但引用來源錯誤。你會先檢查什麼？",
    options: ["調高模型溫度", "用固定範例檢查檢索到的段落與引用是否對應", "不經檢查就加入更多文件"],
    explanation: "分開檢查檢索與引用對應，才能找出是哪個環節出錯。",
  },
  "q-0-1": {
    prompt: "什麼能讓 AI 的改善令人信服？",
    options: ["幾個令人驚豔的展示", "更長的提示", "在保留評估集上與基準比較"],
    explanation: "固定且保留的資料集讓比較更可重複，也減少只挑好結果的偏誤。",
  },
  "q-0-2": {
    prompt: "代理即將寄出一封客戶電子郵件。早期原型採用哪種設計最安全？",
    options: ["在對外動作前要求明確核准", "一直重試直到寄送成功", "讓生成的文字自行決定權限"],
    explanation: "把生成與授權分開，並在對外動作前設置核准關卡。",
  },
  "q-1-0": {
    prompt: "AI 功能最好的起點是什麼？",
    options: ["明確的客戶問題與可衡量的基準", "使用最新的模型", "在每個頁面都加上聊天機器人"],
    explanation: "從使用者問題與基準開始，才能衡量 AI 是否真的帶來價值。",
  },
  "q-1-1": {
    prompt: "原型平均準確度不錯，卻在某個客群表現不佳。下一步是什麼？",
    options: ["依平均值直接上線", "依族群評估，並規劃審查或備援", "把失敗的範例藏起來"],
    explanation: "依族群評估能揭露整體指標可能掩蓋的失敗模式。",
  },
  "q-1-2": {
    prompt: "利害關係人要求 AI 答案保證正確。計畫應該包含什麼？",
    options: ["承諾更強的提示能保證正確", "不做測試", "明確的限制、檢查與人工升級處理"],
    explanation: "說明限制與驗證方式，而不是承諾模型表現完美。",
  },
  "q-2-0": {
    prompt: "在自動化客服流程之前，你會先盤點什麼？",
    options: ["只看順利的情況", "輸入、例外狀況、核准與目前的基準", "只看偏好的工具"],
    explanation: "有用的自動化必須考量例外狀況、責任歸屬與既有表現。",
  },
  "q-2-1": {
    prompt: "哪種證據最能支持「AI 改善了行銷活動」的說法？",
    options: ["有明確指標的對照比較", "一則熱門貼文", "產出更多內容"],
    explanation: "對照比較比數量或單一結果更有說服力。",
  },
  "q-2-2": {
    prompt: "AI 產生的客戶回覆中含有沒有根據的承諾。應該怎麼處理？",
    options: ["更快寄出", "假設模型已經查過政策", "查核核准的來源，並把不確定的內容轉交審查"],
    explanation: "事實與政策相關的說法，在送到客戶手上前都要先查證。",
  },
  "q-3-0": {
    prompt: "可重複使用的 AI 創意簡報應該包含什麼？",
    options: ["受眾、目標、限制與審查標準", "只有視覺風格", "不提供脈絡以激發創意"],
    explanation: "明確的脈絡與標準，能幫助你判斷生成的作品是否符合簡報。",
  },
  "q-3-1": {
    prompt: "應該如何評估 AI 生成的內容？",
    options: ["依輸出長度", "依正確性、無障礙、受眾契合度與權利紀錄", "依生成速度"],
    explanation: "品質取決於受眾與限制，而不只是速度或數量。",
  },
  "q-3-2": {
    prompt: "如何公平比較兩種生成方式？",
    options: ["改變所有輸入", "只挑最好的結果", "使用相同的簡報與標準，並記錄差異"],
    explanation: "一致的簡報與評分標準，才能讓比較有意義。",
  },
};
