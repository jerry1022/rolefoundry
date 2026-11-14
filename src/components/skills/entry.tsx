"use client";
import { createSkillClient, createSkillAdminClient } from "@/modules/skills/adapters/http-client";
import { createBrowserTransport } from "@/modules/platform/browser-http";
import { skillLabels } from "@/modules/skills/catalog";
import { DictionaryScreen } from "./dictionary-screen";
import { PageHeading } from "../ui/page-heading";
const client = createSkillClient(),
  adminClient = createSkillAdminClient(),
  request = createBrowserTransport();
const isAdmin = async () => {
  try {
    return (await request("identity/session")).data.role === "admin";
  } catch {
    return false;
  }
};
export function DictionaryWorkspace() {
  return process.env.NEXT_PUBLIC_CATALOG_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <DictionaryScreen client={client} adminClient={adminClient} isAdmin={isAdmin} />
  ) : (
    <>
      <PageHeading
        eyebrow="SHARED SKILL IDS"
        title="The shared language of skills."
        description="This static demo uses a small seed vocabulary. A configured server provides the reviewed bilingual dictionary, aliases and immutable versions."
      />
      <section className="panel">
        <h2>Demo skill vocabulary</h2>
        <div className="tags">
          {Object.entries(skillLabels).map(([id, label]) => (
            <span className="skill-tag" key={id}>
              {label} · {id}
            </span>
          ))}
        </div>
        <p className="muted">Live lookup and administration are unavailable in the static demo.</p>
      </section>
    </>
  );
}
