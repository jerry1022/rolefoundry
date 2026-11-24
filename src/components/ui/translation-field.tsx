"use client";

/** Published source text beside its reviewed Traditional Chinese input. */
export function TranslationField({
  source,
  label,
  value,
  maxLength,
  multiline = false,
  onChange,
}: {
  source: string;
  label: string;
  value: string;
  maxLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const shared = {
    className: "text-input",
    lang: "zh-Hant",
    maxLength,
    value,
  };
  return (
    <div className="job-translation-pair">
      <p className="source" lang="en">
        {source}
      </p>
      <label>
        <span>{label}</span>
        {multiline ? (
          <textarea {...shared} rows={4} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input {...shared} onChange={(event) => onChange(event.target.value)} />
        )}
      </label>
    </div>
  );
}
