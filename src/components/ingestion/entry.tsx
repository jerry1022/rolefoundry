"use client";
import { AdminScreen } from "../screens";
import { createBrowserTransport } from "@/modules/platform/browser-http";
import { createImportAdminClient } from "@/modules/ingestion/adapters/http-client";
import { ImportAdministration } from "./administration";
const client = createImportAdminClient(),
  request = createBrowserTransport();
async function isAdmin() {
  try {
    return (await request("identity/session")).data.role === "admin";
  } catch {
    return false;
  }
}
export function AdminWorkspace() {
  return (
    <>
      <AdminScreen />
      {process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" && (
        <ImportAdministration client={client} isAdmin={isAdmin} />
      )}
    </>
  );
}
