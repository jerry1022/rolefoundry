import type { Messages } from "./types";

/** Resume studio (local demo). */
export const resume = {
  "YOUR EXPERIENCE, BETTER EXPRESSED": "把你的經歷說得更好",
  "Give your story some shape.": "讓你的故事更有輪廓。",
  "Connect real experience to the role you want. Keep the facts yours.":
    "把真實經歷連結到你想要的職缺，事實永遠屬於你。",
  "Export text": "匯出文字",
  "Local text workspace. AI rewriting, file parsing and PDF export are designed, but not connected in this scaffold.":
    "本機文字工作區。AI 改寫、檔案解析與 PDF 匯出已完成設計，但尚未接入此示範版本。",
  "Your working draft": "你的工作草稿",
  "Use sample information. Edits are stored in this browser.":
    "請使用範例資料，編輯內容會儲存在這個瀏覽器中。",
  "Resume draft": "履歷草稿",
  "{count} / {max} characters": "{count}／{max} 字元",
  "Saved locally": "已儲存在本機",
  "A clearer connection.": "更清楚的連結。",
  "Review your draft alongside a sample role. These are deterministic prompts, not AI-generated claims.":
    "對照範例職缺檢視你的草稿。這些是固定規則產生的提示，不是 AI 生成的內容。",
  "Target role": "目標職缺",
  "Review my draft": "檢視我的草稿",
  "Your review checklist": "你的檢視清單",
  "Mentioned in your draft. Add a concrete example and your contribution.":
    "草稿中已提到。請補充具體案例與你的貢獻。",
  "Not clearly evidenced. Add a real example if you have one; otherwise leave it as a learning goal.":
    "尚未有明確證據。如果你有真實案例就補上；若沒有，就把它當作學習目標。",
  "Use: problem → your action → observed result → evidence. Add numbers only when you measured them.":
    "建議架構：問題 → 你的行動 → 觀察到的結果 → 證據。只有實際量測過的數字才寫進去。",
  "Copied to clipboard": "已複製到剪貼簿",
  "Copy draft": "複製草稿",
  "Clipboard access unavailable. Select the draft text or use Export text.":
    "無法存取剪貼簿。請直接選取草稿文字，或使用「匯出文字」。",
  "Place confirmed statements linked to the target's skills earlier in this section. Their wording and completion state are unchanged.":
    "把與目標職缺技能相關的已確認陳述移到本段較前面。陳述的措辭與完成狀態都不變。",
  "Do you have a real example for this requirement? Add it as a separately confirmed fact if appropriate; the requirement is not added as a claim.":
    "你有這項要求的真實例子嗎？如果適合，請另外新增一項已確認的事實；這項要求不會被當成你的主張加入。",
  "This deterministic fallback reorders existing confirmed statements only; it does not rewrite, measure ATS fit or certify ability.":
    "這個確定性的備援做法只會重新排序已確認的陳述，不會改寫內容、評估 ATS 相符程度或認證能力。",
  "Linked skills are owner-confirmed labels. Target requirements are not proof of personal experience.":
    "連結的技能是你自己確認的標籤。目標職缺的要求不能證明你的個人經驗。",
  "Model-assisted wording requires the separately evaluated AI Gateway integration.":
    "模型輔助措辭需要另外經過評估的 AI Gateway 整合。",
} satisfies Messages;
