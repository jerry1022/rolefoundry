import { latencyBoundsMs, telemetrySnapshotSchema, type TelemetrySnapshot } from "./model";
export const metricsContentType = "application/openmetrics-text; version=1.0.0; charset=utf-8";
/** All dimensions are schema-enumerated; resource IDs and free-form strings cannot become labels. */
export function renderMetrics(input: TelemetrySnapshot) {
  const snapshot = telemetrySnapshotSchema.parse(input),
    lines: string[] = [];
  const gauge = (
    name: string,
    help: string,
    samples: { labels?: string; value: string | number }[],
  ) => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    for (const sample of samples)
      lines.push(`${name}${sample.labels ? `{${sample.labels}}` : ""} ${sample.value}`);
  };
  gauge("rolefoundry_exporter_up", "Validated database snapshot is available.", [{ value: 1 }]);
  gauge(
    "rolefoundry_course_link_metrics_available",
    "Course link observation schema is available; does not imply an enabled source policy.",
    [{ value: snapshot.courseLinks ? 1 : 0 }],
  );
  if (snapshot.courseLinks) {
    for (const [key, suffix] of [
      ["checked", "checked"],
      ["uncertain", "uncertain"],
      ["unprobed", "unprobed"],
      ["pausedHosts", "paused_hosts"],
      ["oldestCheckSeconds", "oldest_check_seconds"],
    ] as const) {
      const value = snapshot.courseLinks[key];
      gauge(
        `rolefoundry_course_links_${suffix}`,
        "Current published course HEAD observation state; not editorial review.",
        value === null ? [] : [{ value }],
      );
    }
  }
  gauge("rolefoundry_snapshot_timestamp_seconds", "Database observation time.", [
    { value: Date.parse(snapshot.observedAt) / 1000 },
  ]);
  for (const [field, suffix] of [
    ["queued", "queued"],
    ["ready", "ready"],
    ["running", "running"],
    ["failed24h", "failed_24h"],
    ["succeeded24h", "succeeded_24h"],
    ["retried24h", "retried_24h"],
    ["expiredLeases", "expired_leases"],
    ["oldestReadySeconds", "oldest_ready_seconds"],
    ["maxLeaseAgeSeconds", "max_lease_age_seconds"],
    ["activeWorkers", "active_workers"],
  ] as const)
    gauge(
      `rolefoundry_tasks_${suffix}`,
      `Observed task ${suffix.replaceAll("_", " ")}.`,
      snapshot.operations.kinds.flatMap((kind) =>
        kind[field] === null ? [] : [{ labels: `kind="${kind.kind}"`, value: kind[field]! }],
      ),
    );
  gauge("rolefoundry_queue_messages", "Current task delivery count.", [
    { value: snapshot.operations.deliveryCount },
  ]);
  gauge("rolefoundry_queue_poison_24h", "Poison observations during the last day.", [
    { value: snapshot.operations.poison24h },
  ]);
  for (const field of ["pending", "leased", "retrying", "oldestSeconds"] as const)
    gauge(
      `rolefoundry_invalidations_${field === "oldestSeconds" ? "oldest_seconds" : field}`,
      "Invalidation delivery state.",
      snapshot.invalidations.flatMap((item) =>
        item[field] === null
          ? []
          : [{ labels: `consumer="${item.consumer}"`, value: item[field]! }],
      ),
    );
  for (const field of [
    "published",
    "unreviewed",
    "uncertain",
    "unavailable",
    "oldestReviewSeconds",
  ] as const)
    gauge(
      `rolefoundry_catalog_${field === "oldestReviewSeconds" ? "oldest_review_seconds" : field}`,
      "Reviewed catalog metadata state; no external link probe.",
      snapshot.sources.flatMap((item) =>
        item[field] === null ? [] : [{ labels: `catalog="${item.catalog}"`, value: item[field]! }],
      ),
    );
  for (const [field, name, help] of [
    ["calls", "calls_24h", "Recorded gateway provider attempts in the last 24 hours."],
    ["failures", "failures_24h", "Gateway provider attempts that did not return valid output."],
    ["fallbacks", "fallbacks_24h", "Policy-approved fallback attempts in the last 24 hours."],
    ["inputTokens", "input_tokens_24h", "Provider-reported input tokens in the last 24 hours."],
    ["outputTokens", "output_tokens_24h", "Provider-reported output tokens in the last 24 hours."],
  ] as const)
    gauge(
      `rolefoundry_ai_${name}`,
      help,
      (snapshot.gateway ?? []).map((item) => ({
        labels: `provider="${item.provider}"`,
        value: item[field],
      })),
    );
  gauge(
    "rolefoundry_provider_integration_enabled",
    "AI provider integration is not enabled in this implementation.",
    [{ value: 0 }],
  );
  const groups = new Map<string, { counts: Map<number, bigint>; sum: bigint }>();
  for (const item of snapshot.http) {
    const labels = `family="${item.family}",method="${item.method}",status_class="${item.statusClass}xx"`;
    let group = groups.get(labels);
    if (!group) {
      group = { counts: new Map(), sum: 0n };
      groups.set(labels, group);
    }
    group.counts.set(item.upperMs, (group.counts.get(item.upperMs) ?? 0n) + BigInt(item.count));
    group.sum += BigInt(item.sumMs);
  }
  lines.push(
    "# HELP rolefoundry_http_request_duration_seconds Instrumented API time to handler response.",
    "# TYPE rolefoundry_http_request_duration_seconds histogram",
  );
  const requests: string[] = [];
  for (const [labels, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    let cumulative = 0n;
    for (const bound of latencyBoundsMs) {
      cumulative += group.counts.get(bound) ?? 0n;
      lines.push(
        `rolefoundry_http_request_duration_seconds_bucket{${labels},le="${bound === 2147483647 ? "+Inf" : bound / 1000}"} ${cumulative}`,
      );
    }
    lines.push(
      `rolefoundry_http_request_duration_seconds_count{${labels}} ${cumulative}`,
      `rolefoundry_http_request_duration_seconds_sum{${labels}} ${group.sum / 1000n}.${(group.sum % 1000n).toString().padStart(3, "0")}`,
    );
    requests.push(`rolefoundry_http_requests_total{${labels}} ${cumulative}`);
  }
  lines.push(
    "# HELP rolefoundry_http_requests Instrumented API requests.",
    "# TYPE rolefoundry_http_requests counter",
    ...requests,
    "# EOF",
    "",
  );
  return lines.join("\n");
}
