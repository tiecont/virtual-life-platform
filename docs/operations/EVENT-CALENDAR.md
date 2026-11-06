# Operator event calendar — N07-03 slice

The Event calendar tab prepares and reviews silent events for an exact existing organizer account. It exposes only operator-managed drafts and their published event phase/revision. Existing private player events, attendee lists, account profiles and contacts are outside this projection. Durable runtime restrictions and their desired/applied audit UI are documented in RUNTIME-CONTROLS.md; complete task acceptance is recorded separately.

Save a draft with the organizer UUID, event title, world/policy version, capacity, visibility, optional virtual-table resource and UTC schedule instants. The IANA zone controls calendar display. A draft does not allocate gameplay state. Review the saved draft before publishing. Publishing checks the current registered/active organizer and persisted organizer grant, safety, world availability, capability, policy version, capacity, resource conflicts, schedule ordering and original opening deadline. It cannot enable a world or override immutable Git entitlement. Real organizer provisioning remains an independent trusted operation.

Cancellation requires both current draft and published-event revisions. A player's ordinary event edit can make the console snapshot stale; refresh before retrying. Cancellation calls the event owner's shared transaction helper, closes existing reservation/invitation/Stage/Audience state and creates durable cancellation notices. It remains available with a closed world and grants no renewed admission or consent. Lost acknowledgement retries return the original command receipt and reconcile canonical cancellation hints without repeating effects.

All writes use fresh operator MFA, exact Origin, CSRF, UUID request key, expected revision and fixed reason. Retries with unchanged input retain the command key; changed input conflicts. Effects, metadata and redacted immutable audit commit together. Audit failure or expired authorization rolls back the operation. The Events tab offers recent before/after revision audit; title and organizer identifiers are HMAC references in audit rather than raw private fields.

Endpoints are `GET /v1/operator/event-calendar?from=<UTC>&until=<UTC>[&offset=<0..50000>]`, `GET /v1/operator/event-audit?draftId=<UUID>` and `POST /v1/operator/event-command`. The BFF allowlists the same strict contracts and operator cookie. Calendar queries cover at most 31 days and return at most 50 entries, with explicit truncation. The UI navigates pages of 50 ordered by scheduled start and draft ID. Offset is optional (default0), bounded to50000, and accepts canonical nonnegative decimal strings only. Response remains exactly drafts/truncated for existing clients. Concurrent inserts or schedule edits can move entries between pages; refresh before choosing a current revision. This is not a snapshot cursor. Changing the date resets the page and selection; saving a new draft reloads the first page. Audit returns at most 20 receipts. Durable budgets permit at most 30 new operator event writes/hour and 12 publications/hour, plus HTTP request limits. Existing player scheduling quotas remain unchanged.

| Data | Retention / handling |
|---|---|
| Unpublished draft configuration | 30 days from its latest save |
| Published draft configuration | Scheduled end plus 90 days |
| Operator-cancelled configuration | 90 days from cancellation |
| Owner privacy | Operative drafts included in owner export and cascade on account erasure |
| Redacted operator event audit | Immutable retained receipts, with no raw organizer/title/profile/participant data |

Cleanup removes at most 100 expired configurations per existing event maintenance pass; access filters deadlines even during cleanup outages. Existing published event history follows its existing lifecycle and 90-day terminal cleanup. No cleanup SLO or off-host archive is inferred.

Rollback by disabling the private event-control ingress or using a separately qualified 43-aware image. Calendar migration0042 and runtime migration0043 preserve all earlier SQL; old strict41/42 images are not qualified rollbacks on schema43. Do not delete audit or down-migrate production data. Actual commands, failures, hashes and local limitations are recorded in `docs/architecture/N07-03-CALENDAR.json`; no public/store release or real operator/organizer is provisioned by this slice.
