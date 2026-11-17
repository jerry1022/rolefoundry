"use client";
import { useState } from "react";
import Link from "next/link";
import { publicationFields, sourcePolicySchema, type SourcePolicy } from "@/modules/jobs/model";
/** Registration records an operator's supplied policy; it does not grant copying permission. */
export function JobSourceRegistration({
  busy,
  register,
}: {
  busy: boolean;
  register: (policy: SourcePolicy) => Promise<void>;
}) {
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
      <summary>Register a job metadata source</summary>
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
              "Complete the source policy, use lowercase hostnames without paths, and select the fields you are authorized to publish.",
            );
            return;
          }
          setError("");
          void register(parsed.data);
        }}
      >
        <p>
          Record the publisher and your authorization basis before enabling uploads. Source
          registration does not verify or grant rights. For course sources, use{" "}
          <Link href="/learning/">course administration</Link> to select an approved provider.
        </p>
        {error && <p role="alert">{error}</p>}
        <fieldset className="profile-form-fields" disabled={busy}>
          {(
            [
              ["name", "Job source name", 160],
              ["publisher", "Job source publisher", 200],
              ["authorizationBasis", "Job source authorization basis (private)", 2000],
              ["rightsSummary", "Job source public rights summary", 500],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label}
              <textarea
                className="text-input"
                aria-label={label}
                required
                maxLength={max}
                value={policy[key]}
                onChange={(event) => setPolicy({ ...policy, [key]: event.target.value })}
              />
            </label>
          ))}
          <label>
            Allowed source hostnames
            <textarea
              className="text-input"
              aria-label="Job source allowed hostnames"
              required
              maxLength={5100}
              value={hosts}
              onChange={(event) => setHosts(event.target.value)}
              placeholder="jobs.publisher.example"
            />
          </label>
          <fieldset>
            <legend>Permitted job metadata fields</legend>
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
            This source contains fictional demonstration metadata
          </label>
          <button className="button secondary" type="submit">
            Register job source with uploads disabled
          </button>
        </fieldset>
      </form>
    </details>
  );
}
