# Prelaunch double opt-in

Status: source implementation for `VL-164`; campaign acceptance, real mail
delivery, production routing and public registration remain OFF.

The registration API is part of `apps/platform-api` and uses the existing
PostgreSQL journal. Migration `0067_prelaunch_registration.sql` adds only
prelaunch campaigns, encrypted registrations, challenges, consent events,
idempotency receipts, rate limits, suppressions, a mail outbox and sanitized
audit. It creates no identity account, session, beta entitlement, purchase,
waitlist or game content.

## Activation boundary

`PRELAUNCH_REGISTRATION_ENABLED=1` requires a distinct 32-byte
`PRELAUNCH_EMAIL_KEY`. The current implementation rejects activation in
production until a reviewed campaign, sender/domain, privacy/retention, mail
provider and release qualification exist. `UnavailableMailSink` is the default;
tests inject a bounded sink only in-process.

## Data and capacity

- Only a successful email confirmation increments `campaign.admissions`.
- A campaign capacity cannot exceed 5,000 and can never decrease its admissions.
- Pending requests reserve no slot and do not create a waitlist.
- Withdrawal never decrements admissions and the unique campaign/email binding is
  retained, so the same address cannot reacquire the consumed slot.
- Raw email addresses are not stored. A keyed lookup hash enforces uniqueness and
  AES-256-GCM ciphertext with a key ID permits the outbox to send mail.
- Confirmation tokens expire after 30 minutes, are stored only as keyed hashes,
  and are single-use. The confirmation page must accept a code in a POST body or
  equivalent non-URL channel.
- Email confirmation and marketing consent are separate records. No marketing
  mail is sent by this slice.

## API

The public routes are registered only when the environment gate is enabled:

```text
GET  /v1/prelaunch/campaigns/:campaignId
POST /v1/prelaunch/requests
POST /v1/prelaunch/resend
POST /v1/prelaunch/confirm
GET  /v1/prelaunch/registration
POST /v1/prelaunch/withdraw
```

Registration and resend always return the same bounded accepted response, which
prevents the response from disclosing whether an address is known, suppressed or
already confirmed. Management and confirmation tokens travel in request bodies or
the `Authorization: Bearer` header, never in query strings. Responses, audit and
operator aggregates contain no email, token or registration payload.

Authenticated operators with fresh MFA may read aggregate campaign counts and
mail-outbox health at `GET /v1/operator/prelaunch-summary`. Lifetime admissions
include confirmed registrations that later withdrew or were suppressed.
The Admin page displays lifetime and current confirmed counts separately.
Its browser response includes campaign state and counts.

## Mail outbox

Mail delivery rows contain references only. A claiming worker locks a bounded
batch, sends outside the claim transaction, and records success or bounded
backoff. Suppression marks the outbox and registration suppressed. A crash after
claim is recycled after its lease; mail sinks must use the stable outbox UUID as
their idempotency key.
