import { z } from "zod";
import { featureSchema } from "./core";
const timestamp = z.iso.datetime({ offset: true });
export const invitationInputSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    expiresAt: timestamp,
  })
  .strict();
export const quotaInputSchema = z
  .object({
    feature: featureSchema,
    limit: z.number().int().min(0).max(10000),
    effectiveFrom: timestamp,
  })
  .strict();
export const refundInputSchema = z
  .object({ taskId: z.uuid(), reason: z.string().trim().min(1).max(1000) })
  .strict();
export const invitationReceiptSchema = z.object({ id: z.uuid(), expiresAt: timestamp });
export const invitationSummarySchema = invitationReceiptSchema.extend({
  createdAt: timestamp,
  status: z.enum(["available", "expired", "redeemed"]),
});
export const invitationPageSchema = z.object({
  data: z.array(invitationSummarySchema).max(20),
  nextCursor: z.string().nullable(),
});
export const quotaSummarySchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,18}$/),
  feature: featureSchema,
  limit: z.number().int().min(0).max(10000),
  effectiveFrom: timestamp,
  createdAt: timestamp,
});
export const quotaPageSchema = z.object({
  data: z.array(quotaSummarySchema).max(20),
  nextCursor: z.string().nullable(),
});
export type InvitationInput = z.infer<typeof invitationInputSchema>;
export type QuotaInput = z.infer<typeof quotaInputSchema>;
export type RefundInput = z.infer<typeof refundInputSchema>;
export type InvitationPage = z.infer<typeof invitationPageSchema>;
export type QuotaPage = z.infer<typeof quotaPageSchema>;
/** Administration uses verified HTTP/domain operations; it never edits raw identity tables. */
export interface IdentityAdminClient {
  invite(input: InvitationInput): Promise<z.infer<typeof invitationReceiptSchema>>;
  invitations(cursor?: string): Promise<InvitationPage>;
  revokeInvitation(id: string): Promise<void>;
  quotaPolicies(cursor?: string): Promise<QuotaPage>;
  scheduleQuota(input: QuotaInput): Promise<{ effectiveFrom: string }>;
  refund(input: RefundInput): Promise<void>;
}
export interface IdentityAdminDirectoryStore {
  invitations(cursor?: string): Promise<InvitationPage>;
  quotaPolicies(cursor?: string): Promise<QuotaPage>;
  revokeInvitation(id: string): Promise<void>;
}
