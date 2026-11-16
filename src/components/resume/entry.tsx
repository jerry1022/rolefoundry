"use client";
import { ResumeScreen } from "../screens";
import { ResumeWorkspaceScreen } from "./workspace-screen";
import { createResumeClient } from "@/modules/resume/adapters/http-client";
import { createCatalogClient } from "@/modules/jobs/adapters/http-client";
import { createSkillClient } from "@/modules/skills/adapters/http-client";
const client = createResumeClient(),
  catalog = createCatalogClient(),
  skills = createSkillClient();
export function ResumeWorkspace() {
  return process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <ResumeWorkspaceScreen
      client={client}
      catalog={catalog}
      skills={skills}
      catalogEnabled={process.env.NEXT_PUBLIC_CATALOG_ENABLED === "true"}
    />
  ) : (
    <ResumeScreen />
  );
}
