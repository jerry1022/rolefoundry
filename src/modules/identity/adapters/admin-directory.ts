import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IdentityError, databaseError } from "../core";
import { invitationPageSchema, quotaPageSchema, type IdentityAdminDirectoryStore } from "../admin";
const inviteCursor = z
  .object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() })
  .strict();
const policyCursor = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const encode = (value: unknown) =>
  value === null ? null : Buffer.from(JSON.stringify(value)).toString("base64url");
function decode<T>(schema: z.ZodType<T>, cursor?: string): T | null {
  if (cursor === undefined) return null;
  try {
    if (cursor.length > 512) throw Error();
    return schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new IdentityError("RF_INVALID_INPUT");
  }
}
export class SupabaseIdentityAdminDirectory implements IdentityAdminDirectoryStore {
  constructor(private readonly client: SupabaseClient) {}
  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.client
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(10000));
    if (error) throw databaseError(error);
    return data;
  }
  async invitations(raw?: string) {
    const cursor = decode(inviteCursor, raw);
    const result = await this.rpc("identity_admin_invitations", {
      p_before: cursor?.createdAt ?? null,
      p_id: cursor?.id ?? null,
    });
    return invitationPageSchema.parse({ data: result.data, nextCursor: encode(result.next) });
  }
  async quotaPolicies(raw?: string) {
    const cursor = decode(policyCursor, raw);
    const result = await this.rpc("identity_admin_quota_policies", { p_before: cursor });
    return quotaPageSchema.parse({ data: result.data, nextCursor: encode(result.next) });
  }
  async revokeInvitation(id: string) {
    await this.rpc("identity_revoke_invitation", { p_id: id });
  }
}
