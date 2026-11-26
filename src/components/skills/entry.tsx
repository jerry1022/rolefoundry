"use client";
import { createSkillClient, createSkillAdminClient } from "@/modules/skills/adapters/http-client";
import { createBrowserTransport } from "@/modules/platform/browser-http";
import { skillLabels } from "@/modules/skills/catalog";
import { DictionaryScreen } from "./dictionary-screen";
import { PageHeading } from "../ui/page-heading";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  return process.env.NEXT_PUBLIC_CATALOG_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <DictionaryScreen client={client} adminClient={adminClient} isAdmin={isAdmin} />
  ) : (
    <>
      <PageHeading
        eyebrow={t("SHARED SKILL IDS")}
        title={t("The shared language of skills.")}
        description={t(
          "This static demo uses a small seed vocabulary. A configured server provides the reviewed bilingual dictionary, aliases and immutable versions.",
        )}
      />
      <section className="panel">
        <h2>{t("Demo skill vocabulary")}</h2>
        <ul className="vocab-grid">
          {Object.entries(skillLabels).map(([id, label]) => (
            <li key={id}>
              <span>{t(label)}</span>
              <code>{id}</code>
            </li>
          ))}
        </ul>
        <p className="muted vocab-note">
          {t("Live lookup and administration are unavailable in the static demo.")}
        </p>
      </section>
    </>
  );
}
