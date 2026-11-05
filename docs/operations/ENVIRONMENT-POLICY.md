# Environment release and runtime policy

The [current entitlement](../../config/release-policy.json) and [runtime defaults](../../config/runtime-world-policy.json) install/enable no real world, keep maintenance on and contain no real approval/operator reference. The original [v1 safety policy](../../config/safety-policy.json), release decision and trains remain historical offline fixtures with strict original assertions. [ADR0104](../adr/0104-versioned-environment-entitlement-and-safety-policy.md) records the new lifecycle and trust boundary.

Run `pnpm release-policy:check` for actual versioned release/runtime/safety validation. It builds current packages and checks the configured files; it does not deploy, create an operator or attest human approvals. Optional `--release`, `--runtime`, `--safety` and `--environment` arguments select explicit inputs. Root `pnpm check` includes the canonical policy gate.

The new runtime profile requires all three explicit settings:

```text
RELEASE_ENVIRONMENT=production
RELEASE_POLICY_FILE=/reviewed/config/release-policy.json
RUNTIME_WORLD_POLICY_FILE=/runtime/world-policy.json
SAFETY_POLICY_FILE=/reviewed/config/safety-policy-v2.json
```

These are installation instructions, not a performed deployment. Staging uses `RELEASE_ENVIRONMENT=staging` with `NODE_ENV=production`; development/test match their runtime mode. Mixing legacy local/fixture flags is rejected. `SAFETY_EVIDENCE_KEY` remains a separately provisioned secret; never commit it or reuse a session key. Missing key/reviews/version/hash, unsupported/unknown world or injected fixture adapter fails closed.

The [v2 safety example](../../config/safety-policy-v2.example.json) is unapproved and unassigned. A real policy must retain all confidentiality, independent review and retention bounds, declare its actual reviewed single-operator reference and appeal contact, and match the entitlement's canonical SHA-256. The [test fixture](../../tests/fixtures/release-policy-production.json) contains synthetic references only and is not an installation policy or owner approval.

Release entitlements change through process rollout; the process never rereads them to grant more scope. SIGHUP reloads only runtime policy. Runtime revisions increase; same-version different content, older revisions and release/environment mismatch disable installed worlds. Identical replay can recover the same last accepted policy after an invalid read. Successful policy publication follows all selected bootstraps. Direct registry activation, cached projections and prepared admission cannot bypass the current policy. Current runtime storage is a file adapter; authenticated versioned DB writes/audit are not implemented until N07/N09.

Closing admission/worlds does not disable reporting receipts or independent safety enforcement. Bounded quick interactions may be withdrawn without closing the world and are checked again at final publication. Free text, live media and real dating remain closed in this model; Lounge has no active entitlement. Existing legacy local fixtures are still explicitly isolated from production.

Policy validity is separate from current deployment/operational readiness. One declared operator reference does not prove a provisioned principal or MFA. Actual owner review, rights, staff coverage, privacy/retention, backup/monitoring and exact image/schema/client compatibility remain release gates. Test outcomes and limits belong in the [current evidence ledger](../plans/platform-vnext/state/evidence-index.json).
