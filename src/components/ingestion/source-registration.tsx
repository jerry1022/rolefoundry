"use client";
import { useState } from "react";
import Link from "next/link";
import { msg, useI18n } from "@/lib/i18n";
import { publicationFields, sourcePolicySchema, type SourcePolicy } from "@/modules/jobs/model";
/** Registration records an operator's supplied policy; it does not grant copying permission. */
export function JobSourceRegistration({
  busy,
  register,
}: {
  busy: boolean;
  register: (policy: SourcePolicy) => Promise<void>;
}) {
  const { t } = useI18n();
  const [beforeLink, afterLink] = t(
    "For course sources, use {link} to select an approved provider.",
  ).split("{link}");
  const [policy, setPolicy] = useState<SourcePolicy>({
      name: "",
      publisher: "",
      authorizationBasis: "",
      rightsSummary: "",
      allowedHosts: [],
      permittedFields: [],
      isDemo: false,
    }),
    [hosts, setHosts] = useState(""),
    [error, setError] = useState("");
  return (
    <details>
      <summary>{t("Register a job metadata source")}</summary>
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = sourcePolicySchema.safeParse({
            ...policy,
            allowedHosts: hosts.split(/[,\s]+/).filter(Boolean),
          });
          if (!parsed.success) {
            setError(
              msg(
                "Complete the source policy, use lowercase hostnames without paths, and select the fields you are authorized to publish.",
              ),
            );
            return;
          }
          setError("");
          void register(parsed.data);
        }}
      >
        <p>
          {t(
            "Record the publisher and your authorization basis before enabling uploads. Source registration does not verify or grant rights.",
          )}{" "}
          {beforeLink}
          <Link href="/learning/">{t("course administration")}</Link>
          {afterLink}
        </p>
        {error && <p role="alert">{t(error)}</p>}
        <fieldset className="profile-form-fields" disabled={busy}>
          {(
            [
              ["name", msg("Job source name"), 160],
              ["publisher", msg("Job source publisher"), 200],
              ["authorizationBasis", msg("Job source authorization basis (private)"), 2000],
              ["rightsSummary", msg("Job source public rights summary"), 500],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {t(label)}
              <textarea
                className="text-input"
                aria-label={t(label)}
                required
                maxLength={max}
                value={policy[key]}
                onChange={(event) => setPolicy({ ...policy, [key]: event.target.value })}
              />
            </label>
          ))}
          <label>
            {t("Allowed source hostnames")}
            <textarea
              className="text-input"
              aria-label={t("Job source allowed hostnames")}
              required
              maxLength={5100}
              value={hosts}
              onChange={(event) => setHosts(event.target.value)}
              placeholder="jobs.publisher.example"
            />
          </label>
          <fieldset>
            <legend>{t("Permitted job metadata fields")}</legend>
            {publicationFields.map((field) => (
              <label key={field}>
                <input
                  type="checkbox"
                  checked={policy.permittedFields.includes(field)}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      permittedFields: event.target.checked
                        ? [...policy.permittedFields, field]
                        : policy.permittedFields.filter((value) => value !== field),
                    })
                  }
                />
                {field}
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={policy.isDemo}
              onChange={(event) => setPolicy({ ...policy, isDemo: event.target.checked })}
            />
            {t("This source contains fictional demonstration metadata")}
          </label>
          <button className="button secondary" type="submit">
            {t("Register job source with uploads disabled")}
          </button>
        </fieldset>
      </form>
    </details>
  );
}
