"use client";
import { MatchingScreen } from "./matching-screen";
import { DemoMatching } from "./demo";
import { createMatchingClient } from "@/modules/matching/adapters/http-client";
import { createCatalogClient } from "@/modules/jobs/adapters/http-client";
import { createHttpProfileClient } from "@/modules/profile/adapters/http-client";
import { createSkillClient } from "@/modules/skills/adapters/http-client";
const client = createMatchingClient(),
  catalog = createCatalogClient(),
  profile = createHttpProfileClient(),
  skills = createSkillClient();
export function MatchingWorkspace() {
  return process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <MatchingScreen client={client} catalog={catalog} profile={profile} skills={skills} />
  ) : (
    <DemoMatching />
  );
}
