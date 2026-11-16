"use client";
import { LearningScreen } from "../screens";
import { LearningWorkspaceScreen } from "./learning-screen";
import {
  createCourseClient,
  createLearningClient,
  createLearningAdminClient,
} from "@/modules/learning/adapters/http-client";
import { createCatalogClient } from "@/modules/jobs/adapters/http-client";
import { createHttpProfileClient } from "@/modules/profile/adapters/http-client";
import { createSkillClient } from "@/modules/skills/adapters/http-client";
import { createBrowserTransport } from "@/modules/platform/browser-http";
const courses = createCourseClient(),
  client = createLearningClient(),
  adminClient = createLearningAdminClient(),
  catalog = createCatalogClient(),
  profile = createHttpProfileClient(),
  skills = createSkillClient(),
  request = createBrowserTransport();
const isAdmin = async () => {
  try {
    return (await request("identity/session")).data.role === "admin";
  } catch {
    return false;
  }
};
export function LearningWorkspace() {
  return process.env.NEXT_PUBLIC_CATALOG_ENABLED === "true" ? (
    <LearningWorkspaceScreen
      courses={courses}
      client={client}
      adminClient={adminClient}
      catalog={catalog}
      profile={profile}
      skills={skills}
      isAdmin={isAdmin}
      privateEnabled={process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true"}
    />
  ) : (
    <LearningScreen />
  );
}
