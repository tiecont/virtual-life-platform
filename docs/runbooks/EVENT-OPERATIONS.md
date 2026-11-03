# Local event governance operations

Supported scope: silent events only, all real flags OFF. No actual staff is provisioned by migrations or HTTP. Owner approval and release review precede real registered organizer/performer/safety grants. Disposable synthetic test grants are not staffing evidence.

1. Read the authenticated event and own controls. Organizer grant is current/world-scoped; performer grant binds the event; safety cancellation uses separate M08 grants. Avatar/nickname/RSVP/request role fields convey no authority.
2. An organizer may adjust only an unoccupied SCHEDULED event using expectedVersion and a fresh request key. Explicit UTC/IANA timing and resource overlap are checked again. Once participants join, cancel and create a new schedule; do not silently move their consent or calendar files.
3. POST events/:id/cancel uses schemaVersion,expectedVersion,original UUID Idempotency-Key, signed session/Origin/CSRF. It works during disable/incident closure without reopening the world. Original organizer or scoped moderator may cancel; performer cannot.
4. After response loss retain the same key/body. A changed participant snapshot requires retry with the same request. Refresh on version conflict; a new key belongs to a newly chosen action. A timeout or failed response is not proof of cancellation.
5. Confirm canonical CANCELLED and version. Event state, booking/waitlist release, private notices and receipt commit together. Do not manually patch child rows or send notices outside this transaction. At/after endsAt the truthful result may be ENDED.
6. Participants read their own GET events/notices. Inbox/export are bounded100 with truncation and retention cascades. Durable notice does not prove reading/push/email; downloaded calendars are not externally recalled.
7. Readiness is voluntary metadata in OPEN/LIVE. Existing own readiness may be withdrawn after role/world closure; it opens no stage/media. Interactive audience is rejected. M19 must implement independent moderator approval, on-duty coverage and stage authorization before that gate changes.

On DB outage preserve original retry keys and avoid declaring failure successful. During safety closure cancel activities through guarded routes; reopening follows the separate incident recovery runbook. Rollback disables policies/routes while preserving retained tables/exports. Never run city migrations on legacy DBs or delete retained participation to clear an error.
