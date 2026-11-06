# Reviewed digest promotion

N04-02 implements a default-disabled proposal path. [Local evidence](../architecture/N04-02-DIGEST-PROMOTION.json) does not establish a real bot PR, hosted CI, published application digest or deployment. The task remains BLOCKED_EXTERNAL until those hosted prerequisites are observed.

`pnpm release:promote preview ENV RELEASE_ID CANDIDATE OUTPUT` creates `proposal.json` and an applicable `proposal.diff` in a new ignored directory below `artifacts/`. It never changes overlays/releases or calls GitHub write endpoints. Preview checks local integrity and reports unverified remote evidence. `verify` additionally requires a clean checkout, an ancestor source commit, real registry descriptors/provenance and exact hosted Quality proof through the existing N03 verifier.

A legacy schema1 candidate contains exactly seven immutable JSON files: release manifest, Quality proof, image-check proof, two SBOMs and two provenance documents. Schema2 requires nine files by adding the admin SBOM/provenance and matching per-artifact source SHA; missing/extra metadata is rejected. The two-image overlay binds the entire manifest hash but does not create admin deployment resources. Proposals change only that release directory and the selected overlay's release binding and Kustomization. Existing release files cannot be rewritten. Production proposals reuse the complete current staging descriptor and identical API/web digests without rebuilding. Later staging advancement does not invalidate an older bound production release.

The Kubernetes reader checks all local payloads before allowing exactly two digest transforms. Its `LOCAL_INTEGRITY_ONLY` result is neither remote authentication nor deployment eligibility. Review must use remote verification; hand-written JSON cannot authenticate artifacts. Root overlays retain invalid image sentinels; no root release directory was created here.

## Workflow boundary

The manual workflow accepts this repository's main branch only. Both committed `manualWorkflowEnabled` and repository variable `VLP_PROMOTION_ENABLED` must be true. Automatic promotion, auto-merge and production auto-promotion stay false. Publishing remains independently disabled; its completion cannot automatically update desired state.

Read-only job credentials authorize an exact trusted successful publisher run, download its one source/attempt-bound artifact and verify the proposal. Only then does the pinned official App action mint a token restricted to this repository with contents-write and pull-requests-write permissions; normal post-step token revocation is retained. The writer rechecks remote proof, proposal bytes, source, current main and installation scope. It creates a Git tree, commit, create-only branch and draft PR. It supports no force update, merge or cluster operation. Read and write credentials stay separate; provider errors do not print credential values.

Retries reuse only an exactly matching branch tree/base/message and draft PR; conflicts or advanced main fail closed. Main can advance after its observation: draft status, required CI and owner review remain necessary. The bot explicitly returns hosted checks `NOT_OBSERVED`.

Existing Quality and publisher workflow bytes are unchanged. Local promotion-only PR/push fixtures retain required Quality jobs while skipping image rebuilding. App events are intended to trigger CI under GitHub's [event-trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow); actual delivery and check outcomes require the hosted pilot. Main was observed unprotected with enforcement APIs unavailable; owner review is a fallback, not technical branch protection.

## External completion and recovery

Read-only metadata found no `VLP_PROMOTION_APP_PRIVATE_KEY` secret name; promotion variables were unavailable. The repository owner must arrange a repository-scoped App installation, `VLP_PROMOTION_APP_ID` variable and private-key secret through service settings. Never place keys in chat, Git or evidence. A genuine published candidate, reviewed workflow on main and explicit activation are also needed. Capture actual App actor, PR/head, Quality run/attempt and required outcomes in a private pilot; disable activation on unexpected scope or events. No public/production deployment follows.

Production review additionally needs actual staging qualification, compatible schema rollback, target prerequisites and release/operator/safety approvals. Revert desired state to the previous compatible release set; retain immutable bundles, persistent infrastructure and evidence. N04-03 waits for N04-02 VERIFIED. Independent N07-01 can proceed while external inputs are unavailable.
