"use client";
import { SkillsScreen } from "../screens";
import { ProfileScreen } from "./profile-screen";
import { createHttpProfileClient } from "@/modules/profile/adapters/http-client";
import { createSkillClient } from "@/modules/skills/adapters/http-client";
const dictionary = createSkillClient();
const client = createHttpProfileClient();
export function SkillsWorkspace() {
  return process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <ProfileScreen client={client} dictionary={dictionary} />
  ) : (
    <SkillsScreen />
  );
}
