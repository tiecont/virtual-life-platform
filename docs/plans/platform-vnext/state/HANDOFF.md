# vNext current handoff

Updated 2026-11-06T03:00:55.329987+00:00; N04-01 VERIFIED on `codex/vnext-n04-01-kubernetes-base`. Base `f97c1b475c2256afc78ce8bc39f9a52421d5a260`; this slice is committed after evidence finalization.

Implemented inert staging/production Kustomize preparation with one Recreate API, bounded probes/grace/resources, read-only unprivileged containers, private Services and closed/default-deny network policies. External namespaces/SA/policy/config/DB/PVC/Secrets remain outside application prune ownership. Actual pinned render/offline decode/strict schema checks pass18 resources and reject2 invalid schemas; local K3s API-server dry-runs pass18 resources, reject invalid type and create no app workloads. Explicit-context metadata preflight reports1ready linux/amd64 node and0ingress classes, with secret/registry/CNI/ingress qualifications still unverified. Both fixture attempts and cleanup are retained; final containers/networks/image volumes/kubeconfigs absent. Fresh67 governance and320 unit cases pass, plus final infra/lint/CI/toolchain/architecture/preservation gates. Application/dependency/SQL/old infra/tests and original151-task evidence remain unchanged. No deployable release, Argo sync, actual staging or public/store readiness claimed.

[Actual checks](../audit/N04-01-CHECKS.json) / [evidence index](evidence-index.json). Counts: `{"VERIFIED": 27, "TODO": 42}`.

## Remaining gates

Hosted baseline Quality42037215254 failed Deadline cadence (133.3ms vs <100ms); cause remains unresolved. Repository enforcement unavailable; publishing/automatic promotion remain disabled. Raw logs are private local artifacts until owner cleanup, not off-host archives. Original151 Mxx tasks/evidence and public/restricted gates persist. Release NOT_REQUESTED; N13/N14 inactive; mobile distribution contexts false. No unattended work continues after shutdown.

## Next exact action

Reserve N04-02 on a clean branch. Read current release manifest/publisher proof and constrained Kustomize graph. Implement source/digest-bound staging/production promotion with narrow reviewed file changes and default-disabled GitHub App/bot workflow; preserve required CI/no-loop behavior and identical tested release sets. Exercise local bot-event/proof/corruption fixtures and actual available registry evidence without inventing a hosted bot run, registry credentials or tested application digest. Keep publishing/auto-merge/production auto-promotion off until their real gates are met; retain owner-promotion fallback and all external N04-03/N04-04 deployment prerequisites.
