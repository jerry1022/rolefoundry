import { linkPolicySchema, linkResultSchema, linkTargetSchema } from "./model";
import type { CourseLinkProbe, CourseLinkStore } from "./ports";
/** One sequential, lease-fenced probe per tick. The store owns shared cadence/authority. */
export class CourseLinkChecker {
  private running = false;
  private cursor = 0;
  constructor(
    private readonly store: CourseLinkStore,
    private readonly probe: CourseLinkProbe,
    private readonly policies: unknown,
  ) {}
  async tick(signal: AbortSignal) {
    if (this.running || signal.aborted) return 0;
    this.running = true;
    try {
      const policies = linkPolicySchema.array().max(20).parse(this.policies);
      for (let offset = 0; offset < policies.length; offset++) {
        const index = (this.cursor + offset) % policies.length,
          policy = policies[index];
        signal.throwIfAborted();
        // One failing source must not stop the others in this tick.
        let claimed;
        try {
          claimed = await this.store.claim(policy, signal);
        } catch (error) {
          if (signal.aborted) throw error;
          continue;
        }
        if (!claimed) continue;
        this.cursor = (index + 1) % policies.length;
        const target = linkTargetSchema.parse(claimed);
        // Even a replacement store cannot widen the deployment-owned recipient set.
        if (!target.allowedHosts.every((host) => policy.allowedHosts.includes(host)))
          throw Error("Course link policy mismatch");
        const result = linkResultSchema.parse(await this.probe.check(target, signal));
        signal.throwIfAborted();
        return (await this.store.complete(target, result, signal)) ? 1 : 0;
      }
      return 0;
    } finally {
      this.running = false;
    }
  }
}
