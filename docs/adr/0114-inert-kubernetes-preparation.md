# ADR0114 — Separate Kubernetes preparation from deployment qualification

Date:2026-11-06. Status: accepted for locally verified N04-01 preparation; deployment/release gates remain separate.

Keep the existing API/web images, one PostgreSQL journal and one room owner. Add JSON resource files accepted by Kustomize, with staging/production namespace overlays. Restrict this initial transform surface to known local files and namespace transformation. Validate actual rendered objects and strict immutable Kubernetes schemas; do not infer success from source files or a checklist. Use pinned kubectl only as an offline YAML decoder with an empty configuration in the default validation path, avoiding a new parser dependency or incidental cluster access.

Keep preparation inert: reserved invalid image sentinels, private Services, closed ingress and no application-managed namespaces, SAs, policy ConfigMaps, Secrets, DB/PVC or RBAC. External policy references do not supply real approvals. A fabricated sha256 string would look promotable without artifact evidence, so preparation refuses arbitrary image substitutions. N04-02 must bind a tested release set; N04-03 must qualify full sync and private networking; N04-04 must observe an actual authorized staging target. Existing publisher/auto-promotion/release gates remain closed.

API stays one Recreate replica with existing signal-driven12s drain and20s Kubernetes grace. Do not add a worker or HPA as a manifest convenience. Web surge and a migration reserve count toward an application-only ceiling; no target/server/capacity claim follows. PostgreSQL, volumes, encryption/session/registry credentials and bootstrap SAs/configuration belong to a separate lifecycle, ready before future PreSync hooks. Application prune cannot own those prerequisites.

Retain exact proxy-peer trust and require observed controller/network/TLS/Origin/CSRF/internal-route evidence before opening ingress. Neither namespace labels nor a schema-valid NetworkPolicy prove enforcement. Explicit-context preflight reports only observations and never reads Secret values or grants deployment eligibility. A disposable loopback local API-server dry-run can establish schema/admission evidence without running application pods or qualifying registry credentials, public ingress or actual server data.

Rollback reverts this preparation's Git changes while retaining persistent infrastructure and evidence. No stack/ORM/app-protocol/production-data change or public/store release is authorized by a preparation pass.
