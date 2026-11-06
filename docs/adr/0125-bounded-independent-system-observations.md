# ADR0125 — Independent bounded system observation sources

Status: accepted for local N07-04 implementation,2026-11-06.

Extend the private system dashboard with separate source results. A read-only database responding probe does not replace schema/owner readiness. Local pool counts are optional observations; minimal database ports without counters remain supported and return UNKNOWN. Hospitality owns pending completion/consumer-pair counts and oldest age, with no raw event/actor/consumer projection. Missing consumers, observed zero, source failure and worker liveness are different states.

A source coalesces one checkout/read, with1second checkout/read deadlines and READ ONLY/500ms statement/200ms lock limits. Keep the pending checkout latch until settlement; destroy late clients and failed leases. Close only that source's lease. HTTP export concurrency/rate limits, operator session reauthentication and gameplay/lifecycle behavior remain unchanged. The UI requests sources sequentially, preserving the existing single-export guard and independent freshness.

Expose API expected metadata schema1 and required migration count43 separately, plus a loaded release version when present. Do not invent artifact revision, worker liveness, deployed/cluster state, globally admitted count or capacity. Actual staging-source coverage remains an external N04-04 gate; local TLS/MFA and disposable PostgreSQL are explicitly local qualification. No migration, store/public deployment or room-owner expansion is introduced.
