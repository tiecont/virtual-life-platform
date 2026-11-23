# Tool routing, ownership, reuse, constraints

## Baseline and character source-of-truth

- Repo source: `AGENTS.md`, `README.md`, `config/development-plan.json` and current `specs/pet-arena/` contracts.
- Icarus identity: `pet-v3-fire-icarus`; signature: `FIRE_ZONE`; approved appearance is the owner's selected design, not a procedural v2/white-gold study or generated V4/V5 proposal.
- Existing source: `assets/characters/icarus/`, `scripts/art/`, `apps/unity-client/Assets/VirtualLife/ArtStudies/Icarus/`, `specs/pet-arena/references/icarus/`. Keep original GUIDs and actual provenances. Experimental variants go under ignored `artifacts/`.
- Read `specs/pet-arena/meshy-character-pipeline.md` and current production-v3/v4 records for actual paid job history. Record spent credits; avoid duplicate expensive calls.

## Hard prohibitions

1. No Meshy/Tripo/Hunyuan-generated production anime head or fused whole-character head/torso. Experimental outputs are not approvals; use licensed editable anime base and inspect actual quad facial loops and eyelid/mouth animation. Check license of VRoid source, outfit and any converted plugin.
2. Do not fake hair/feather detail via shade-smooth alone; hand-author/restyle curves, planes, feather vanes and game-camera silhouettes. Preserve visible wing root and fold axis.
3. No procedural Blender mock stage or arbitrary orange curves posing as shipped ability VFX. Blender can **inspect** and render neutral rig motion; actual gameplay presentation lives in Unity.
4. No more than one worker modifies a given Blender source, rig hierarchy, Unity scene, `.meta` GUID, package manifest or backlog entry at a time. Use immutable handoff files with exact SHA256 for parallel work.
5. Never copy generic 28k–45k budget across all Pets. Icarus contract and other species budgets differ; uphold per-character source-of-truth.
6. No source or UI effect can change authoritative Rust outcome. Icarus's FIRE_ZONE affects 4×4 grid tiles for two turns only as provided by server state/events.

## Work assignments

| Worker | Inputs / outputs | Owned files | Dependencies | Reasoning |
|---|---|---|---|---|
| Reference Auditor / QA | native PNGs + spec → uncertainty/approval map, hashes | own `artifacts/character-production/.../intake/` | none | medium |
| Face Artist | approved face reference → quad face/body, 5 facial controls | unique `.blend` module | H0 | high |
| Hair, cloth and wings | approved isolated views → modular meshes, fold joints and UV | separate asset modules | H1 face interface | high |
| Weapon/props | standalone bow image → Phoenix Bow assembly | separate weapon `.blend`/GLB | H0 and cost authorization | medium |
| Rig/Animator | accepted modules → skeleton and 16 canonical clips | integrated `.blend` and clip files | H2 | high |
| Unity Tech Artist | approved FBX → prefabs/materials/VFX/cinematics | Unity asset branch | H3 | high |
| Contract/Perf QA | measurements, reload receipts, encoded video inspections | test and evidence files | each actual artifact | medium |

The CTO owns final integrated `.blend`, release manifest, `AGENTS.md` and backlog edits. Workers never quietly change opcodes/action IDs, migrate the Unity importer, alter release gates or pay for additional assets. On blocked external capabilities, mark missing and prepare exact rework items rather than inventing completion.
