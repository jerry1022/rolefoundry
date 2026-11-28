import type { Messages } from "../zh-TW/types";

export const assessmentMatching = {
  draft: "下書き",
  submitted: "提出済み",
  completed: "完了",
  failed: "失敗",
  "The assessment service is unavailable.": "スキル評価サービスを利用できません。",
  "PRIVATE ATTEMPTS · TRACEABLE FEEDBACK": "非公開の回答・根拠のあるフィードバック",
  "Find a useful starting point.": "役立つ出発点を見つけよう。",
  "Try three reviewed scenarios for your direction. Fixed-answer scoring stays in this system and uses no external AI provider.":
    "分野に合ったレビュー済みシナリオを3問試しましょう。固定解答の採点はシステム内で行い、外部AIは使用しません。",
  "Sign in to start an assessment": "ログインして評価を始める",
  "Reload assessment history": "評価履歴を更新",
  "Choose your direction": "方向性を選ぶ",
  "Assessment track": "評価の分野",
  "Start a private assessment": "非公開の評価を始める",
  "A new attempt keeps earlier results. Fixed-choice grading does not send answers to a model or consume AI analysis allowance.":
    "新しい回答でも過去の結果は残ります。選択式の採点では回答をモデルに送信せず、AI分析枠も使いません。",
  "Scoring is queued": "採点待ち",
  "Your answers are sealed and saved. You can leave and return while scoring completes.":
    "回答を確定して保存しました。採点中はページを離れても大丈夫です。",
  "Check scoring status": "採点状況を確認",
  "Scoring could not finish": "採点を完了できませんでした",
  "Your submitted answers are retained. A retry uses these sealed answers; invalid or stale inputs require a new attempt.":
    "提出済みの回答は保存されています。再試行では確定済みの回答を使います。無効または古い入力は新しい評価が必要です。",
  "Retry scoring with saved answers": "保存済み回答で採点を再試行",
  "Your assessment history": "あなたの評価履歴",
  "No private attempts yet.": "非公開の回答はまだありません。",
  "Open assessment": "評価を開く",
  "Load more assessments": "評価をさらに読み込む",
  "Draft saving failed. Reload before continuing.":
    "下書きを保存できませんでした。再読み込みしてから続けてください。",
  "Submission could not be confirmed. Check the saved assessment before retrying.":
    "提出を確認できませんでした。再試行する前に保存済みの評価を確認してください。",
  "{track} scenarios": "{track}のシナリオ",
  "Answers save automatically. Submit seals this version for scoring; this is a narrow observation, not certification.":
    "回答は自動保存されます。提出するとこの版を採点用に確定します。限定的な観察であり、認定ではありません。",
  "Reload saved assessment": "保存済みの評価を再読み込み",
  "Saving draft…": "下書きを保存中…",
  "All answers saved.": "すべての回答を保存しました。",
  "Confirming submission…": "提出を確認中…",
  "Retry the same submission": "同じ提出を再試行",
  "Submit for scoring": "採点のために提出",
  "OBSERVED SCENARIO RESULTS": "このシナリオでの結果",
  "These results describe this attempt only. An incorrect response does not erase your previous experience. A correct response does not establish independent mastery.":
    "この結果は今回の回答のみを示します。不正解でも過去の経験が消えることはなく、正解でも独力での習熟を証明するものではありません。",
  "Correct in this scenario": "このシナリオでは正解",
  "Your response: {answer}": "あなたの回答：{answer}",
  "Reviewed answer: {answer}": "レビュー済み解答：{answer}",
  "Skill: {skill}": "スキル：{skill}",
  "Next practice: explain the choice in your own words, then build a small example that shows when it applies.":
    "次の練習：選択の理由を自分の言葉で説明し、適用できる場面を小さな例で示しましょう。",
  "View scenario evidence in my profile": "プロフィールで結果を見る",
  "Create an immutable rubric version": "変更不可の採点基準バージョンを作成",
  "Rubric key": "採点基準キー",
  "Rubric version": "採点基準バージョン",
  "Rubric description": "採点基準の説明",
  "Create rubric version": "採点基準バージョンを作成",
  "Create a question version": "問題のバージョンを作成",
  "Correct answers and explanations stay private until completion. New content must be reviewed before it can be selected.":
    "解答と解説は完了まで非公開です。新しい内容は選択対象になる前にレビューが必要です。",
  "Check the fields, choose a rubric and provide 2–10 answer options.":
    "項目を確認し、採点基準を選び、2〜10個の選択肢を入力してください。",
  "Question key": "問題キー",
  "Question version": "問題バージョン",
  "Question track": "問題の分野",
  "Question skill": "問題のスキル",
  Rubric: "採点基準",
  "Question rubric": "問題の採点基準",
  "{key} · version {version}": "{key}・バージョン {version}",
  Prompt: "設問",
  "Question prompt": "問題文",
  "Options (one per line)": "選択肢（1行にひとつ）",
  "Question options": "問題の選択肢",
  "Correct answer": "正解",
  "Feedback explanation": "フィードバックの解説",
  "Question explanation": "問題の解説",
  "Create draft question": "問題の下書きを作成",
  "Create a rubric before authoring questions.": "問題を作成する前に採点基準を作成してください。",
  "Unable to load the private question bank.": "非公開の問題集を読み込めません。",
  "Question bank change saved. Existing attempts keep their original versions.":
    "問題集の変更を保存しました。既存の回答では元のバージョンを保持します。",
  "Question bank administration": "問題集の管理",
  "Reviewed scenarios support a learning preview. Review does not claim professional calibration or certification. Correct-answer data in this panel is restricted to administrators.":
    "レビュー済みシナリオは学習用プレビューです。専門的な校正や認定を意味しません。この画面の正解データは管理者のみ閲覧できます。",
  "Review versions for selection": "選択対象のバージョンをレビュー",
  "Question review reason": "問題レビューの理由",
  "{key} version {version}": "{key} バージョン {version}",
  "Reviewed for selection": "選択対象としてレビュー済み",
  "Draft or retired": "下書きまたは廃止済み",
  "Correct answer: {answer}": "正解：{answer}",
  "Retire question version": "問題バージョンを廃止",
  "Review question version": "問題バージョンをレビュー",
  "Conditions for a new report": "新しいレポートの条件",
  "Changes here apply to the next report. Existing reports keep their saved inputs.":
    "ここでの変更は次回のレポートに適用します。既存レポートは保存済み入力を維持します。",
  "Workplace preferences: {workplaces}.": "希望する勤務形態：{workplaces}。",
  "Not specified": "未指定",
  "Edit my profile": "プロフィールを編集",
  "Self-reported relevant experience (years, optional)": "関連経験年数（自己申告・任意）",
  "Relevant experience years": "関連経験の年数",
  "Leaving a field unknown does not count as a conflict. Years alone do not verify relevant experience.":
    "不明のままでも条件との不一致にはなりません。年数だけでは関連経験を証明できません。",
  "education confirmation": "学歴の確認",
  "workAuthorization confirmation": "就労資格の確認",
  "I am not sure": "わかりません",
  "I report meeting this requirement": "この要件を満たすと申告します",
  "I report not meeting this requirement": "この要件を満たさないと申告します",
  "Education and work authorization stay unknown in a direction-wide report. Choose one role to confirm its exact listed conditions.":
    "分野全体のレポートでは学歴と就労資格は不明のままです。求人をひとつ選ぶと、記載された正確な条件を確認できます。",
  "Creating report…": "レポートを作成中…",
  "Create a fresh matching report": "新しいマッチングレポートを作成",
  "This rule-based analysis uses no external AI provider or AI allowance. It helps you explore opportunities; it does not decide employment eligibility.":
    "このルールベースの分析は外部AIやAI枠を使いません。仕事を探すための参考であり、採用資格を判定しません。",
  "LOCAL DEMO · FICTIONAL ROLES": "ローカルデモ・架空の求人",
  "Explore skill overlap.": "スキルの重なりを確認。",
  "This local preview compares selected skills with fictional role requirements. It is not private server matching or a hiring probability.":
    "選択したスキルと架空の求人要件を比べるプレビューです。非公開のサーバーマッチングや採用確率ではありません。",
  "{company} · Sample data": "{company}・サンプルデータ",
  "{covered} / {total} fixture skills selected.":
    "サンプルスキル {total}項目中{covered}項目を選択。",
  "Missing from the selected list: {skills}. Missing evidence does not prove inability.":
    "未選択のスキル：{skills}。裏付けがないことは、能力がないことを意味しません。",
  "Edit local demo skills": "デモのスキルを編集",
  queued: "待機中",
  running: "実行中",
  succeeded: "成功",
  invalidated: "無効化済み",
  "Matching is temporarily unavailable.": "マッチングを一時的に利用できません。",
  "REQUIREMENTS · EVIDENCE · NEXT ACTIONS": "求人要件・裏付け・次の行動",
  "Find opportunities with a clear reason.": "理由のわかるチャンスを。",
  "Compare published requirements with your own evidence. Unknown conditions stay unknown; coverage never means hiring probability.":
    "公開された要件と自分の裏付けを比較します。不明な条件は不明のまま扱い、カバー率を採用確率とは見なしません。",
  "Sign in to use private matching": "ログインして非公開マッチングを使う",
  "Reload matching workspace": "マッチング画面を更新",
  "Choose a direction or one target role": "分野か目標求人をひとつ選択",
  "Direction-wide reports use {track}.": "分野全体のレポートは{track}を使います。",
  "Change my direction": "方向性を変更",
  "Matching target role": "マッチングの目標求人",
  "All published roles in my direction": "自分の分野の公開済み求人すべて",
  "Load more target roles": "目標求人をさらに読み込む",
  "Report content removed": "レポート内容を削除済み",
  "Matching could not finish": "マッチングを完了できませんでした",
  "Matching is queued or running": "マッチングは待機中または実行中です",
  "Your matching report": "あなたのマッチングレポート",
  "Check report status": "レポート状況を確認",
  "This report is historical because its inputs changed. Create a fresh report before using it to prioritize current opportunities.":
    "入力が変わったため過去のレポートです。現在の求人の優先順位に使う前に新しく作成してください。",
  "An input evidence record was deleted. Its copied report content has been removed. Create a fresh report with current evidence.":
    "入力の裏付けが削除され、コピーされたレポート内容も削除しました。現在の裏付けで作り直してください。",
  "No partial report is published. Create a fresh report using current inputs; your previous report history stays separate.":
    "未完了のレポートは公開しません。現在の入力で新しく作成してください。過去の履歴は別に残ります。",
  "Your inputs are saved. You can leave and return while the independent worker computes the report.":
    "入力を保存しました。独立ワーカーが処理している間、ページを離れても大丈夫です。",
  "{count} source roles · Rule-based analysis · {date}. Conditions and evidence describe the saved inputs for this report.":
    "元の求人 {count}件・ルールベース分析・{date}。条件と裏付けは保存時点の入力を示します。",
  "Saved relevant experience: {value}.": "保存済み関連経験：{value}。",
  "{years} years (self-reported)": "{years}年（自己申告）",
  "No published roles matched the selected direction. Try a specific target or review the catalog later.":
    "選択した分野に公開済み求人がありません。特定の求人を選ぶか、後でカタログを確認してください。",
  "Load more matching results": "マッチング結果をさらに読み込む",
  "Your report history": "レポート履歴",
  "No private matching reports yet.": "非公開マッチングレポートはまだありません。",
  "Target role report": "目標求人のレポート",
  "Direction report": "分野別レポート",
  "Open matching report": "マッチングレポートを開く",
  "Load more report history": "レポート履歴をさらに読み込む",
  "Explore this opportunity": "このチャンスを詳しく見る",
  "Strengthen the supporting evidence": "裏付けを補強する",
  "Consider a longer-term target": "長期的な目標として検討する",
  "Review an explicit condition conflict": "明示された条件の不一致を確認する",
  Seniority: "職位・経験水準",
  confirmed: "確認済み",
  conflict: "不一致",
  unknown: "不明",
  "Historical role · no longer available": "過去の求人・現在は利用不可",
  "Historical report · refresh before using": "過去のレポート・利用前に更新",
  "Mandatory skills with linked support:": "裏付けのある必須スキル：",
  "Preferred:": "歓迎条件：",
  "Support may be self-reported or an unreviewed reference. These counts are not hiring probabilities or verified competency levels.":
    "自己申告や未レビューの参照を含みます。これらの件数は採用確率や認定済み能力を示しません。",
  "The source could not recently confirm availability. Check the original role before planning an application.":
    "最近の掲載状況を確認できませんでした。応募を計画する前に元の求人を確認してください。",
  "Requirements and their supporting sources": "要件と裏付けとなる出典",
  "This text has no reviewed skill mapping. Check it directly.":
    "この記述にはレビュー済みスキル対応がありません。直接確認してください。",
  "No linked support. This does not prove inability.":
    "関連する裏付けはありませんが、能力がないことを意味しません。",
  "needs practice": "練習が必要",
  "observed in one scenario": "ひとつのシナリオで確認",
  unverified: "未検証",
  "No additional context supplied.": "追加情報はありません。",
  "Review this evidence in my profile": "プロフィールでこの裏付けを確認",
  "Useful next actions": "役立つ次の行動",
  "{skill}: {reason}": "{skill}：{reason}",
  "Inspect the original role and prepare examples that demonstrate the linked skills.":
    "元の求人を確認し、関連スキルを示す実例を準備しましょう。",
  "Review published roles and original sources": "公開済み求人と元の掲載元を見る",
  "Use AI-assisted ordering for equal results": "同評価の求人をAIで並べ替える",
  "Needs your semantic ranking permission and uses one weekly allowance. It only orders roles the rules rate equally; strengths, gaps and conditions stay rule-based.":
    "意味に基づく順位付けの許可と週の利用枠1回分が必要です。同じルール評価の求人のみ並べ替え、強み、課題、条件はルールに基づきます。",
  "Strengths, gaps and conditions are rule-based. Only the order of equally rated roles may use an approved AI provider. It does not decide employment eligibility.":
    "強み、課題、条件はルールに基づきます。同評価の求人の順序のみ承認済みAIを使用する場合があります。採用資格は判定しません。",
  "AI-assisted ordering needs your semantic ranking permission in Account & privacy. This report uses rules only.":
    "AI順位付けにはアカウント画面での許可が必要です。このレポートはルールのみ使用します。",
  "Your weekly AI allowance is used up. This report uses rules only.":
    "週のAI利用枠を使い切りました。ルールのみ使用します。",
  "AI-assisted ordering is unavailable right now. This report uses rules only.":
    "AI順位付けを現在利用できません。ルールのみ使用します。",
  "AI ordering was not needed: the rules already ordered every role. Your allowance was returned.":
    "ルールで全求人を並べ替えられたため、AIは不要でした。利用枠を返却しました。",
  "AI ordering is not enabled on this deployment. Rules order shown; your allowance was returned.":
    "このデプロイではAI順位付けは無効です。ルールの順序を表示し、利用枠を返却しました。",
  "Permission was withdrawn before AI ordering ran. Rules order shown.":
    "AI実行前に許可が取り消されました。ルールの順序を表示します。",
  "AI ordering could not complete, so the rules order is shown.":
    "AI順位付けを完了できなかったため、ルールの順序を表示します。",
  "Equal rule results were ordered with AI assistance (semantic-rank-v1).":
    "同評価の求人をAIで並べ替えました（semantic-rank-v1）。",
  "Traditional Chinese translation · reviewed {date}": "繁体字中国語の翻訳・レビュー {date}",
  "Add a Traditional Chinese translation": "繁体字中国語の翻訳を追加",
  "Prompt (Traditional Chinese)": "設問（繁体字中国語）",
  "Option {number} (Traditional Chinese)": "選択肢 {number}（繁体字中国語）",
  "Explanation (Traditional Chinese)": "解説（繁体字中国語）",
  "Seniority fit has not been established. Skill overlap and self-reported years do not determine it.":
    "職位への適合は未確認です。スキルの重なりと自己申告年数だけでは判断できません。",
  "The listed workplace matches an explicit preference.":
    "求人の勤務形態が明示された希望と一致します。",
  "The listed workplace is outside the selected preferences.":
    "求人の勤務形態が選択された希望の範囲外です。",
  "Workplace or preference information is missing.": "勤務形態または希望の情報がありません。",
  "Self-reported years meet the listed minimum; relevance still needs review.":
    "自己申告年数は最低条件を満たしますが、関連性の確認が必要です。",
  "Self-reported years are below the listed minimum.": "自己申告年数が最低条件を下回っています。",
  "Experience requirements or self-reported years are unknown.":
    "必要経験または自己申告年数が不明です。",
  "The owner reports meeting this exact listed requirement; it is not independently verified.":
    "本人はこの要件を満たすと申告しています。独立した検証はされていません。",
  "The owner reports not meeting this listed requirement.":
    "本人はこの要件を満たさないと申告しています。",
  "No conclusion can be drawn from the available information.":
    "利用可能な情報からは判断できません。",
  "This recipe uses rules only; semantic/model ranking and narrative generation are unavailable.":
    "この処理はルールのみを使い、意味・モデルに基づく順位付けや文章生成は利用できません。",
  "Order within equal rule results used semantic-rank-v1; strengths, gaps and conditions remain rule-based.":
    "同評価内の順序はsemantic-rank-v1を使用しました。強み、課題、条件はルールに基づきます。",
  "A scored scenario suggests revisiting this skill; other claims remain separate.":
    "採点済みシナリオはこのスキルの復習を勧めています。他の申告は別に扱います。",
  "No supporting evidence is linked to this requirement. This does not prove inability.":
    "この要件に関連する裏付けはありません。能力がないことを意味しません。",
  "This textual requirement has no reviewed skill mapping; check it directly.":
    "この要件文にはレビュー済みスキル対応がありません。直接確認してください。",
  "Coverage counts linked observations, self-reports and unreviewed references; it does not establish independent mastery or hiring probability.":
    "カバー率は観察結果、自己申告、未レビューの参照を数えます。独力での習熟や採用確率を示しません。",
  "An unknown condition is not a conflict. Confirm it with the source before deciding.":
    "条件が不明であることは不一致ではありません。判断する前に出典を確認してください。",
  "At least {years} years": "{years}年以上",
} satisfies Messages;
