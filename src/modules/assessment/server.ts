import "server-only";
import { identityContext } from "../identity/server";
import { AssessmentService, AssessmentAdministrationService } from "./service";
import {
  SupabaseAssessmentRepository,
  SupabaseAssessmentAdministrationRepository,
} from "./adapters/supabase";
import { SupabaseTaskRepository } from "../tasks/adapters/supabase";
export async function assessmentContext() {
  const identity = await identityContext();
  return {
    actor: await identity.service.currentActor(),
    config: identity.config,
    service: new AssessmentService(
      new SupabaseAssessmentRepository(identity.client),
      identity.service,
    ),
    admin: new AssessmentAdministrationService(
      new SupabaseAssessmentAdministrationRepository(identity.client),
      identity.service,
    ),
    tasks: new SupabaseTaskRepository(identity.client),
  };
}
