"use client";
import { ApplicationsScreen } from "../demo/applications";
import { ApplicationTrackerScreen } from "./tracker-screen";
import { createApplicationClient } from "@/modules/applications/adapters/http-client";
import { createCatalogClient } from "@/modules/jobs/adapters/http-client";
const client = createApplicationClient(),
  catalog = createCatalogClient();
export function ApplicationsWorkspace() {
  return process.env.NEXT_PUBLIC_IDENTITY_ENABLED === "true" ? (
    <ApplicationTrackerScreen
      client={client}
      catalog={catalog}
      catalogEnabled={process.env.NEXT_PUBLIC_CATALOG_ENABLED === "true"}
    />
  ) : (
    <ApplicationsScreen />
  );
}
