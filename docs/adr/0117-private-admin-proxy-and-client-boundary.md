# ADR0117 — Keep the operator browser behind a bounded server proxy

Date:2026-11-06. Status: implemented for local qualification; private deployment remains N07-05.

Add a separate Next16.4.4 application, using the installed React/toolchain and existing UI CSS. Preserve player routes and API authentication. The operator browser calls named same-origin handlers; the server forwards only the operator cookie, exact Origin and required CSRF to the fixed private API. It never forwards arbitrary paths, queries, client authorization or proxy headers. API authority stays in N07-01.

Keep the read-only telemetry credential server-side and separate from interactive auth. Allow only a current summary query, with bounded payloads/timeouts, shared in-flight fetch, five-second cooldown and a short cache. Authenticate before reading and again after the asynchronous observation before publishing it. A revoked session cannot receive cached or delayed data. Missing/stale observations remain distinct from true zero; no health/capacity or historical-rate inference follows.

Use nonce-based dynamic rendering and no-store responses. Production scripts use a fresh nonce without unsafe-inline/eval; development alone permits framework debugging evaluation. Follow the [Next CSP guidance](https://nextjs.org/docs/app/guides/content-security-policy) without upgrading the pinned framework. First-party client import checks and actual production marker/bundle inspection complement backend authorization; neither is a security sandbox or deployment certification.

Add an admin browser group to the existing required matrix while preserving every previous spec and workflow permission. Local desktop/360px Chromium, synthetic state fixtures, real API TCP/DB cases and a production frontend smoke have separate scope. No real operator, public route, private ingress/TLS or admin image is provisioned here. N03-05 owns the image/release target; N07-05 owns actual access-boundary deployment.
