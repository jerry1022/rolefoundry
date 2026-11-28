import type { Messages } from "../zh-TW/types";

export const resumeTracking = {
  "PRIVATE SOURCES · CONFIRMED FACTS": "非公開の元資料・確認済みの事実",
  "Express your experience with facts you can stand behind.":
    "裏付けられる事実で、経験を伝えよう。",
  "Review extracted statements, save confirmed versions and choose how they fit a target role. Proposals preserve your facts; exports refer to a fixed version.":
    "抽出した記述を確認し、確定版を保存して目標求人との関係を選びます。提案は事実を保持し、出力は固定バージョンを参照します。",
  "The private resume workspace is temporarily unavailable.":
    "非公開履歴書ワークスペースを一時的に利用できません。",
  "Sign in to your private workspace": "非公開ワークスペースにログイン",
  "Reload private resume data": "非公開の履歴書データを再読み込み",
  "Loading private resume history…": "非公開の履歴書履歴を読み込み中…",
  "{count} linked, unreviewed resume claims": "関連する未レビューの履歴書申告 {count}件",
  "Retry parsing this source": "このソースの解析を再試行",
  "The source upload is not complete. Choose a new source above or remove this unfinished draft.":
    "アップロードは未完了です。新しいソースを選ぶか、この未完了下書きを削除してください。",
  "Check resume status": "履歴書の状態を確認",
  "Delete this private resume": "この非公開履歴書を削除",
  "Automatic status checks paused. You can check again while the worker continues.":
    "自動状態確認を停止しました。ワーカーは継続しており、手動で再確認できます。",
  "Delete this source, its confirmed versions, proposals, exports and linked resume claims? Reports based on those claims will be invalidated.":
    "このソース、確定版、提案、出力、関連する申告を削除しますか？関連レポートは無効になります。",
  "Delete source and derived data": "ソースと派生データを削除",
  "Keep this source": "このソースを保持",
  "Targeted review and fixed exports": "目標に合わせた確認と固定版出力",
  "Resume target role": "履歴書の目標求人",
  "Load more resume target roles": "目標求人をさらに読み込む",
  "Suggest a fact-preserving order": "事実を保つ並び順を提案",
  "Create a fixed PDF export": "固定版PDFを作成",
  "Review linked claims in your skill profile": "スキルプロフィールで関連申告を確認",
  "Confirmed version history": "確定版の履歴",
  "View version {version}": "バージョン {version}を見る",
  "Private proposal history": "非公開の提案履歴",
  "historical inputs": "過去の入力",
  "Review proposal": "提案を確認",
  "Export this historical version": "この過去バージョンを出力",
  "Private PDF exports": "非公開のPDF出力",
  "Each PDF uses its selected confirmed version. Download authority expires and is checked against your session and the source's current access.":
    "各PDFは選択した確定版を使います。ダウンロード権限には有効期限があり、セッションとソースの現在のアクセスを確認します。",
  "PDF · version {version}": "PDF・バージョン {version}",
  "PDF · version saved": "PDF・版を保存済み",
  "Download fixed PDF": "固定版PDFをダウンロード",
  "Resume access and derived claims were removed. Private file cleanup is continuing in the background.":
    "履歴書へのアクセスと派生申告を削除しました。非公開ファイルの削除はバックグラウンドで続けています。",
  "Resume and derived claims were removed.": "履歴書と派生申告を削除しました。",
  "No extractable text was found. Scanned documents can use the paste-text option.":
    "抽出可能なテキストがありません。スキャン文書はテキスト貼り付けを利用できます。",
  "Use an unencrypted text PDF, or paste the statements you want to review.":
    "暗号化されていないテキストPDFを使うか、確認したい記述を貼り付けてください。",
  "This file could not be parsed safely. Its original is retained; try a text PDF/DOCX or paste text.":
    "安全に解析できませんでした。元ファイルは保持しています。テキストPDF、DOCX、貼り付けを試してください。",
  "This document contains unsupported content. Use a plain text PDF/DOCX or the paste option.":
    "未対応の内容を含みます。プレーンなテキストPDF、DOCX、貼り付けを使用してください。",
  "The file or extracted content exceeds the processing limits. Try a smaller source.":
    "ファイルまたは抽出内容が処理上限を超えています。小さいソースで試してください。",
  "The PDF font cannot represent a character in this version. Review the text before creating another export.":
    "この版にPDFフォントで表示できない文字があります。テキストを確認してから再出力してください。",
  "Document processing exceeded its time limit. The original source is unchanged.":
    "文書処理が時間上限を超えました。元のソースは変更していません。",
  "The document processor was unavailable. The original source is unchanged.":
    "文書処理サービスを利用できませんでした。元のソースは変更していません。",
  "The result did not pass validation. No partial result was published.":
    "結果の検証に失敗しました。部分的な結果は公開していません。",
  "Choose a PDF or DOCX file no larger than 5 MiB.": "5 MiB以下のPDFまたはDOCXを選択してください。",
  "Paste the text you want to review.": "確認したいテキストを貼り付けてください。",
  "Add a private source": "非公開ソースを追加",
  "Text PDF or DOCX, up to 5 MiB. Scanned or password-protected documents can use the paste option. Your browser-local demo is imported only if you choose to copy and paste it.":
    "テキストPDFまたはDOCX、最大5 MiB。スキャン・保護された文書は貼り付けを使えます。ブラウザーのデモは自分でコピーする場合のみ取り込みます。",
  "Resume file": "履歴書ファイル",
  "Saving private source…": "非公開ソースを保存中…",
  "Upload private resume": "非公開の履歴書をアップロード",
  "Paste text instead": "代わりにテキストを貼り付け",
  "Resume text": "履歴書のテキスト",
  "Paste resume text": "履歴書テキストを貼り付け",
  "Paste only the statements you want to review. This creates a separate private source; it does not replace an uploaded file.":
    "確認したい記述のみ貼り付けてください。別の非公開ソースを作成し、アップロード済みファイルは置き換えません。",
  "Create a private text draft": "非公開テキスト下書きを作成",
  "Your private sources": "あなたの非公開ソース",
  "No saved resume sources yet.": "保存済みソースはまだありません。",
  "Open private source": "非公開ソースを開く",
  "Load more private sources": "非公開ソースをさらに読み込む",
  "Review and confirm the facts": "事実を確認して確定",
  "Extracted text is a draft. Check each statement, completion state and linked skill. Confirmed links become unreviewed resume claims in your private skill profile; learning goals do not become ability evidence.":
    "抽出テキストは下書きです。各記述、完了状態、関連スキルを確認してください。確定した関連付けは未レビューの履歴書申告となり、学習目標は能力の裏付けになりません。",
  "A newer source version is available. Your unsaved edits are still here. Review it before confirming again.":
    "新しいソース版があります。未保存の編集は保持しています。再確定前に確認してください。",
  "Discard draft and load latest facts": "下書きを破棄して最新の事実を読み込む",
  "Load latest confirmed facts": "最新の確定事実を読み込む",
  "Keep this draft for review": "この下書きを確認用に残す",
  "Keeping this draft allows a new confirmation against the latest revision. Review the current version before replacing its claims.":
    "下書きを残すと最新リビジョンに対して新しく確定できます。申告を置き換える前に現在の版を確認してください。",
  "Section heading": "セクション見出し",
  "Resume section heading": "履歴書のセクション見出し",
  "Move a statement here to use this section. Empty sections are omitted when confirming.":
    "このセクションを使うには記述を移動してください。確定時に空のセクションは除外します。",
  "Statement {number}": "記述 {number}",
  "Extracted page {page}": "抽出元ページ {page}",
  "Extracted text": "抽出テキスト",
  "Owner-added statement": "本人が追加した記述",
  "Statement text": "記述のテキスト",
  "This statement is too long. Split it without dropping its text, or edit it before confirming.":
    "記述が長すぎます。内容を落とさず分割するか、確定前に編集してください。",
  "Split long statement": "長い記述を分割",
  "Statement type": "記述の種類",
  "Statement type {number}": "記述の種類 {number}",
  experience: "経験",
  project: "プロジェクト",
  education: "学歴",
  credential: "資格",
  "skill-claim": "スキルの申告",
  contact: "連絡先",
  other: "その他",
  "Completion state": "完了状態",
  "Completion state {number}": "完了状態 {number}",
  Unspecified: "未指定",
  "In progress": "進行中",
  "Learning goal": "学習目標",
  Section: "セクション",
  "Section for statement {number}": "記述 {number}のセクション",
  "Untitled section": "無題のセクション",
  "Linked skills (up to 20)": "関連スキル（最大20件）",
  "Linked skills {number}": "関連スキル {number}",
  "Review the extracted source": "抽出元を確認",
  "Remove statement": "記述を削除",
  "Add a statement": "記述を追加",
  "Add a section": "セクションを追加",
  "Removing a linked statement or changing it to a learning goal removes its profile claim and can invalidate reports based on it. Your confirmation creates a new version; it never edits an older one.":
    "関連する記述の削除や学習目標への変更ではプロフィール申告も削除し、関連レポートを無効にする場合があります。確定は新しい版を作り、古い版は編集しません。",
  "Review empty or oversized statements, section names and skill counts before confirming.":
    "空欄・長すぎる記述、セクション名、スキル数を確認してから確定してください。",
  "Confirming facts…": "事実を確定中…",
  "Confirm facts and linked claims": "事実と関連申告を確定",
  "Unsaved edits stay in this tab until you confirm or leave.":
    "確定するかページを離れるまで、未保存の編集をこのタブに保持します。",
  "Review suggested changes": "提案された変更を確認",
  "This deterministic fallback reorders exact confirmed statements for the target role. It does not write new claims or give an ATS score.":
    "固定ルールの代替処理で、目標求人に合わせて確定済みの記述をそのまま並べ替えます。新しい実績やATSスコアは作りません。",
  "This proposal uses earlier inputs. Create a fresh proposal before accepting changes.":
    "古い入力に基づく提案です。変更を採用する前に新しく作成してください。",
  "Your individual choices were saved as a new version.":
    "個別の選択を新しいバージョンとして保存しました。",
  "View accepted version": "採用した版を見る",
  "The worker is preparing this proposal.": "ワーカーが提案を準備中です。",
  "No proposal was published. Your confirmed source is unchanged.":
    "提案は公開されませんでした。確定した元データは変更していません。",
  "Accept this change": "この変更を採用",
  "Use this change": "この変更を使う",
  Before: "変更前",
  After: "変更後",
  "The existing statement order already fits this rule-based suggestion. No wording was invented.":
    "現在の並び順はルールの提案に合っています。新しい表現は作っていません。",
  "Save selected changes as a new version": "選択した変更を新しい版として保存",
  "Questions for missing evidence": "不足する裏付けへの質問",
  "Suggestion limits": "提案の制約",
  "Confirmed version {version}": "確定版 {version}",
  "Saved {date}. This version is immutable. Later edits create separate versions.":
    "保存日 {date}。この版は変更不可です。後の編集では別の版を作成します。",
  "Owner-reported complete": "本人が完了を申告",
  "Owner-confirmed statement": "本人が確認した記述",
  "PRIVATE · MANUAL PROGRESS": "非公開・手動での進捗管理",
  "Track preparation, your reported applications and the next action. Visiting a source never changes a stage.":
    "準備、自己申告の応募、次の行動を記録します。掲載元を見るだけでは段階は変わりません。",
  "The tracker is temporarily unavailable. Retry without changing your draft.":
    "応募管理を一時的に利用できません。下書きを変えずに再試行してください。",
  "Your account changed. Refresh the private tracker.":
    "アカウントが変わりました。非公開の応募管理を更新してください。",
  "Published roles could not be loaded. Existing tracker records remain available.":
    "公開求人を読み込めませんでした。既存の応募記録は利用できます。",
  "Reload published roles if the catalog changed.":
    "カタログが変わった場合は公開求人を再読み込みしてください。",
  "The record, event history and follow-ups were deleted.":
    "記録、イベント履歴、フォローアップを削除しました。",
  "Refresh private tracker": "非公開の応募管理を更新",
  "Loading private tracker…": "非公開の応募管理を読み込み中…",
  "Sign in for your private tracker": "ログインして非公開の応募管理を使う",
  "Your browser-local demo is not uploaded automatically.":
    "ブラウザー内のデモは自動で送信されません。",
  "Account and sign in": "アカウントとログイン",
  "Track a published role": "公開求人を追跡",
  "This records preparation as Saved. A closed cycle stays closed until you explicitly create a new one.":
    "準備を「保存済み」として記録します。終了したサイクルは、明示的に新しいサイクルを作るまで終了のままです。",
  "Published role": "公開済み求人",
  "Role to track": "追跡する求人",
  "No published roles available": "公開済み求人はありません",
  "Show more published roles": "公開求人をさらに表示",
  "Track selected role": "選択した求人を追跡",
  "Selected application record": "選択中の応募記録",
  "{company} · cycle {cycle} · {stage} · revision {revision}":
    "{company}・サイクル {cycle}・{stage}・リビジョン {revision}",
  "Preparation only": "準備のみ",
  "{stage} (user-reported)": "{stage}（自己申告）",
  "Saved job snapshot.": "保存時の求人スナップショット。",
  "The catalog currently has this role; verify availability at its source.":
    "現在カタログにある求人です。掲載元で提供状況を確認してください。",
  "This listing is no longer available in the catalog. Your notes and history remain accessible.":
    "この求人はカタログで利用できません。メモと履歴は引き続き閲覧できます。",
  "Fictional demonstration role": "架空のデモ求人",
  "Historical source · current link unavailable": "過去の掲載元・現在のリンクは利用不可",
  "The saved source had uncertain availability. A failed check does not prove closure.":
    "保存時のソースは掲載状況が不確かでした。確認失敗だけで終了とは判断できません。",
  "Opening a source does not submit an application. No automatic submission or outcome verification occurs.":
    "掲載元を開いても応募は送信されません。自動応募や結果検証はしません。",
  "Start a new application cycle": "新しい応募サイクルを開始",
  "Remove this private record": "この非公開記録を削除",
  "Deletes this cycle, its private notes, events and follow-ups. It does not delete the independent resume source.":
    "このサイクル、非公開メモ、イベント、フォローアップを削除します。独立した履歴書ソースは削除しません。",
  "Confirm application deletion": "応募記録の削除を確認",
  "Confirm record deletion": "記録の削除を確認",
  "Keep record": "記録を残す",
  "Delete this record": "この記録を削除",
  "Tracked roles": "追跡中の求人",
  "Your tracked roles": "あなたの追跡中の求人",
  "{count} loaded record": "{count}件を読み込み済み",
  "{count} loaded records": "{count}件を読み込み済み",
  "more history available": "さらに履歴があります",
  "Choose a role to begin a private record.": "求人を選んで非公開記録を始めましょう。",
  "{company} · cycle {cycle} · {stage}": "{company}・サイクル {cycle}・{stage}",
  "listing unavailable": "求人は利用不可",
  "Show earlier tracked roles": "以前の追跡求人を表示",
  "Refresh tracked roles": "追跡求人を更新",
  "Edit tracked role": "追跡求人を編集",
  "Record your progress": "進捗を記録",
  "Stages are your own report. Saving here sends no application or message. No response does not mean rejection.":
    "段階は本人の申告です。保存しても応募やメッセージは送信しません。返信がないことは不採用を意味しません。",
  "This record changed. Your unsaved draft is retained.":
    "記録が変更されました。未保存の下書きは保持しています。",
  "Load latest saved fields": "最新の保存済み項目を読み込む",
  "Keep draft for review on latest revision": "最新リビジョンでの確認用に下書きを残す",
  Stage: "段階",
  "Application stage": "応募の段階",
  "Private note": "非公開メモ",
  "Application note": "応募メモ",
  "Submission reference (optional)": "提出の参照（任意）",
  "Submission reference": "提出の参照",
  "This is a private reference you supply; it is not independent confirmation.":
    "本人が入力した非公開参照です。独立した確認ではありません。",
  "Confirmed resume version": "確定した履歴書バージョン",
  "No version selected": "バージョン未選択",
  "{filename} · version {version}": "{filename}・バージョン {version}",
  "Show more resume versions": "履歴書の版をさらに表示",
  "Save application record": "応募記録を保存",
  "View selected fixed resume version ↗": "選択した固定版履歴書を見る ↗",
  "Deleting that source removes this link. Tracking keeps no copy of its statements.":
    "元のソースを削除するとリンクも削除します。応募管理は記述のコピーを保持しません。",
  "Choose an existing date and time in your device timezone.":
    "端末のタイムゾーンで日時を選択してください。",
  "The record changed. Review the current tasks before saving this draft.":
    "記録が変更されました。保存する前に現在のタスクを確認してください。",
  "Use latest revision for this draft": "この下書きに最新リビジョンを使用",
  "Next step": "次の行動",
  "Edit next step": "次の行動を編集",
  "Due date and time": "期日と時刻",
  "Edit due date and time": "期日と時刻を編集",
  "Save follow-up": "フォローアップを保存",
  "Add follow-up": "フォローアップを追加",
  "Cancel follow-up edit": "フォローアップ編集をキャンセル",
  "Follow-up tasks": "フォローアップタスク",
  "Next actions": "次のアクション",
  "Dates use your device timezone and are stored in UTC. These are private reminders on this page; no email or calendar messages are sent.":
    "日時は端末のタイムゾーンで表示し、UTCで保存します。このページ内の非公開リマインダーです。メールや予定の通知は送信しません。",
  "No next action recorded.": "次の行動は未登録です。",
  Open: "未完了",
  Overdue: "期限超過",
  "Edit follow-up": "フォローアップを編集",
  "Remove follow-up": "フォローアップを削除",
  "Confirm follow-up removal": "フォローアップ削除を確認",
  "Remove this follow-up?": "このフォローアップを削除しますか？",
  "Keep follow-up": "フォローアップを残す",
  "Application event history": "応募イベント履歴",
  "Your record history": "記録の履歴",
  "Every stage is manually reported. Edits and follow-ups do not imply an application was submitted.":
    "すべての段階は手動申告です。編集やフォローアップは応募送信を意味しません。",
  "{from} → {to} (user-reported)": "{from} → {to}（自己申告）",
  "Tracked as Saved": "保存済みとして追跡開始",
  "Deleted resume source unlinked": "削除済み履歴書ソースのリンクを解除",
  "Follow-up updated": "フォローアップを更新",
  "Private fields updated": "非公開項目を更新",
  "revision {revision}": "リビジョン {revision}",
  "Your reference: {reference}": "本人の参照：{reference}",
  "Loading history…": "履歴を読み込み中…",
  "Show earlier events": "以前のイベントを表示",
  "Refresh event history": "イベント履歴を更新",
  "AI wording is not enabled on this deployment. Your allowance was returned.":
    "このデプロイではAI表現提案は無効です。利用枠を返却しました。",
  "No statement was long enough to reword. Your allowance was returned.":
    "言い換えに十分な長さの記述がありません。利用枠を返却しました。",
  "Permission was withdrawn before AI wording ran.": "AI表現提案の実行前に許可が取り消されました。",
  "The suggestions changed facts or numbers, so none are shown.":
    "提案が事実や数値を変えたため、表示しません。",
  "AI wording could not complete. The order proposal is still available.":
    "AI表現提案を完了できませんでした。並び順の提案は利用できます。",
  "AI wording suggestions": "AIによる表現提案",
  "Each suggestion rewrites one confirmed statement without adding facts or numbers. Use one to edit your draft, check it, then confirm a new version.":
    "各提案は事実や数値を加えずに、確認済みの記述をひとつ言い換えます。下書きに適用し、確認してから新しい版を確定してください。",
  "Use in my draft": "下書きに使う",
  "Your statements already read clearly; no rewording suggested.":
    "現在の記述は明確です。言い換えの提案はありません。",
  "Your weekly AI allowance is used up; the order proposal was still created.":
    "週のAI枠を使い切りました。並び順の提案は作成しました。",
  "AI wording needs your resume analysis permission in Account & privacy; the order proposal was still created.":
    "AI表現提案にはアカウント画面で履歴書分析の許可が必要です。並び順の提案は作成しました。",
  "Confirmed version {version}. Order suggestions reorder existing statements. Optional AI wording is only a suggestion until you edit and confirm it.":
    "確定版 {version}。並び順の提案は既存の記述を並べ替えます。任意のAI表現は、自分で編集して確定するまで提案に留まります。",
  "Also suggest clearer wording with AI": "AIでより明確な表現も提案",
  "Needs your resume analysis permission and uses one weekly allowance. Suggestions keep every fact and number, and change nothing until you confirm.":
    "履歴書分析の許可と週の利用枠1回分が必要です。事実と数値を維持し、確定するまで変更しません。",
  "Suggestion added to your draft. Review it, then confirm a new version.":
    "下書きに提案を追加しました。確認してから新しい版を確定してください。",
} satisfies Messages;
