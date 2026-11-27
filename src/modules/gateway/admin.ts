import { z } from "zod";
import { featureSchema } from "../identity/core";
import { ApplicationError } from "../platform/errors";

/** Recipients are approved under identity consent purposes; one shared list. */
export const recipientPurposes = featureSchema.options;
const recipient = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);
const reason = z.string().trim().min(1).max(1000);

export const recipientChangeSchema = z
  .object({ purpose: z.enum(recipientPurposes), recipient, reason })
  .strict();
export type RecipientChange = z.infer<typeof recipientChangeSchema>;

export const recipientPageSchema = z
  .object({
    policies: z
      .array(z.object({ purpose: z.enum(recipientPurposes), version: z.string() }).strict())
      .max(8),
    approvals: z
      .array(
        z
          .object({
            purpose: z.enum(recipientPurposes),
            policyVersion: z.string(),
            recipient,
            reason: z.string(),
            approvedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export type RecipientPage = z.infer<typeof recipientPageSchema>;

export interface RecipientStore {
  list(): Promise<RecipientPage>;
  approve(change: RecipientChange): Promise<void>;
  revoke(change: RecipientChange): Promise<void>;
}

/** Validates administrator input; the database re-verifies the administrator and audits. */
export class RecipientAdminService {
  constructor(private readonly store: RecipientStore) {}
  list() {
    return this.store.list();
  }
  approve(input: unknown) {
    return this.store.approve(parse(input));
  }
  revoke(input: unknown) {
    return this.store.revoke(parse(input));
  }
}

function parse(input: unknown) {
  const parsed = recipientChangeSchema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError("RF_INVALID_INPUT", 400, "The recipient change is invalid.");
  return parsed.data;
}
