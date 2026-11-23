# Tool routing, ownership, reuse, constraints

## Baseline and character source-of-truth

- Repo source: `AGENTS.md`, `README.md`, `config/development-plan.json` and current `specs/pet-arena/` contracts.
- Icarus uses `pet-v3-fire-icarus` and `FIRE_ZONE`. Use the eight original images under `Aetheria_Icarus_V4_Decoupled_Asset_Kit/00_ORIGINALS` for V4. Preserve the earlier H0 receipt and treat the kit's AI reconstruction study as exploratory.
- Existing source: `assets/characters/icarus/`, `scripts/art/`, `apps/unity-client/Assets/VirtualLife/ArtStudies/Icarus/`, `specs/pet-arena/references/icarus/`. Keep original GUIDs and actual provenances. Experimental variants go under ignored `artifacts/`.
- Read `specs/pet-arena/meshy-character-pipeline.md` and current production-v3/v4 records for actual paid job history. Record spent credits; avoid duplicate expensive calls.

## Meshy component production

1. Identify the approved source view and hash each derived input. For `HAIR_REAR_LONG`, inspect the crown through the longest visible curl. For `WING_LEFT`, verify character-side orientation, root and feather extent. For `COSTUME_ORNAMENT`, identify the missing detail on the current dress. Record obscured surfaces and inspect the mask at native resolution.
2. The lead owns paid submissions. Verify the supported endpoint, explicit model, quote, account balance and authorized pool. Select Meshy 7.1 Ultra when supported for the approved high-detail pilot, generate geometry with `should_texture: false`, and retain the unmodified download. Upload only the approved design input needed for that component.
3. Record the input hashes, parameters and reserved cost in the single pilot ledger before submission. Store the returned task ID, actual balance change and output SHA-256. On interruption or ambiguous IDs, reconcile task history and provider output before resubmitting. Track API and Agent credits separately.
4. Import the result in Blender. Render the baseline and candidate with matching front, profile and three-quarter cameras in neutral light. Record geometry counts, part separation, attachment and deformation findings. Integrate a visibly improved, editable module into a revision of the master. Retain the prior master and its hash. Texture after geometry acceptance and send the revised evidence to the affected owner gate.

## Integration constraints

1. Preserve B1 as the Icarus structural foundation. Use Meshy for form studies and modular reconstruction. Validate production facial loops, expression blending and actual eyelid and mouth motion on the editable head.
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
