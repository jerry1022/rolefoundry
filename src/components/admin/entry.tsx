"use client";
import { DeletionAdministration } from "../account-deletion/administration";
import { createDeletionAdminClient } from "@/modules/account-deletion/adapters/http-client";
import { AdminScreen } from "../screens";
import { PageHeading } from "../ui/page-heading";
import Link from "next/link";
import { useMemo } from "react";
import { useAdminAccess } from "./access";
import { AdminSection } from "./section";
import { DictionaryScreen } from "../skills/dictionary-screen";
import { AssessmentBank } from "../assessment/bank-editor";
import { IdentityAdministration } from "../identity/administration";
import { createSkillClient, createSkillAdminClient } from "@/modules/skills/adapters/http-client";
import { createAssessmentAdminClient } from "@/modules/assessment/adapters/http-client";
import { createIdentityAdminClient } from "@/modules/identity/adapters/admin-client";
import { createImportAdminClient } from "@/modules/ingestion/adapters/http-client";
import { createFeedAdminClient } from "@/modules/ingestion/adapters/feed-client";
import { createTaskReplayClient } from "@/modules/operations/adapters/replay-client";
import { createOperationsClient } from "@/modules/operations/adapters/http-client";
import { ImportAdministration } from "../ingestion/administration";
import { OperationsAdministration } from "../operations/administration";
import { CourseLinkChecks } from "../learning/link-checks";
import { AiRecipientAdministration } from "./ai-recipients";
import { createRecipientClient } from "@/modules/gateway/adapters/http-client";
import { createCourseLinkClient } from "@/modules/course-links/adapters/http-client";
/** Deployment composition only; each screen consumes an independently replaceable client port. */
export function AdminWorkspace() {
  if (process.env.NEXT_PUBLIC_IDENTITY_ENABLED !== "true") return <AdminScreen />;
  return <PrivateAdminWorkspace />;
}
function PrivateAdminWorkspace() {
  const { access, verify: isAdmin, fetcher } = useAdminAccess();
  const {
    client,
    feedClient,
    operations,
    replay,
    deletion,
    skills,
    skillAdmin,
    bank,
    identity,
    courseLinks,
    aiRecipients,
  } = useMemo(
    () => ({
      client: createImportAdminClient(fetcher),
      feedClient: createFeedAdminClient(fetcher),
      operations: createOperationsClient(fetcher),
      replay: createTaskReplayClient(fetcher),
      deletion: createDeletionAdminClient(fetcher),
      skills: createSkillClient(fetcher),
      skillAdmin: createSkillAdminClient(fetcher),
      bank: createAssessmentAdminClient(fetcher),
      identity: createIdentityAdminClient(fetcher),
      courseLinks: createCourseLinkClient(fetcher),
      aiRecipients: createRecipientClient(fetcher),
    }),
    [fetcher],
  );
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRATION"
        title="Review content and operate the workspace."
        description="Manage reviewed skills, assessment versions, invitations and allowances alongside authorized sources and task recovery."
      />
      {access === "checking" && <p role="status">Checking administrator access…</p>}
      {access === "denied" && (
        <p>
          Administration requires a current administrator session.{" "}
          <Link href="/account/">Open account and privacy</Link>
        </p>
      )}
      {access === "unavailable" && (
        <p role="alert">
          Administrator access could not be verified. Retry when the identity service is available.
        </p>
      )}
      {access !== "allowed" && access !== "checking" && (
        <button className="button secondary" onClick={() => void isAdmin()}>
          Check administrator access again
        </button>
      )}
      {access === "allowed" && (
        <>
          <AdminSection title="Skills and aliases">
            <DictionaryScreen client={skills} adminClient={skillAdmin} isAdmin={isAdmin} embedded />
          </AdminSection>
          <AdminSection title="Assessment questions and rubrics">
            <AssessmentBank client={bank} skills={skills} />
          </AdminSection>
          <AdminSection title="Invitations and allowances">
            <IdentityAdministration client={identity} />
          </AdminSection>
          <AdminSection title="AI recipients">
            <AiRecipientAdministration client={aiRecipients} />
          </AdminSection>
          <AdminSection title="Course link observations">
            <CourseLinkChecks client={courseLinks} />
          </AdminSection>
          <OperationsAdministration client={operations} replayClient={replay} isAdmin={isAdmin} />
          <DeletionAdministration client={deletion} isAdmin={isAdmin} />
          <ImportAdministration client={client} feedClient={feedClient} isAdmin={isAdmin} />
        </>
      )}
    </>
  );
}
