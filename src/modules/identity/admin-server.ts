import "server-only";
import { identityContext } from "./server";
import { IdentityAdminDirectoryService } from "./admin-service";
import { SupabaseIdentityAdminDirectory } from "./adapters/admin-directory";
export async function identityAdminDirectoryContext() {
  const ctx = await identityContext();
  return {
    actor: await ctx.service.currentActor(),
    config: ctx.config,
    directory: new IdentityAdminDirectoryService(
      new SupabaseIdentityAdminDirectory(ctx.client),
      ctx.service,
    ),
  };
}
