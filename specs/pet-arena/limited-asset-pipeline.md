# Limited Pet authoring bindings

The six Limited S characters belong to VL-149. VL-160 owns the separate
Standard S roster. The Icarus vertical slice must pass before replicating the
other five Limited characters. Source implementation does not authorize media
publication, public registration, purchases or a production import.

## Offline validation

After `pnpm build:packages`, run:

```sh
node --import tsx scripts/pet-asset-check.mjs --limited-v31
node --import tsx scripts/pet-asset-check.mjs --limited-v31 path/to/bindings.json --require-complete
```

The first command reports missing bindings for the six canonical Limited Pets.
It is a preflight, not acceptance of a model. The second refuses missing
bindings for the selected character(s), so an Icarus-only overlay is permitted.
The existing no-argument v2 check retains its original semantics.

Authoring manifests use `LimitedPetVisualDraftSchema`, schema version 2 and
ruleset `pet-arena-v3.1-limited`. Use `createMissingLimitedPetVisualDraft` from
`scripts/pet-limited-asset-check.mjs` to construct the initial overlay. Keep the
frozen v3.1 catalog and its MISSING asset manifest unchanged. The overlay pins
the exact-byte SHA-256 of `catalog_manifest.json`; the canonical Python checker
validates all its content hashes and upstream identities first.

Every binding records an ID, kind, portable workspace-relative path and actual
SHA-256, plus hashed editable source and importer configuration. Source origin,
author, provenance reference and pending rights status are mandatory. Each Pet
also records a design revision and hashed reference artwork. The model binding
requires a `.blend` source and `.glb` or `.fbx` export. Full and reduced-motion
MP4s have distinct bindings. Paths outside the workspace, nonregular files,
files over 64 MiB and changed bytes fail validation.

The 16 canonical Limited actions are retained, including distinct normal and
rage clips. The kit's five authoring sequences (idle, intro, normal, rage,
signature) are not replacements for these gameplay bindings: intro supplies
summon; signature supplies windup/cast/cut-in/impact segments. Author the
remaining reactions, locomotion, companion and terminal actions explicitly.
Signature opcodes must match both the catalog and Limited animation profile;
animation remains independent of the server outcome.

## Acceptance boundary

`BOUND_DRAFT` proves complete typed references and matching file bytes only.
It cannot prove that a file is a valid model, a video is rendered, clips deform
correctly or rights are cleared. Output always retains `modelInspection`,
`unityImport` and `renderedPreview` as `NOT_TESTED`, rights as `PENDING`,
`runtimeEnabled: false` and `productionReady: false`.

Icarus still requires actual Blender 4.5 LTS modeling, UVs and texture baking,
26,000-29,500 LOD0 triangles, 74 bones, at most three materials, meter scale and
Y-up export; licensed Unity 6000.3.14f1 / URP 17.3.0 import, shader/VFX and
Timeline/Cinemachine rendering; clip, motion and performance inspection.
Reference concepts or synthetic test fixtures satisfy none of those checks.
