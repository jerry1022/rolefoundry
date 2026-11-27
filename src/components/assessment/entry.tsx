"use client";
import { AssessmentsScreen } from "../screens";
import { AssessmentScreen } from "./assessment-screen";
import {
  createAssessmentClient,
  createAssessmentAdminClient,
} from "@/modules/assessment/adapters/http-client";
import { createSkillClient } from "@/modules/skills/adapters/http-client";
import { createBrowserTransport } from "@/modules/platform/browser-http";
const client = createAssessmentClient(),
  adminClient = createAssessmentAdminClient(),
  skills = createSkillClient(),
  request = createBrowserTransport();
const isAdmin = async () => {
  try {
    return (await request("identity/session")).data.role === "admin";
  } catch {
    return false;
  }
};
export function AssessmentWorkspace() {
  return process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <AssessmentScreen client={client} adminClient={adminClient} skills={skills} isAdmin={isAdmin} />
  ) : (
    <AssessmentsScreen />
  );
}
