"use client";
import { AdminScreen } from "../screens";
import { PageHeading } from "../ui/page-heading";
import { createBrowserTransport } from "@/modules/platform/browser-http";
import { createImportAdminClient } from "@/modules/ingestion/adapters/http-client";
import { createFeedAdminClient } from "@/modules/ingestion/adapters/feed-client";
import { createOperationsClient } from "@/modules/operations/adapters/http-client";
import { ImportAdministration } from "../ingestion/administration";
import { OperationsAdministration } from "../operations/administration";
const client = createImportAdminClient(),
  feedClient = createFeedAdminClient(),
  operations = createOperationsClient(),
  request = createBrowserTransport();
async function isAdmin() {
  try {
    return (await request("identity/session")).data.role === "admin";
  } catch {
    return false;
  }
}
/** Deployment composition only; each screen consumes an independently replaceable client port. */
export function AdminWorkspace() {
  if (process.env.NEXT_PUBLIC_IDENTITY_ENABLED !== "true") return <AdminScreen />;
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRATION"
        title="Review sources and observe background work."
        description="Verified administrator sessions manage authorized imports and inspect operational metadata. Publication always follows the domain review workflow."
      />
      <OperationsAdministration client={operations} isAdmin={isAdmin} />
      <ImportAdministration client={client} feedClient={feedClient} isAdmin={isAdmin} />
    </>
  );
}
