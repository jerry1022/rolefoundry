"use client";
import { SkillsScreen } from "../screens";
import { ProfileScreen } from "./profile-screen";
import { createHttpProfileClient } from "@/modules/profile/adapters/http-client";
const client = createHttpProfileClient();
export function SkillsWorkspace() {
  return process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <ProfileScreen client={client} />
  ) : (
    <SkillsScreen />
  );
}
