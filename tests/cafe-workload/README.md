# Cafe Renderer Workload

Run `pnpm test:cafe-workload` from the repository root. The driver builds its
own Vite bundle into a fresh private artifact directory, serves loopback HTTP
and closes its browser/server after measurement. It does not modify mobile
builds or create gameplay sessions.

`PROFILE-v1.json` locks the actual Deadline/Maid manifests, 20 modular
cat/dog/rabbit actors, four seated/ten walking/six idle, three quality tiers,
desktop/responsive viewports and 20 external-GC recreation samples before
measurement. Mobile High is a diagnostic. Existing workload/heap evaluators
and `budgets-v1.json` are reused without changing limits.

The output contains the source hashes, exact bundle, GPU/environment, every
sample and screenshot, sampled resource peaks and heap baseline/cycles.
Exit 1 means a functional failure or an exceeded required budget; read
`facts.json` to distinguish them. Frame failures do not skip heap collection.
Controlled cold/warm loading, real travel, native RSS and final-art acceptance
are outside this driver. Keep previous failure artifacts and profile versions.
