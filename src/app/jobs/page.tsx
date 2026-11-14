import { connection } from "next/server";
import { JobsWorkspace } from "@/components/jobs/entry";
import { publicCatalogContext } from "@/modules/jobs/server";
import { ApplicationError } from "@/modules/platform/errors";
export const metadata = { title: "Discover roles" };
export default async function JobsPage() {
  if (process.env.NEXT_PUBLIC_CATALOG_ENABLED === "true") {
    await connection();
    try {
      return <JobsWorkspace initialPage={await publicCatalogContext().list({})} />;
    } catch (error) {
      return (
        <JobsWorkspace
          initialError={
            error instanceof ApplicationError
              ? error.message
              : "The public catalog is temporarily unavailable."
          }
        />
      );
    }
  }
  return <JobsWorkspace />;
}
