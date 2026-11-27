# 09 — Application tracking

## Responsibility

Keep the user's next action visible without pretending that the platform submitted an application. Job discovery, preparation and external submission are distinct events.

## Current scaffold

The public demo retains its local manual board. Configured identity deployments implement private cycles, historical job snapshots, fixed owner resume references, revision-checked stages/notes, immutable event history, UTC follow-ups and deletion. See [setup, exact API and verification](../APPLICATIONS_SETUP.md). All status changes are manual; no messages or applications are sent.

## Target records and interface

`applications` stores owner, canonical job ID, title/company/source snapshot, selected resume version and current state. The implementation keeps the job snapshot after catalog deletion and unlinks a deleted resume source without retaining its statements. `application_events` records prior/new state, actor, timestamp and optional user-provided confirmation reference. `follow_up_tasks` stores a due date and next step. `track(actor, jobId)` creates or returns a tracker item; `move(actor, applicationId, stage)` adds an event.

## State behavior

The initial board retains the five simple stages. Production may add substatuses such as awaiting confirmation, test and withdrawn without redefining historical events. A click on an external link does not change Saved to Applied. A user can manually report an application; identify it as user-reported unless confirmed by an authorized integration. No response is not rejection.

Use owner/job identity to prevent accidental duplicate active records; allow an explicit new application cycle when the same job is reopened. Preserve snapshots after source expiry. A missing or deleted catalog record must not make the user's historical note inaccessible.

## Flow and edge cases

Track a role → select a resume version → visit the original source → record actual submission → set a follow-up → record interview/outcome. Concurrent status edits use a version check rather than silently overwriting. Store timestamps in UTC and render in the user's locale. Deletion is owner-authorized and removes associated follow-ups.

## Acceptance tests

Test idempotent additions, stage transitions, notes across reload, source closure, duplicate cycles, unauthorized access and optimistic conflicts. Verify explicitly that bookmarking, exporting a resume and opening an external page cannot mark an application successful.
