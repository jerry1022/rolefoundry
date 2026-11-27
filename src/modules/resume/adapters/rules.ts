import { randomUUID } from "node:crypto";
import type { ResumeReviser } from "../ports";
import type { ResumeRevisionInput } from "../model";
import { proposeResumeOrder } from "../rules";
export class ConfirmedFactOrderReviser implements ResumeReviser {
  async propose(input: ResumeRevisionInput, signal: AbortSignal) {
    signal.throwIfAborted();
    return proposeResumeOrder(input, randomUUID);
  }
}
