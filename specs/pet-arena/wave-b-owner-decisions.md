# Wave B — consolidated owner decision package

Release state: **OFFLINE_ONLY / NO_GO_PUBLIC**. These are owner/content gates, not
permission to publish, purchase, deploy or spend on paid assets. Engineering work
continues on the gated-safe path while decisions are open.

Canonical inputs:
- [wave-a-canonical-roster-v1.json](wave-a-canonical-roster-v1.json)
- [mvp-wave-a.md](mvp-wave-a.md)
- [mvp-wave1-cdn-assets.json](mvp-wave1-cdn-assets.json)

## Current defaults

- 55 active canonical Pets: 43 frozen Wave 1 + 6 Dragons + 6 Birds.
- Six Off-rate S candidates are present but **not summonable**.
- Dragons are presentation Power Class S; Birds are presentation Power Class A.
- Six elements only: Fire, Water, Electric, Ghost, Ground, Light.
- Icarus is the flagship Limited S.
- Shared race bases are presentation bases, not collectible Pets.
- Jaderyx is the current candidate ID/name; Jadewarden is a lookup alias only.
- Solenne rights remain **PENDING_REVIEW**.
- Level cap 60; Artifact gates D1/C10/B20/A40/S60.
- No mandatory Lv20/40/60 visual evolution forms.

## Decisions

| ID | Decision | Why it gates | Safe default until decided | Owner action |
| --- | --- | --- | --- | --- |
| OD-1 | Are the six Off-rate S candidates added to the banner, or an optional future banner? | Changes summon pool, pity economics and ownership expectations. | Keep all six non-summonable; preserve the frozen Wave 1 pool. | Approve pool composition and odds; record banner version. |
| OD-2 | Acquisition route for the 12 Dragon/Bird families | They are canonical content but have no approved map/recruitment route. | Local development fixtures only; no ownership grant. | Approve map membership or a family-specific acquisition rule. |
| OD-3 | Confirm display name **Jaderyx** vs **Jadewarden** | One stable ID cannot have two canonical names. | Keep `pet-s-ground-jaderyx`, Jadewarden alias. | Confirm display name; update owning power-tier rows. |
| OD-4 | Solenne concept rights | Owner-provided replacement art is not cleared for production. | Do not publish, rig or use as production reference. | Confirm provenance/rights and approval. |
| OD-5 | Power-class ladder | Presentation class drives art expectation, not equipment or combat. | Wings: Dragons S, Birds A; Standard-S summons A presentation despite S rarity. | Confirm ladder and labels. |
| OD-6 | Approve the 31 Pet / 10 race-base concepts | Concept approval precedes modelling and rigging. | Keep concepts review-only, not model-ready. | Approve/revise/reject each concept. |
| OD-7 | Authorize model/rig/animation/VFX production | Paid/provider work and H1–H4 acceptance. | No paid generation; only already-approved Icarus study work. | Approve budget, scope and H-gate reviewers. |
| OD-8 | Fix stale **Jadewarden** rows in power-tier specs | They describe a non-minted identity. | Do not create `pet-s-ground-jadewarden`. | Let the owning spec owner correct the rows. |
| OD-9 | PvE map membership for the 12 families | Campaign recruitment/capture needs an approved route. | No campaign ownership; development fixtures only. | Assign maps or defer families beyond M4. |
| OD-10 | Audio media licensing | No production music/VO/ambience may be misrepresented as licensed. | Mixer and event hooks use procedural fallback; label as temporary. | Approve licensed media or commission production. |
| OD-11 | Environment art acceptance | Developer primitives are not final art. | Label scenes developer-intermediate; capture rendered evidence. | Accept H-gate environments or request revisions. |

## Engineering rules

- An unresolved decision must not be bypassed by a client flag, fixture or
  claimed production state.
- Candidate and unsupported identities must expose an explicit readiness/gate
  state through the canonical roster contract.
- Gated content may be exercised only through explicitly gated local/test
  fixtures; no silent ownership, banner, reward or economy grant.
- Owner approval of a concept is not approval of a model, rig, animation,
  rendered scene, audio licence or public release.
- Physical Windows qualification, human playtesting and release authorization
  remain separate M5/M6 gates.
