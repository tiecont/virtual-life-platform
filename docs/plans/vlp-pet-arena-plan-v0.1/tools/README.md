# Pet Arena planning helpers

Run from any working directory:

```sh
node docs/plans/vlp-pet-arena-plan-v0.1/tools/validate-plan.mjs
node docs/plans/vlp-pet-arena-plan-v0.1/tools/next-task.mjs
node --test docs/plans/vlp-pet-arena-plan-v0.1/tools/plan.test.mjs
```

The validator checks all20 PA IDs, acyclic dependencies, upstream names,
evidence provenance, S1 independence from S2, both gates before S3 and the
unchanged imported proposal hashes. It also validates the existing vNext pack.
The scheduler returns WAITING while Arena is PLANNED, another lane owns source,
Lodge is active or a reviewed source-bound handoff is missing. It reads state;
it never activates a phase, mutates a task or runs implementation/deployment.

Tests exercise scheduling rejection paths. Passing these checks establishes
planning consistency, not combat determinism, game readiness or runtime safety.
The repository-native API/schema/engine/UI tests listed in each PA acceptance
remain future implementation work.
