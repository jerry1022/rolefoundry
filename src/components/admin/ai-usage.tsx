"use client";
import { useEffect, useState } from "react";
import {
  summarizeUsage,
  usageWindows,
  type UsageReport,
  type UsageWindow,
} from "@/modules/gateway/usage";
import type { UsageClient } from "@/modules/gateway/adapters/http-client";
import { msg, useI18n } from "@/lib/i18n";
import { ApplicationError } from "@/modules/platform/errors";
import { TableScroll } from "../ui/table-scroll";

const windowLabels: Record<UsageWindow, string> = {
  1: msg("24 hours"),
  7: msg("7 days"),
  30: msg("30 days"),
};
const purposeLabels: Record<UsageReport["purposes"][number]["purpose"], string> = {
  "resume.wording": msg("Resume wording"),
  "matching.semantic-rank": msg("Semantic ordering"),
  "assessment.short-answer": msg("Short-answer calibration"),
  "resume.skill-extraction": msg("Skill extraction calibration"),
};

/** Estimated USD from micro-dollars; small amounts keep cents of a cent visible. */
function formatSpend(micros: number, locale: string) {
  const dollars = micros / 1_000_000;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars > 0 && dollars < 1 ? 4 : 2,
  }).format(dollars);
}

/**
 * Content-free AI usage for administrators: calls, outcomes, tokens, latency and estimated spend
 * from configured pricing. It reads recorded attempts only and never shows request or output text.
 */
export function AiUsageReport({ client }: { client: UsageClient }) {
  const { t, fmt, locale } = useI18n();
  const [windowDays, setWindowDays] = useState<UsageWindow>(7);
  const [report, setReport] = useState<UsageReport>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    client
      .report(windowDays, controller.signal)
      .then((value) => {
        setReport(value);
        setError("");
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setReport(undefined);
        setError(
          reason instanceof ApplicationError
            ? reason.message
            : msg("AI usage is temporarily unavailable."),
        );
      });
    return () => controller.abort();
  }, [client, windowDays]);

  const summary = report && summarizeUsage(report);
  const peak = Math.max(1, ...(report?.daily.map((day) => day.costMicros || day.tokens) ?? []));
  const spend = (micros: number) => formatSpend(micros, locale);

  return (
    <div className="ai-usage">
      <div className="ai-usage-toolbar">
        <p className="muted">
          {t(
            "Spend is estimated from the pricing configured for each route, not taken from provider invoices.",
          )}
        </p>
        <div className="segmented" role="group" aria-label={t("Usage window")}>
          {usageWindows.map((value) => (
            <button
              key={value}
              type="button"
              className={value === windowDays ? "selected" : ""}
              aria-pressed={value === windowDays}
              onClick={() => setWindowDays(value)}
            >
              {t(windowLabels[value])}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="notice warning" role="alert">
          {t(error)}
        </p>
      )}
      {!report && !error && <p role="status">{t("Loading AI usage…")}</p>}
      {report && summary && (
        <>
          <dl className="ai-usage-tiles">
            <div>
              <dt>{t("Provider calls")}</dt>
              <dd>{fmt.number(summary.calls)}</dd>
            </div>
            <div>
              <dt>{t("Failure rate")}</dt>
              <dd>
                {summary.failureRate === null
                  ? "—"
                  : fmt.percent(Math.round(summary.failureRate * 100))}
              </dd>
            </div>
            <div>
              <dt>{t("Tokens")}</dt>
              <dd>{fmt.number(summary.tokens)}</dd>
            </div>
            <div className={summary.spendComplete ? "" : "incomplete"}>
              <dt>{t("Estimated spend")}</dt>
              <dd>
                {spend(summary.costMicros)}
                {/* A description list allows only dt/dd children, so the note stays inside dd. */}
                {!summary.spendComplete && (
                  <small>
                    {t("{count} successful calls had no price estimate.", {
                      count: summary.unpricedCalls,
                    })}
                  </small>
                )}
              </dd>
            </div>
          </dl>
          {report.daily.length > 0 && (
            <figure className="ai-usage-daily">
              <figcaption>{t("Daily estimated spend (UTC)")}</figcaption>
              <ol>
                {report.daily.map((day) => (
                  <li
                    key={day.day}
                    title={`${day.day}: ${spend(day.costMicros)} · ${fmt.number(day.tokens)}`}
                  >
                    <span
                      className="bar"
                      style={{
                        height: `${Math.max(4, ((day.costMicros || day.tokens) / peak) * 100)}%`,
                      }}
                    />
                    <span className="sr-only">
                      {t("{day}: {spend}, {calls} calls", {
                        day: day.day,
                        spend: spend(day.costMicros),
                        calls: day.calls,
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            </figure>
          )}
          {report.providers.length === 0 ? (
            <p className="muted">{t("No provider calls were recorded in this window.")}</p>
          ) : (
            <TableScroll label={t("Usage by provider and model")}>
              <table>
                <caption className="sr-only">{t("Usage by provider and model")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("Provider")}</th>
                    <th scope="col">{t("Model")}</th>
                    <th scope="col">{t("Calls")}</th>
                    <th scope="col">{t("Failures")}</th>
                    <th scope="col">{t("Fallbacks")}</th>
                    <th scope="col">{t("Repairs")}</th>
                    <th scope="col">{t("Tokens in / out")}</th>
                    <th scope="col">{t("Latency p50 / p95")}</th>
                    <th scope="col">{t("Estimated spend")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.providers.map((row) => (
                    <tr key={`${row.provider}:${row.model}`}>
                      <td>{row.provider}</td>
                      <td>
                        <code>{row.model}</code>
                      </td>
                      <td>{fmt.number(row.calls)}</td>
                      <td>{fmt.number(row.failures)}</td>
                      <td>{fmt.number(row.fallbacks)}</td>
                      <td>{fmt.number(row.repairs)}</td>
                      <td>
                        {fmt.number(row.inputTokens)} / {fmt.number(row.outputTokens)}
                      </td>
                      <td>
                        {fmt.number(row.p50LatencyMs)} / {fmt.number(row.p95LatencyMs)} ms
                      </td>
                      <td>
                        {spend(row.costMicros)}
                        {row.unpricedCalls > 0 && " *"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          {report.purposes.length > 0 && (
            <TableScroll label={t("Outcomes by purpose")}>
              <table>
                <caption className="sr-only">{t("Outcomes by purpose")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("Purpose")}</th>
                    <th scope="col">{t("Results")}</th>
                    <th scope="col">{t("Succeeded")}</th>
                    <th scope="col">{t("Rejected")}</th>
                    <th scope="col">{t("Invalid output")}</th>
                    <th scope="col">{t("Provider failed")}</th>
                    <th scope="col">{t("Abandoned")}</th>
                    <th scope="col">{t("Estimated spend")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.purposes.map((row) => (
                    <tr key={row.purpose}>
                      <td>{t(purposeLabels[row.purpose])}</td>
                      <td>{fmt.number(row.results)}</td>
                      <td>{fmt.number(row.succeeded)}</td>
                      <td>{fmt.number(row.rejected)}</td>
                      <td>{fmt.number(row.invalid)}</td>
                      <td>{fmt.number(row.providerFailed)}</td>
                      <td>{fmt.number(row.abandoned)}</td>
                      <td>{spend(row.costMicros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </>
      )}
    </div>
  );
}
