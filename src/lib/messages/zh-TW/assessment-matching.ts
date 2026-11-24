import type { Messages } from "./types";

/**
 * Connected-mode scenario assessments (attempts, results, question bank administration) and
 * private matching reports, plus the local matching demo. Authored question content stays as-is.
 */
export const assessmentMatching = {
  // Assessment attempts
  draft: "草稿",
  submitted: "已送出",
  completed: "已完成",
  failed: "失敗",
  "The assessment service is unavailable.": "評估服務目前無法使用。",
  "PRIVATE ATTEMPTS · TRACEABLE FEEDBACK": "私人作答 · 可追溯的回饋",
  "Find a useful starting point.": "找到合適的起點。",
  "Try three reviewed scenarios for your direction. Fixed-answer scoring stays in this system and uses no external AI provider.":
    "針對你的方向試做三題經審核的情境題。固定答案的計分只在本系統內進行，不使用外部 AI 服務。",
  "Sign in to start an assessment": "登入以開始評估",
  "Reload assessment history": "重新載入評估紀錄",
  "Choose your direction": "選擇你的方向",
  "Assessment track": "評估方向",
  "Start a private assessment": "開始私人評估",
  "A new attempt keeps earlier results. Fixed-choice grading does not send answers to a model or consume AI analysis allowance.":
    "新的作答會保留先前的結果。固定選項計分不會將答案傳送給模型，也不會消耗 AI 分析額度。",
  "Scoring is queued": "計分排隊中",
  "Your answers are sealed and saved. You can leave and return while scoring completes.":
    "你的答案已封存並儲存。計分期間你可以先離開，稍後再回來查看。",
  "Check scoring status": "查看計分狀態",
  "Scoring could not finish": "計分未能完成",
  "Your submitted answers are retained. A retry uses these sealed answers; invalid or stale inputs require a new attempt.":
    "你送出的答案仍會保留。重試會使用這些已封存的答案；若輸入無效或已過時，則需重新作答。",
  "Retry scoring with saved answers": "以已儲存的答案重新計分",
  "Your assessment history": "你的評估紀錄",
  "No private attempts yet.": "目前還沒有私人作答紀錄。",
  "Open assessment": "開啟評估",
  "Load more assessments": "載入更多評估",
  "Draft saving failed. Reload before continuing.": "草稿儲存失敗，請重新載入後再繼續。",
  "Submission could not be confirmed. Check the saved assessment before retrying.":
    "無法確認是否已送出。重試前請先查看已儲存的評估。",
  "{track} scenarios": "{track}情境題",
  "Answers save automatically. Submit seals this version for scoring; this is a narrow observation, not certification.":
    "答案會自動儲存。送出後會封存此版本以進行計分；這只是有限範圍的觀察，並非認證。",
  "Reload saved assessment": "重新載入已儲存的評估",
  "Saving draft…": "正在儲存草稿…",
  "All answers saved.": "所有答案皆已儲存。",
  "Confirming submission…": "正在確認送出…",
  "Retry the same submission": "重試同一次送出",
  "Submit for scoring": "送出計分",
  "OBSERVED SCENARIO RESULTS": "情境題觀察結果",
  "These results describe this attempt only. An incorrect response does not erase your previous experience. A correct response does not establish independent mastery.":
    "這些結果只描述本次作答。答錯不會抹去你過去的經驗，答對也不代表已能獨立精通。",
  "Correct in this scenario": "本情境答對",
  "Your response: {answer}": "你的回答：{answer}",
  "Reviewed answer: {answer}": "審核答案：{answer}",
  "Skill: {skill}": "技能：{skill}",
  "Next practice: explain the choice in your own words, then build a small example that shows when it applies.":
    "下一步練習：用自己的話說明這個選擇，再做一個小範例，說明它適用的情境。",
  "View scenario evidence in my profile": "在我的個人檔案中查看情境證據",

  // Question bank administration
  "Create an immutable rubric version": "建立不可修改的評分準則版本",
  "Rubric key": "評分準則代碼",
  "Rubric version": "評分準則版本",
  "Rubric description": "評分準則說明",
  "Create rubric version": "建立評分準則版本",
  "Create a question version": "建立題目版本",
  "Correct answers and explanations stay private until completion. New content must be reviewed before it can be selected.":
    "正確答案與解說在作答完成前不會公開。新內容必須經過審核才能被選用。",
  "Check the fields, choose a rubric and provide 2–10 answer options.":
    "請檢查各欄位、選擇評分準則，並提供 2–10 個答案選項。",
  "Question key": "題目代碼",
  "Question version": "題目版本",
  Track: "方向",
  "Question track": "題目方向",
  Skill: "技能",
  "Question skill": "題目技能",
  Rubric: "評分準則",
  "Question rubric": "題目評分準則",
  "{key} · version {version}": "{key} · 第 {version} 版",
  Prompt: "題幹",
  "Question prompt": "題目題幹",
  "Options (one per line)": "選項（每行一個）",
  "Question options": "題目選項",
  "Correct answer": "正確答案",
  "Feedback explanation": "回饋解說",
  "Question explanation": "題目解說",
  "Create draft question": "建立草稿題目",
  "Create a rubric before authoring questions.": "撰寫題目前請先建立評分準則。",
  "Unable to load the private question bank.": "無法載入私人題庫。",
  "Question bank change saved. Existing attempts keep their original versions.":
    "題庫變更已儲存。既有作答會保留原本的版本。",
  "Question bank administration": "題庫管理",
  "Reviewed scenarios support a learning preview. Review does not claim professional calibration or certification. Correct-answer data in this panel is restricted to administrators.":
    "經審核的情境題用於學習預覽。審核不代表專業校準或認證。此面板中的正確答案資料僅限管理員查看。",
  "Review versions for selection": "審核可供選用的版本",
  "Review reason": "審核原因",
  "Question review reason": "題目審核原因",
  "{key} version {version}": "{key} 第 {version} 版",
  "Reviewed for selection": "已審核可選用",
  "Draft or retired": "草稿或已停用",
  "Correct answer: {answer}": "正確答案：{answer}",
  "Retire question version": "停用題目版本",
  "Review question version": "審核題目版本",

  // Matching conditions
  "Conditions for a new report": "新報告的條件",
  "Changes here apply to the next report. Existing reports keep their saved inputs.":
    "這裡的變更會套用到下一份報告；既有報告會保留已儲存的輸入。",
  "Workplace preferences: {workplaces}.": "工作型態偏好：{workplaces}。",
  "Not specified": "未指定",
  "Edit my profile": "編輯我的個人檔案",
  "Self-reported relevant experience (years, optional)": "自述相關經驗（年，選填）",
  "Relevant experience years": "相關經驗年數",
  "Leaving a field unknown does not count as a conflict. Years alone do not verify relevant experience.":
    "欄位保留為未知不會被視為衝突。單憑年數無法證明具備相關經驗。",
  Education: "學歷",
  "Work authorization": "工作許可",
  "education confirmation": "學歷確認",
  "workAuthorization confirmation": "工作許可確認",
  "I am not sure": "我不確定",
  "I report meeting this requirement": "我自述符合此條件",
  "I report not meeting this requirement": "我自述不符合此條件",
  "Education and work authorization stay unknown in a direction-wide report. Choose one role to confirm its exact listed conditions.":
    "在全方向報告中，學歷與工作許可會維持未知。請選擇一個職缺，以確認其列出的確切條件。",
  "Creating report…": "正在建立報告…",
  "Create a fresh matching report": "建立新的配對報告",
  "This rule-based analysis uses no external AI provider or AI allowance. It helps you explore opportunities; it does not decide employment eligibility.":
    "這項以規則為基礎的分析不使用外部 AI 服務或 AI 額度。它協助你探索機會，但不會決定你是否具備任用資格。",

  // Local matching demo
  "LOCAL DEMO · FICTIONAL ROLES": "本機示範 · 虛構職缺",
  "Explore skill overlap.": "探索技能重疊度。",
  "This local preview compares selected skills with fictional role requirements. It is not private server matching or a hiring probability.":
    "這個本機預覽會將你選擇的技能與虛構職缺的要求比較。它不是私人伺服器配對，也不代表錄取機率。",
  "{company} · Sample data": "{company} · 範例資料",
  "{covered} / {total} fixture skills selected.": "已選擇 {covered} / {total} 項範例技能。",
  "Missing from the selected list: {skills}. Missing evidence does not prove inability.":
    "選擇清單中缺少：{skills}。缺少證據不代表做不到。",
  None: "無",
  "Edit local demo skills": "編輯本機示範技能",

  // Matching reports
  queued: "排隊中",
  running: "執行中",
  succeeded: "已完成",
  invalidated: "已失效",
  "Matching is temporarily unavailable.": "配對功能暫時無法使用。",
  "REQUIREMENTS · EVIDENCE · NEXT ACTIONS": "條件 · 證據 · 下一步",
  "Find opportunities with a clear reason.": "找到理由清楚的機會。",
  "Compare published requirements with your own evidence. Unknown conditions stay unknown; coverage never means hiring probability.":
    "將公開的職缺條件與你自己的證據比較。未知的條件會維持未知；涵蓋程度絕不代表錄取機率。",
  "Sign in to use private matching": "登入以使用私人配對",
  "Reload matching workspace": "重新載入配對工作區",
  "Choose a direction or one target role": "選擇一個方向或一個目標職缺",
  "Direction-wide reports use {track}.": "全方向報告使用「{track}」。",
  "Change my direction": "變更我的方向",
  "Matching target role": "配對目標職缺",
  "All published roles in my direction": "我的方向中所有公開職缺",
  "Load more target roles": "載入更多目標職缺",
  "Report content removed": "報告內容已移除",
  "Matching could not finish": "配對未能完成",
  "Matching is queued or running": "配對排隊中或執行中",
  "Your matching report": "你的配對報告",
  "Check report status": "查看報告狀態",
  "This report is historical because its inputs changed. Create a fresh report before using it to prioritize current opportunities.":
    "由於輸入已變更，這份報告已成為歷史紀錄。用來排定目前機會的優先順序前，請先建立新報告。",
  "An input evidence record was deleted. Its copied report content has been removed. Create a fresh report with current evidence.":
    "有一筆輸入證據已被刪除，報告中複製的相關內容也已移除。請以目前的證據建立新報告。",
  "No partial report is published. Create a fresh report using current inputs; your previous report history stays separate.":
    "不會發布不完整的報告。請以目前的輸入建立新報告；你先前的報告紀錄會另外保留。",
  "Your inputs are saved. You can leave and return while the independent worker computes the report.":
    "你的輸入已儲存。獨立背景程序計算報告期間，你可以先離開，稍後再回來查看。",
  "{count} source roles · Rule-based analysis · {date}. Conditions and evidence describe the saved inputs for this report.":
    "{count} 個來源職缺 · 規則式分析 · {date}。條件與證據描述的是這份報告已儲存的輸入。",
  "Saved relevant experience: {value}.": "已儲存的相關經驗：{value}。",
  "Not supplied": "未提供",
  "{years} years (self-reported)": "{years} 年（自述）",
  "No published roles matched the selected direction. Try a specific target or review the catalog later.":
    "沒有公開職缺符合所選方向。請試著指定目標職缺，或稍後再查看職缺目錄。",
  "Load more matching results": "載入更多配對結果",
  "Your report history": "你的報告紀錄",
  "No private matching reports yet.": "目前還沒有私人配對報告。",
  "Target role report": "目標職缺報告",
  "Direction report": "方向報告",
  "Open matching report": "開啟配對報告",
  "Load more report history": "載入更多報告紀錄",

  // Matching result cards
  "Explore this opportunity": "探索這個機會",
  "Strengthen the supporting evidence": "補強支持的證據",
  "Consider a longer-term target": "考慮作為較長期的目標",
  "Review an explicit condition conflict": "檢視明確的條件衝突",
  Experience: "經驗",
  Seniority: "職級",
  confirmed: "已確認",
  conflict: "衝突",
  unknown: "未知",
  "Historical role · no longer available": "歷史職缺 · 已不再開放",
  "Historical report · refresh before using": "歷史報告 · 使用前請先更新",
  "Mandatory skills with linked support:": "有連結支持的必要技能：",
  "Preferred:": "加分條件：",
  "Support may be self-reported or an unreviewed reference. These counts are not hiring probabilities or verified competency levels.":
    "支持來源可能是自述或未經審核的參考資料。這些數字不代表錄取機率，也不是經驗證的能力等級。",
  "The source could not recently confirm availability. Check the original role before planning an application.":
    "來源近期無法確認此職缺是否仍開放。規劃應徵前請先查看原始職缺。",
  Conditions: "條件",
  "Requirements and their supporting sources": "職缺條件與其支持來源",
  Mandatory: "必要",
  Preferred: "加分",
  "This text has no reviewed skill mapping. Check it directly.":
    "這段文字沒有經審核的技能對應，請直接查看。",
  "No linked support. This does not prove inability.": "沒有連結的支持來源。這不代表做不到。",
  "needs practice": "需要練習",
  "observed in one scenario": "在一個情境中觀察到",
  unverified: "未驗證",
  "No additional context supplied.": "未提供其他背景說明。",
  "Review this evidence in my profile": "在我的個人檔案中檢視這項證據",
  "Plan learning for this role": "為這個職缺規劃學習",
  "Review resume for this role": "針對這個職缺檢視履歷",
  "Useful next actions": "實用的下一步",
  "Prepare a tracking record": "準備追蹤紀錄",
  "{skill}: {reason}": "{skill}：{reason}",
  "Inspect the original role and prepare examples that demonstrate the linked skills.":
    "查看原始職缺，並準備能展現相關技能的實例。",
  "Review published roles and original sources": "檢視公開職缺與原始來源",
} satisfies Messages;
