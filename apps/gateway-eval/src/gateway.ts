import { AIGateway } from "../../../src/modules/gateway/service";
import { FakeAdapter } from "../../../src/modules/gateway/adapters/fake";
import { adaptersFromEnvironment } from "../../../src/modules/gateway/adapters/registry";
import { parseGatewayPolicy } from "../../../src/modules/gateway/policy";
import { gatewayTemplates } from "../../../src/modules/gateway/recipes";
import type { GatewayPurpose } from "../../../src/modules/gateway/model";
import type { GatewayAuthority, AdapterCall } from "../../../src/modules/gateway/ports";

/** Evaluation sets are synthetic, so admission is unconditional. */
const syntheticOnly: GatewayAuthority = {
  admit: async () => ({ admitted: true }),
  stillCurrent: async () => true,
};

export const isLive = () => process.argv.includes("--live");

/**
 * Live mode sends only the synthetic set through the configured policy and requires explicit
 * confirmation; offline mode routes the purpose to a deterministic baseline adapter.
 */
export function evaluationGateway(options: {
  purpose: GatewayPurpose;
  offline: (call: AdapterCall) => { text: string };
  maxOutputTokens: number;
}) {
  if (isLive()) {
    if (process.env.ROLEFOUNDRY_AI_EVAL_CONFIRM !== "synthetic-only")
      throw new Error("Set ROLEFOUNDRY_AI_EVAL_CONFIRM=synthetic-only to send the synthetic set.");
    const policy = parseGatewayPolicy(process.env.ROLEFOUNDRY_AI_POLICY);
    if (!policy.routes[options.purpose])
      throw new Error(`ROLEFOUNDRY_AI_POLICY has no ${options.purpose} route.`);
    return new AIGateway({
      policy,
      adapters: adaptersFromEnvironment(process.env),
      templates: gatewayTemplates,
      authority: syntheticOnly,
    });
  }
  const route = {
    primary: { adapter: "offline", model: "baseline", recipients: ["offline"] },
    deadlineMs: 5000,
    primaryAttempts: 1,
    maxInputChars: 8000,
    maxOutputTokens: options.maxOutputTokens,
    concurrency: 1,
  };
  return new AIGateway({
    policy: parseGatewayPolicy(JSON.stringify({ routes: { [options.purpose]: route } })),
    adapters: [new FakeAdapter("offline", options.offline)],
    templates: gatewayTemplates,
    authority: syntheticOnly,
  });
}

/** Cancels the run on Ctrl-C / SIGTERM. */
export function interruptSignal() {
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
  return controller.signal;
}
