# ADR0083 — Park board reuses authorized city activity

Status: Accepted;M24-03 locally VERIFIED from b79b3de. See `../agent/evidence/m24-board-checks.json`.

The Park notice board currently links to the city overview. Embed an accessible activity list using the existing WorldCatalog contract and WorldActivity component. Park owns the presentation and no event, room, organizer or reservation records. EventService.catalog already filters listed schedules through current world/session access and block policy; private, ended, cancelled and restricted Dating schedules must not become public board entries.

Only other available, listed, session-admissible worlds with the events capability appear. Load one expanded world's current room/schedule observation on demand. Reuse the existing three-row display limit, IANA time labels, 30-second freshness limit, unknown/partial outage states and explicit travelHref confirmation. Counts describe room places including reconnect holds; they are not online identities or promised capacity. Reading a board must allocate no room, RSVP or invitation.

The current identity keys the panel lifetime. Abort superseded reads and clear the list before refreshing or on offline/background transitions; a late response after logout cannot restore old destinations. Refresh remains explicit. Approval and capacity are checked again during travel.

Verify with the actual local Library adapter and disposable PostgreSQL rendering fixtures: one eligible listed schedule plus private, ended and restricted sentinels. Fixtures do not grant organizer/provider/operator authority. The browser Park profile explicitly installs and enables Library only in its disposable test runtime. Existing real rollout flags and public/operator gates remain closed. No new API, database table or migration is needed.

Actual verification passes14Park browser cases(7perdevice),7existing discovery/catalog integration cases,5relevant unit cases,types/lint/CI policy/all builds. Initial run stopped at an invalid ENDED fixture before any board assertion;corrected timestamps satisfy the existing SQL constraints without runtime/schema changes. 472frozen source/config paths stayed unchanged;201API/shared-package source paths match b79b3de. The earlier full19governance/266unit/512integration baseline remains separate. Four board screenshots inspected. M24-04..05 and public approval remain open.
