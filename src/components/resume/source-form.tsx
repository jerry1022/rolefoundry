"use client";
import { useRef, useState } from "react";
import { msg, useI18n } from "@/lib/i18n";
import { uploadIntentSchema, resumeLimits } from "@/modules/resume/model";
import type { ResumeClient } from "@/modules/resume/ports";
export function ResumeSourceForm({
  client,
  busy,
  onBegin,
  onSaved,
  onFailure,
  onFinish,
}: {
  client: ResumeClient;
  busy: boolean;
  onBegin: () => void;
  onSaved: (id: string) => Promise<void>;
  onFailure: (error: unknown) => void;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null),
    [text, setText] = useState(""),
    [message, setMessage] = useState("");
  const pending = useRef<{ payload: string; key: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  function key(payload: string) {
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    return pending.current.key;
  }
  async function upload() {
    if (!file) return;
    const mediaType =
      file.type ||
      (file.name.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const input = uploadIntentSchema.safeParse({
      filename: file.name,
      mediaType,
      byteCount: file.size,
    });
    if (!input.success) {
      setMessage(msg("Choose a PDF or DOCX file no larger than 5 MiB."));
      return;
    }
    onBegin();
    setMessage("");
    try {
      const authority = await client.intent(
          input.data,
          key(JSON.stringify({ ...input.data, lastModified: file.lastModified })),
        ),
        document = await client.upload(authority.documentId, authority.uploadToken, file);
      pending.current = null;
      await onSaved(document.id);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      onFailure(error);
    } finally {
      onFinish();
    }
  }
  async function paste() {
    if (!text.trim()) {
      setMessage(msg("Paste the text you want to review."));
      return;
    }
    onBegin();
    setMessage("");
    try {
      const result = await client.paste(text, key(JSON.stringify({ text })));
      pending.current = null;
      await onSaved(result.documentId);
      setText("");
    } catch (error) {
      onFailure(error);
    } finally {
      onFinish();
    }
  }
  return (
    <section className="panel section-block">
      <h2>{t("Add a private source")}</h2>
      <p className="muted">
        {t(
          "Text PDF or DOCX, up to 5 MiB. Scanned or password-protected documents can use the paste option. Your browser-local demo is imported only if you choose to copy and paste it.",
        )}
      </p>
      <fieldset className="profile-form-fields" disabled={busy}>
        <label>
          {t("Resume file")}
          <input
            aria-label={t("Resume file")}
            ref={fileInput}
            className="text-input"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              pending.current = null;
            }}
          />
        </label>
        <button className="button primary" disabled={!file || busy} onClick={() => void upload()}>
          {busy ? t("Saving private source…") : t("Upload private resume")}
        </button>
        <details>
          <summary>{t("Paste text instead")}</summary>
          <label>
            {t("Resume text")}
            <textarea
              aria-label={t("Paste resume text")}
              className="text-input resume-source-text"
              maxLength={resumeLimits.textCharacters}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <p className="fine-print">
            {t(
              "Paste only the statements you want to review. This creates a separate private source; it does not replace an uploaded file.",
            )}
          </p>
          <button
            className="button secondary"
            disabled={busy || !text.trim()}
            onClick={() => void paste()}
          >
            {t("Create a private text draft")}
          </button>
        </details>
      </fieldset>
      {message && <p role="alert">{t(message)}</p>}
    </section>
  );
}
