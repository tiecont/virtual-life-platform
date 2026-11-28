# Wave D4 production acceptance

The canonical backlog is [development-plan.json](../../config/development-plan.json). Each row identifies the revision on which its evidence was observed. A pending row needs a new run or the named decision. Technical, visual and owner acceptance are recorded separately.

## Evidence sources

| Source | Reproducible or retained evidence |
| --- | --- |
| Player / Native | Local evidence under `artifacts/wave-d4-session/{integrated-packaged-coop.json,integrated-native-verified.log}` |
| Admin | `artifacts/wave-d4-session/admin-skill-publication.json` |
| Balance / Performance | `artifacts/wave-d4-measures/{balance-summary.json,performance-summary.json}` |
| Character | `artifacts/wave-d4-art/icarus-H1-R3/gates/H1/` |
| Media / Local stage receipt | `artifacts/wave-d4-media/{original-score-r1,opening-animatic-r2,private-art-stage-receipt-r2.json}` |
| Hydrogen workflow | [Production inputs and prompt handoffs](../media/hydrogen-production.md) |
| Gallery | [Guest and equipment](../../assets/review/wave-d4/baseline/), [combat](../../assets/review/wave-d4/combat/), [six maps](../../assets/review/wave-d4/world/) |

![Functional Fire regular battle with its participant HP meter at 720p](../../assets/review/wave-d4/combat/fire-functional-regular-hp-720.webp)

[Functional Fire co-op victory and rewards](../../assets/review/wave-d4/combat/fire-functional-victory-720.webp) · [Equipped four-seat Water admission](../../assets/review/wave-d4/combat/water-functional-coop-ready-720.webp)

### Historical board comparison

![Fire board before the glyph update](../../assets/review/wave-d4/combat/fire-board-after-reconnect-1024x768.webp)

![Element silhouettes on the Linux player after reconnect, revision d032a3b9](../../assets/review/wave-d4/combat/fire-board-element-glyphs-1024x768.webp)

Both combat frames use the same 1024×768 reconnect scenario with different match seeds. The newer capture shows six shapes and visible ×2 badges. An earlier 800×500 test exposed an 11-pixel collision for ×64. After adjusting multiplied glyphs, the same assertion passed on 85c85729. Direct Editor tests returned 79 EditMode and 36 PlayMode passes, with two explicit service skips.

![Dawn Prism lighting baseline](../../assets/review/wave-d4/world/dawn-prism-sanctum-before-720p.webp)

## Integration and repository

Related tasks VL-199, VL-203.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| A01 | PR88 integrated through protected green workflow. | IN_PROGRESS | eb980abb · integration branch | Combined locally. Protected merge and hosted revision require confirmation. |
| A02 | PR89 integrated through protected green workflow. | IN_PROGRESS | eb980abb · integration branch | Combined locally. Protected merge and hosted revision require confirmation. |
| A03 | Required Rust checks pass. | IN_PROGRESS | 68584413 · native and legacy suites | Scoped local evidence and earlier protected CI exist. Full hosted suite on the new source is pending. |
| A04 | Required TypeScript and database integration checks pass. | IN_PROGRESS | 68584413 · native and legacy suites | Scoped local evidence and earlier protected CI exist. Full hosted suite on the new source is pending. |
| A05 | Governance, harness and browser checks pass. | IN_PROGRESS | 68584413 · native and legacy suites | Scoped local evidence and earlier protected CI exist. Full hosted suite on the new source is pending. |
| A06 | Historical migration compatibility preserved. | IN_PROGRESS | 68584413 · native and legacy suites | Scoped local evidence and earlier protected CI exist. Full hosted suite on the new source is pending. |
| A07 | Canonical backlog and execution checkpoints updated. | IN_PROGRESS | eb980abb · canonical plan | Keep verified states tied to exact revisions and hosted checks. |

## Playable game

Related tasks VL-199, VL-209, VL-210.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| B01 | Clean committed-source Unity build produced. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B02 | Normal guest login works. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B03 | Central Plaza navigation works. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B04 | Pet collection and owned selection work. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B05 | Equipment and Skill Training work. | IN_PROGRESS | b1472300 · progression and settlement tests | Core and earned materials exercised. Full packaged natural-training and acquisition coverage pending. |
| B06 | Regular encounters work through normal navigation. | PASS | 8ad6e6e6 · [Fire regular](../../assets/review/wave-d4/combat/fire-functional-regular-720.webp) | A fresh guest entered the Plaza, selected an owned Pet, started Fire regular and swapped adjacent jewels. Receipts v1 and v2 used the unchanged functional publication. |
| B07 | Cooperative room creation and joining work. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B08 | Four independently authenticated seats share one match. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B09 | Legal combat reaches a victory. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B10 | Legitimate rewards settle exactly once. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B11 | Progression changes the next authoritative allocation. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B12 | Return to hub and next encounter work. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B13 | Disconnect and runtime restart preserve committed state. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| B14 | Fixture-assisted and natural progression evidence are distinguished. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |

## Combat and balance

Related tasks VL-211.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| C01 | All 55 active Pets pass applicable combat conformance. | PASS | aa730cc2 · catalog_conformance | 55 Lv1 kits executed 221 abilities across 11 effect families with fixture resources. |
| C02 | All 221 abilities retain Lv1 access. | PASS | aa730cc2 · catalog_conformance | 55 Lv1 kits executed 221 abilities across 11 effect families with fixture resources. |
| C03 | All eleven supported effects have behavioral coverage. | PASS | aa730cc2 · catalog_conformance | 55 Lv1 kits executed 221 abilities across 11 effect families with fixture resources. |
| C04 | Icarus-only FIRE_ZONE preserved. | PASS | aa730cc2 · catalog_conformance | 55 Lv1 kits executed 221 abilities across 11 effect families with fixture resources. |
| C05 | Six elements have meaningful strategic identity. | IN_PROGRESS | 5e3c66bb · [Functional matchup test](../../crates/aetheria-pet-arena/src/arena8/coop/tests.rs) | Identical three-Sword matches at fixed attack and zero crit followed all 36 authored Pet/Warden matchups. Fire against Water dealt zero and Electric against Water dealt 1.5× the neutral hit. Tactical variety in human play remains to qualify. |
| C06 | Board initialization failure is reproduced and resolved. | PASS | eb980abb · Balance | Seed 114 retained. Constructive opening resolves it; lower-pressure and shared-pressure have distinct holdout outcomes. |
| C07 | Boss transformation and multiplier behavior verified. | PASS | 68584413 · Player | Phase 2 at v25. Five multiplier tiles retained on recovery. |
| C08 | Early and intermediate progression evaluated. | IN_PROGRESS | eb980abb · Balance | 2,304 simulations across six Bosses. Natural access to tested Lv20 and gear remains open. |
| C09 | At least two meaningful balance candidates compared. | PASS | eb980abb · Balance | Seed 114 retained. Constructive opening resolves it; lower-pressure and shared-pressure have distinct holdout outcomes. |
| C10 | Separate confirmation seed results recorded. | PASS | eb980abb · Balance | Seed 114 retained. Constructive opening resolves it; lower-pressure and shared-pressure have distinct holdout outcomes. |
| C11 | Six Bosses evaluated with attainable teams. | IN_PROGRESS | eb980abb · Balance | 2,304 simulations across six Bosses. Natural access to tested Lv20 and gear remains open. |
| C12 | Owner balance approval recorded separately. | OWNER_REVIEW_REQUIRED | eb980abb · Balance | Owner selects or rejects the candidate digest. |

### Jewel balance qualification

The timed six-kind studies at `6402dd7d` and `5213a1c7` provide the historical
cooperative reference. The two separate confirmation ranges beginning at 1001
and 2001 recorded 0/864 baseline wins and 467/864 under quarter Warden HP and
attack. The composition range 3011–3022 recorded 0/2592 baseline wins and
1635/2592 under the combined reduction. Tactical level-20 starter parties
still lost all six Water battles across the two confirmation ranges. The earlier
functional Fire and Water comparisons used another ruleset revision.

The [offline study](../../scripts/coop-balance-study.py) compares the timed
six-kind baseline, the historical Warden tuning hypothesis, and the separate
advanced capability. Its advanced control uses the same typed capability with
an empty encounter scope. The skill-only and encounter-only variants retain
their respective authored sources and share the control's Boss and progression
inputs. Rust validates each generated bundle at load. The capability and bundle
digest bind the RNG stream, so equal seed ranges pair sampling inputs across
variants while boards and refills can diverge. A Warden tuning study applies to
the cooperative profile. Solo regular and Warden results also exercise their
separately authored profiles.

| Gate | Decision evidence |
| --- | --- |
| J58 | Retain the timed six-kind reference and its digest. Rerun only the new metric cohort with that reference. |
| J59 | Evaluate skill conversions and opening conversions independently against the advanced control. Report unsuccessful and successful creation, matched groups, and effect results. |
| J60 | Report by Pet or party, level, loadout, encounter type, element, and one of the four public-information policies. The matrix includes both solo and co-op. Fixture loadouts establish legal reducer inputs. Natural progression still requires qualification. |
| J61 | Report unique legal swaps per committed playing turn and dead-board regenerations per refill swap check. Forced cascade-cap regeneration has a separate count. |
| J62 | Report committed HP damage, usable Mana and Rage after resource caps, healing, actual shield absorption and survivors. State deltas and paid costs measure generation across the party. Rage transfers are neutral in that calculation. |
| J63 | Compare matched advanced groups with observed occupancy and committed cleanses, Chill consumption and mitigation, and Astral tiers. Watch for repeated no-op conversions, reliance on a single support composition, shield or resource saturation, and benefits concentrated in one policy. Reducer and restart checks cover the actual abuse and replay guarantees. |
| J64 | Freeze candidate digests and a discovery cohort before evaluating a disjoint held-out range. Report unresolved outcomes and durations alongside wins and losses. |
| J65 | Review whether the Warden tuning improves attainable starter viability without trivializing trained loadouts, which advanced source yields useful matches, and whether any observed conversion or effect needs different limits. Keep every numerical candidate unpublished pending the owner's selection by digest. |

The study's elapsed time uses one synthetic second per accepted action for
determinism. The simulator reports committed turns separately. It cannot
qualify human usability under a 15-second deadline. An evaluation budget or a
policy that cannot produce an accepted action leaves a match unresolved.
Damage per turn includes committed DoT ticks. Skill healing efficiency compares
actual heals with their capacity on valid targets. Vitality jewel healing is
included in effective healing. Shield efficiency reports actual absorption as
a fraction of granted shielding.

#### Discovery and held-out results

The release simulation example at `9f0aecdd` ran the same five bundle digests
on seeds 4001–4002 and 5001–5002. Each range covered 9,840 matches across six
elements, five cooperative party cases and eighteen solo Pet/loadout cases.
The matrix used levels 10, 20 and 40, unmodified and equipped Pets, all six
Wardens and six solo regular opponents. The two ranges use four policies and
two seeds per matrix cell.

| Bundle | Digest prefix | Co-op Warden wins out of 240 per range | Solo Warden wins out of 864 per range | Solo regular wins out of 864 per range |
| --- | --- | ---: | ---: | ---: |
| Timed six-kind baseline | `a7f7ca28` | 0 / 0 | 285 / 342 | 606 / 712 |
| Quarter cooperative Warden HP and attack | `50bb2377` | 148 / 146 | 385 / 265 | 693 / 691 |
| Advanced control | `8ba10bc1` | 0 / 0 | 352 / 324 | 673 / 676 |
| Skill conversion only | `eea5920c` | 0 / 0 | 387 / 406 | 709 / 711 |
| Opening conversion only | `c8663739` | 0 / 0 | 379 / 265 | 704 / 710 |

Each cell lists discovery, then held-out wins. The quarter-Warden bundle
preserves the solo opponent and progression values. Differences in its solo
results reflect a changed digest and sample stream. The quarter-Warden co-op
tactical level-20 starters still lost all four Tideglass runs. The owner can
consider the pressure reduction for further tuning while keeping Tideglass
starter viability and progression open.

Across both ranges the rates and counts were:

- 0 swapless playing turns out of 1,422,290 observations. The reducer
  regenerated 240 transient dead boards in 1,278,168 refill swap checks
  (0.0188%). Another 9 regenerations occurred after the cascade cap. The
  longest scored chain was eight waves including the initial match.
- 1,986,638 Mana and 3,454,635 Rage generated after caps, 9,552,612 HP healed,
  and 7,279,636 damage absorbed from 23,446,860 shielding granted. The row-level
  results retain denominators for comparisons by mode, level and policy.
- Opening generation yielded advanced matches in 135 co-op and 198 solo runs.
  Skill conversion yielded advanced matches in 3 co-op and 109 solo runs,
  reached the configured nine-tile occupancy cap and logged 1,708 no-op
  conversions. The combined skill-only rows recorded 10 statuses cleansed,
  109 chilled enemy actions, and 1,130 Astral upgrades. Opening-only rows
  recorded 11 cleanses, 102 chilled actions and 25 upgrades.
- All 245 unresolved matches exhausted the evaluation budget with zero
  damage against a same-element solo Warden. Light Dawnarchon and Aurelune
  accounted for 195 Dawn runs. Ghost Vesperyn accounted for 50 Lantern runs.
  There were zero round-limit defeats or stalls from a lack of accepted
  actions. These immunity and sustain combinations warrant a separate
  decision before live qualification.

Opening groups saw more use in co-op than these skill bindings. Skill-only
Astral upgrades concentrated in solo play. Preserve both as unpublished
experiments while the owner reviews match access, conversion caps and
attainable support Pets. The small per-cell samples and concentrated
immunity stalls limit balance conclusions.

The complete commands, full digests and row metrics are in the ignored
`artifacts/jewel-study-4001/` and `artifacts/jewel-study-5001/` outputs.
The same source passed the observer equivalence check and all 80 Pet Arena
library unit tests. The engine's typed skill audit at authored advanced
digest `059f60a8` found 221 unique skill bindings.

#### Canonical skill audit

The typed catalog binds 221 unique abilities across 55 active Pets. The
effect counts are 111 Damage, 55 Buff, 21 Shield, 9 Debuff, 8 Rage Transfer,
5 Heal, 4 Mana Restore, 4 Curse, 2 Cleanse, 1 Chain Damage and
1 Damage over Time. The earlier cast-conformance receipt supplied resources
and applicable targets. The example's `--audit-skills BUNDLE` lists each
active binding, original effect, target, costs and cooldown.

| Experimental conversion binding | Canonical ability | Evaluation focus |
| --- | --- | --- |
| Nature | `pet-v31-light-aurelune-dawn-cleanse` cleanses allies for 16 Mana and has a two-turn cooldown. | Inspect Lantern's reapplication of Vulnerability and the interval between the skill's cleanse and the converted group's match. `light-gleamlet-dawn-cleanse` is a same-effect candidate for a later starter comparison. |
| Frost | `pet-v31-water-marivell-tidal-mending` heals allies for 40 Rage and has a two-turn cooldown. | Check whether the converted group can be matched before the next threatening committed attack. Compare damage mitigation separately from Marivell's existing heal. `water-foamcurl-foam-salve` is a lowest-ally heal candidate if access becomes a concern. |
| Astral | `light-dawnarchon-ray-prism-burst` shields allies for 40 Rage and has a two-turn cooldown. | Track eligible surviving basic jewels, upgrades by resulting tier, and downstream resource or attack yield. Separate the original shield's effect from the conversion. |

These three bindings retain their canonical abilities and add conversions in
the authored experimental encounters. Wardens in Lantern, Tideglass and Dawn
provide isolated opening conversions for Nature, Frost and Astral.

## Progression and economy

Related tasks VL-207, VL-208.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| D01 | Every skill has explicit trainable or fixed policy. | PASS | 6aa4a64a · skill-training-candidate.mjs | Unpublished candidate defines 164 trainable and 57 fixed skills. |
| D02 | Skill upgrade costs and scaling have authoritative semantics. | IN_PROGRESS | b2a35703 · Admin | Browser-published Tide Lance Lv2 at 17 materials and 1150‰ in disposable PostgreSQL. Complete Artifact domain acceptance. |
| D03 | Core, Aegis and Rune binding verified. | IN_PROGRESS | b1472300 · progression and settlement tests | Core and earned materials exercised. Full packaged natural-training and acquisition coverage pending. |
| D04 | Earned Artifact acquisition and equipment verified. | IN_PROGRESS | b1472300 · progression and settlement tests | Core and earned materials exercised. Full packaged natural-training and acquisition coverage pending. |
| D05 | Skill and Artifact changes preserve active-match immutability. | IN_PROGRESS | b1472300 · progression and settlement tests | Core and earned materials exercised. Full packaged natural-training and acquisition coverage pending. |
| D06 | Natural guest progression evidence recorded. | PASS | b1472300 · progression tests | Natural guest first clear and starter wallet repair verified independently from packaged fixtures. |
| D07 | Achievement Point eligibility and abuse resistance verified. | IN_PROGRESS | b1472300 · progression and settlement tests | Core and earned materials exercised. Full packaged natural-training and acquisition coverage pending. |
| D08 | Recruitment works for both encounter completion orders. | PASS | 76394de5 · coop-settlement.test.ts | Both encounter orders exercised over six maps using terminal proposals. |
| D09 | Acquisition and rarity rules remain canonical. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| D10 | Six gated candidates remain gated. | PASS | eb980abb · conformance | 55 active and six disabled candidates. |

## Unity visual quality

Related tasks VL-179, VL-210.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| E01 | Actual pre-change baseline screenshots captured. | IN_PROGRESS | 663de837 · Gallery | Baseline 1024×768 captures. Still need complete screens and matched after views. |
| E02 | Main menu visual improvement demonstrated. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E03 | Central Plaza visual improvement demonstrated. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E04 | Pet collection and detail presentation improved. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E05 | Equipment and Skill Training visual quality improved. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E06 | Campaign and lobby presentation improved. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E07 | Combat board readability and visual quality improved. | IN_PROGRESS | e19170e5 · ElementTiles | Six shapes separate from corner multiplier badges in the Linux capture. Disabled-seat contrast, use of screen width and scroll-dependent actions need review. |
| E08 | Six elemental tiles are visually distinguishable. | PASS | d032a3b9 · rendered Linux comparison | Flame, droplet, bolt, ghost, mountain and star silhouettes are visible in the retained reconnect frame. |
| E09 | Active turn and resource state remain readable. | IN_PROGRESS | 663de837 · Gallery | Baseline 1024×768 captures. Still need complete screens and matched after views. |
| E10 | Cascades and multiplier effects are visually satisfying. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E11 | Skill, damage, healing and shield feedback works. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E12 | Boss transformation presentation works. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E13 | Victory and reward presentation works. | IN_PROGRESS | 663de837 · Gallery | Baseline 1024×768 captures. Still need complete screens and matched after views. |
| E14 | Reduced motion and flash controls verified. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E15 | 1080p and 720p layouts inspected. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E16 | Compact window layout inspected. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| E17 | Before-and-after gameplay evidence published within permitted scope. | IN_PROGRESS | 663de837 · Gallery | Baseline 1024×768 captures. Still need complete screens and matched after views. |
| E18 | Remaining visual defects explicitly recorded. | PASS | 663de837 · Gallery | Tile labels collided, board used half the window, actions required scrolling. Dawn highlights clip. |

## Character production

Related tasks VL-204, VL-205.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| F01 | Owner reference inventory and hashes verified. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| F02 | Icarus face and hair review package prepared. | PASS | 89db72d3 · Character | H1 R3 face and expression views retained. Five independent Blender controls. Separate blink preview. |
| F03 | Icarus facial deformation evidence produced. | PASS | 89db72d3 · Character | H1 R3 face and expression views retained. Five independent Blender controls. Separate blink preview. |
| F04 | Icarus modular costume and accessories inspected. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| F05 | Icarus wing articulation and bow attachment verified where permitted. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| F06 | Actual model geometry and material budgets measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| F07 | Actual rig and animation evidence produced where permitted. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| F08 | Representative starter Pet production advanced. | IN_PROGRESS | 89db72d3 · Character | Morphology references and two identity concepts exist. Production models pending. |
| F09 | Representative Dragon and Bird production advanced. | IN_PROGRESS | 89db72d3 · Character | Morphology references and two identity concepts exist. Production models pending. |
| F10 | Actual Unity model renders captured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| F11 | Production readiness updated per actual asset stage. | PASS | eb980abb · canonical plan | Accepted production model count 0/55. H1 undecided; later gates require separate decisions. |
| F12 | H1-H4 owner approvals remain separate and accurate. | PASS | eb980abb · canonical plan | Accepted production model count 0/55. H1 undecided; later gates require separate decisions. |

## World and environment

Related tasks VL-188, VL-206.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| G01 | Central Plaza world composition reviewed. | PASS | c6276c4c · Gallery | Visually reviewed development scenes; overbright Dawn and repeated primitive composition need improvement. |
| G02 | Cinder Terraces playable scene verified. | PASS | c6276c4c · Gallery | Local build receipt and actual six-map world route; 64 tiles per arena and round-trip portals. |
| G03 | Tideglass Lagoon playable scene verified. | PASS | c6276c4c · Gallery | Local build receipt and actual six-map world route; 64 tiles per arena and round-trip portals. |
| G04 | Stormcoil Fields playable scene verified. | PASS | c6276c4c · Gallery | Local build receipt and actual six-map world route; 64 tiles per arena and round-trip portals. |
| G05 | Lantern Necropolis playable scene verified. | PASS | c6276c4c · Gallery | Local build receipt and actual six-map world route; 64 tiles per arena and round-trip portals. |
| G06 | Ochre Labyrinth playable scene verified. | PASS | c6276c4c · Gallery | Local build receipt and actual six-map world route; 64 tiles per arena and round-trip portals. |
| G07 | Dawn Prism Sanctum playable scene verified. | PASS | c6276c4c · Gallery | Local build receipt and actual six-map world route; 64 tiles per arena and round-trip portals. |
| G08 | Six regular encounter paths verified. | IN_PROGRESS | 76394de5 · coop-settlement.test.ts | One fresh guest cleared all six regular encounters through authenticated native play at 4bae21f5. Six-map packaged play remains open. |
| G09 | Six cooperative Boss encounter paths verified. | IN_PROGRESS | 76394de5 · coop-settlement.test.ts | Six-map cooperative settlement used fixture terminals. Four-account packaged Warden victories across all six maps remain open. |
| G10 | Portal and campaign progression verified. | IN_PROGRESS | 76394de5 · coop-settlement.test.ts | All six unlocks persisted for one fresh guest at 4bae21f5. The six-map packaged portal route was tested separately at c6276c4c. |
| G11 | Environment lighting and composition visually reviewed. | PASS | c6276c4c · Gallery | Visually reviewed development scenes; overbright Dawn and repeated primitive composition need improvement. |
| G12 | Actual in-game map screenshots available. | PASS | c6276c4c · Gallery | Visually reviewed development scenes; overbright Dawn and repeated primitive composition need improvement. |

## Gemini cinematic and music production

Related tasks VL-184, VL-187.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| H01 | Actual Gemini session capability inspected. | PASS | 3d23e0be · Gemini workflow | Authenticated tab exposed Create image, video and music. Tideglass navigation master retrieved at 2730×1536 and verified in the local private stage. |
| H02 | Authorized generation workflow established. | PASS | 3d23e0be · Gemini workflow | Authenticated tab exposed Create image, video and music. Tideglass navigation master retrieved at 2730×1536 and verified in the local private stage. |
| H03 | Opening cinematic candidate produced. | IN_PROGRESS | 8df1f478 · Media | 25.6 s, 720p, 30 fps local animatic. Final title remains legible against the dimmed Dawn shot. Rig animation, final cinematic and rights review remain open. |
| H04 | Icarus introduction candidate produced where references are authorized. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| H05 | Icarus skill showcase candidate produced. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| H06 | Fire cinematic candidate produced. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| H07 | Water cinematic candidate produced. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| H08 | Main theme candidate produced. | PASS | d1435d44 · Media | Local original eight-cue audition includes WAV masters and Ogg derivatives. |
| H09 | Central Plaza music or ambience produced. | PASS | d1435d44 · Media | Local original eight-cue audition includes WAV masters and Ogg derivatives. |
| H10 | Exploration music candidates produced. | PASS | d1435d44 · Media | Local original eight-cue audition includes WAV masters and Ogg derivatives. |
| H11 | Boss combat and Phase 2 music candidates produced. | PASS | d1435d44 · Media | Local original eight-cue audition includes WAV masters and Ogg derivatives. |
| H12 | Victory and defeat audio candidates produced. | PASS | d1435d44 · Media | Local original eight-cue audition includes WAV masters and Ogg derivatives. |
| H13 | Visual and audio defects reviewed. | IN_PROGRESS | d1435d44 · Media | Technical audition and provenance available. Listening review, clearance and score integration pending. |
| H14 | Actual media files retained. | PASS | d1435d44 · Media | Local original eight-cue audition includes WAV masters and Ogg derivatives. |
| H15 | Technical and rights status recorded. | IN_PROGRESS | d1435d44 · Media | Technical audition and provenance available. Listening review, clearance and score integration pending. |
| H16 | Authorized media integrated into Unity. | IN_PROGRESS | d1435d44 · Media | Technical audition and provenance available. Listening review, clearance and score integration pending. |
| H17 | Cinematic skip, audio controls and transitions verified. | NOT_RUN | — | Collect dedicated evidence for this condition. |

## Performance

Related tasks VL-181, VL-213.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| I01 | Pre-change executable performance baseline recorded. | PASS | 68584413 · Performance | Three 720p 60 Hz Gamescope runs. Mean 58.38–59.08 FPS. Whole-route p99 49.77–59.64 ms. Windows hardware qualification open. |
| I02 | Representative hardware and workload recorded. | PASS | 68584413 · Performance | Three 720p 60 Hz Gamescope runs. Mean 58.38–59.08 FPS. Whole-route p99 49.77–59.64 ms. Windows hardware qualification open. |
| I03 | Frame-time percentiles measured. | PASS | 68584413 · Performance | Three 720p 60 Hz Gamescope runs. Mean 58.38–59.08 FPS. Whole-route p99 49.77–59.64 ms. Windows hardware qualification open. |
| I04 | CPU and supported GPU metrics measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I05 | Draw calls, geometry and texture memory measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I06 | Scene and asset loading measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I07 | Repeated transition memory growth inspected. | IN_PROGRESS | 68584413 · Performance | Observed peak RSS 420.9–423.7 MiB in two runs. Longer soak and attribution pending. |
| I08 | Four-player combat workload measured. | IN_PROGRESS | 8ad6e6e6 · 1024×768 Fire match, one packaged player and three authenticated partner clients | Idle rendering after Start averaged 59.91 FPS over 1,557 frames with the host Reconnect control visible. Sustained active turns and four packaged players remain unmeasured. |
| I09 | Boss transformation and VFX workload measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I10 | Actual identified bottlenecks optimized. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I11 | Visual quality preserved after optimization. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I12 | Native and database latency measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I13 | Concurrent match and recovery workloads measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I14 | Performance regression tooling maintained. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| I15 | Physical hardware qualification status reported honestly. | PASS | 68584413 · Performance | Three 720p 60 Hz Gamescope runs. Mean 58.38–59.08 FPS. Whole-route p99 49.77–59.64 ms. Windows hardware qualification open. |

## Security and reliability

Related tasks VL-201, VL-203.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| J01 | Authentication and session boundaries reviewed. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J02 | Cross-account Pet and Artifact access rejected. | PASS | 68584413 · Native | Restricted runtime and independent accounts exercised ownership, mutation rejection, restart and reward deduplication. |
| J03 | Unauthorized Skill Level upgrades rejected. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J04 | Native ticket scope and expiry verified. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J05 | Unauthorized commands rejected without mutation. | PASS | 68584413 · Native | Restricted runtime and independent accounts exercised ownership, mutation rejection, restart and reward deduplication. |
| J06 | Replay and duplicate rewards prevented. | PASS | 68584413 · Native | Restricted runtime and independent accounts exercised ownership, mutation rejection, restart and reward deduplication. |
| J07 | Configuration immutability preserved. | PASS | 68584413 · Native | Restricted runtime and independent accounts exercised ownership, mutation rejection, restart and reward deduplication. |
| J08 | Admin authorization and CSRF preserved. | IN_PROGRESS | b2a35703 · Admin | Authenticated Chromium and TOTP with operator actions; unauthenticated overview denied. Dedicated CSRF regression evidence on this revision remains open. |
| J09 | Account deletion and privacy regression verified. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J10 | Asset input validation and storage boundaries reviewed. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J11 | External media import treated as untrusted input. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J12 | Interrupted uploads and corrupted asset retrieval tested. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J13 | Relevant dependency and secret scans completed. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J14 | Identified security defects repaired or explicitly recorded. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| J15 | No restricted security evidence exposed publicly. | NOT_RUN | — | Collect dedicated evidence for this condition. |

## Admin and configuration authority

Related tasks VL-208.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| K01 | Supported gameplay parameters remain Admin-controlled. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| K02 | Skill Training and Artifact configuration usable. | IN_PROGRESS | b2a35703 · Admin | Browser-published Tide Lance Lv2 at 17 materials and 1150‰ in disposable PostgreSQL. Complete Artifact domain acceptance. |
| K03 | Encounter, reward and eligibility editing usable. | PASS | b2a35703 · Admin | 34 scenarios. Real browser edits, Rust validation, four-seat pinned allocation, restart and A/B/A rollback. |
| K04 | Balance comparison interface usable. | PASS | b2a35703 · Admin | 34 scenarios. Real browser edits, Rust validation, four-seat pinned allocation, restart and A/B/A rollback. |
| K05 | Actual browser A/B publication verified. | PASS | b2a35703 · Admin | 34 scenarios. Real browser edits, Rust validation, four-seat pinned allocation, restart and A/B/A rollback. |
| K06 | Runtime behavior changes without recompilation. | PASS | b2a35703 · Admin | 34 scenarios. Real browser edits, Rust validation, four-seat pinned allocation, restart and A/B/A rollback. |
| K07 | Original match survives restart with original configuration. | PASS | b2a35703 · Admin | 34 scenarios. Real browser edits, Rust validation, four-seat pinned allocation, restart and A/B/A rollback. |
| K08 | Rollback affects subsequent matches. | PASS | b2a35703 · Admin | 34 scenarios. Real browser edits, Rust validation, four-seat pinned allocation, restart and A/B/A rollback. |
| K09 | Asset readiness and media metadata accurately represented. | NOT_RUN | — | Collect dedicated evidence for this condition. |

## Cloud assets and evidence

Related tasks VL-178, VL-182.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| L01 | Public-safe visual evidence directory established. | PASS | 663de837 · Gallery | 15 curated WebP baseline frames, 821278 bytes total; redacted room and guest identifiers. |
| L02 | Narrow review-image Git policy established if needed. | PASS | 663de837 · Gallery | 15 curated WebP baseline frames, 821278 bytes total; redacted room and guest identifiers. |
| L03 | Acceptance Markdown renders relative image links. | PASS | 663de837 · Gallery | 15 curated WebP baseline frames, 821278 bytes total; redacted room and guest identifiers. |
| L04 | Production originals kept outside Git. | PASS | 8df1f478 · Media | Local editable originals and masters retained privately. |
| L05 | Authorized source images delivered to private cloud. | NOT_RUN | Local stage receipt | 9 files staged, 31259568 bytes. No verified private cloud upload or retrieval. |
| L06 | Authorized VRM/GLB/FBX/Blender assets delivered. | NOT_RUN | Local stage receipt | 9 files staged, 31259568 bytes. No verified private cloud upload or retrieval. |
| L07 | Authorized cinematic and music files delivered. | NOT_RUN | Local stage receipt | 9 files staged, 31259568 bytes. No verified private cloud upload or retrieval. |
| L08 | Authorized build and test packages delivered. | NOT_RUN | Local stage receipt | 9 files staged, 31259568 bytes. No verified private cloud upload or retrieval. |
| L09 | Versioned manifests maintained. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| L10 | Uploaded object existence verified. | NOT_RUN | Local stage receipt | 9 files staged, 31259568 bytes. No verified private cloud upload or retrieval. |
| L11 | Retrieved asset SHA-256 verified. | NOT_RUN | Local stage receipt | 9 files staged, 31259568 bytes. No verified private cloud upload or retrieval. |
| L12 | Private access configuration verified. | NOT_RUN | Local stage receipt | 9 files staged, 31259568 bytes. No verified private cloud upload or retrieval. |
| L13 | Local originals preserved. | PASS | 8df1f478 · Media | Local editable originals and masters retained privately. |
| L14 | No credentials, signed URLs or restricted evidence committed. | NOT_RUN | — | Collect dedicated evidence for this condition. |

## Final product review

Related tasks VL-199, VL-212, VL-214.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| M01 | Integrated executable available for owner review. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| M02 | Actual gameplay screenshot gallery available. | PASS | 663de837 · Gallery | 15 curated WebP baseline frames, 821278 bytes total; redacted room and guest identifiers. |
| M03 | Character review package available. | OWNER_REVIEW_REQUIRED | 89db72d3 · Character | H1 R3 is ready for owner face and hair review. |
| M04 | Cinematic and music review references available. | PASS | 8df1f478 · Media | Local opening MP4 and eight audio auditions retained. |
| M05 | Performance comparison available. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| M06 | Security verification summary available. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| M07 | Remaining visual and gameplay defects prioritized. | PASS | 663de837 · Gallery | Tile labels collided, board used half the window, actions required scrolling. Dawn highlights clip. |
| M08 | Independent QA reviewed integrated functionality. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| M09 | Four-human playtest preparation completed. | PASS | 68584413 · scripts/packaged-coop/README.md | Four-person protocol available. No human session recorded. |
| M10 | Owner approval gates remain intact. | PASS | eb980abb · canonical plan | Accepted production model count 0/55. H1 undecided; later gates require separate decisions. |
| M11 | Canonical task states match actual acceptance. | IN_PROGRESS | eb980abb · canonical plan | Keep verified states tied to exact revisions and hosted checks. |
| M12 | Release remains OFFLINE_ONLY / NO_GO_PUBLIC. | PASS | eb980abb · canonical plan | OFFLINE_ONLY / NO_GO_PUBLIC. |

## N. Product design correction

The historical gameplay screenshots above show elemental boards. Baseline source for pending rows is 3c9ac05b. The following entries track the functional-board product separately.

| ID | Task | Condition | Status | Source and evidence | Remaining qualification |
| --- | --- | --- | --- | --- | --- |
| [x] N01 | VL-176 | Conflicting original and Wave A specifications reconciled. | PASS | b5e10d87 · [Product contract](../pet-arena/mvp-wave-a.md) | Reconciled original v2/v3.1 vocabulary, 8×8 dimensions and legacy replay boundaries. |
| [x] N02 | VL-176 | Pet Element and functional TileKind are distinct authoritative concepts. | PASS | d79dcb43 · [Rust tile identity](../../crates/aetheria-pet-arena/src/arena8/coop/mod.rs) | 8ad6e6e6 packaged solo and ea298452 four-seat Fire admitted a Pet and swapped functional jewels on the server. |
| [x] N03 | VL-176 | All six functional tile categories have implemented and tested semantics. | PASS | d79dcb43 · [Cooperative effect tests](../../crates/aetheria-pet-arena/src/arena8/coop/tests.rs) | 91415575 tested all six weighted effects separately in four-seat Fire, solo Warden and solo regular encounters. |
| [x] N04 | VL-176 | Utility tile matches no longer implicitly produce generic attack damage. | PASS | d79dcb43 · [Functional resolution](../../crates/aetheria-pet-arena/src/arena8/coop/functional.rs) | 91415575 verified every utility-only match leaves enemy HP unchanged and consumes no crit draw across all three encounter profiles. |
| [x] N05 | VL-176 | Multiplier behavior is correct for each functional tile. | PASS | d79dcb43 · [Multiplier and cap tests](../../crates/aetheria-pet-arena/src/arena8/coop/tests.rs) | 91415575 verified weighted rewards and damage in three profiles. The Linux four-seat restart recovered the same six multiplier tiles and board. |
| [x] N06 | VL-176 | Solo and cooperative gameplay use the intended versioned functional-board contract. | PASS | 08d0a70e · [PACKAGED_GAMEPLAY](../../assets/review/wave-d4/combat/fire-functional-solo-packaged-1080.webp) | Packaged solo on 8ad6e6e6 and four-seat Fire on ea298452 completed native swaps. Four-seat restart retained the published configuration digest and board. |
| [x] N07 | VL-203 | Historical elemental-board matches and replays remain compatible. | PASS | 9ab5beac · [Recovery harness](../../scripts/admin-gameplay-publication.mjs) | Two distinct native executables restored the original match, pinned hash and settlement policy across restart and rollback. Frozen replay tests passed separately. |
| [x] N08 | VL-208 | Functional tile configuration is database-owned and Admin-editable. | PASS | 834198e3 · [Admin publication harness](../../scripts/admin-gameplay-publication.mjs) | On the same Rust binary, an opening three-Mana match yielded 3 under publication A, 100 under B, and 3 on a new allocation after rollback. Existing matches kept their digest across restart. |
| [x] N09 | VL-211 | Corrected gameplay balance simulations executed. | PASS | 44bc7fab · [Reproducible study](../../scripts/coop-balance-study.py) | 1,728 Fire/Water battles plus 576 held-out Water battles. The level-20 starter party won 0/24 under reference pressure and 6/24 in both alternatives under the tactical policy. Owner selection pending. |
| [x] N10 | VL-210 | Six original functional gem artwork candidates produced. | PASS | fa65a2de · [R04-generated jewels](../../assets/review/wave-d4/combat/functional-gems-r04-reference-generated.webp) | Six functional icons match the supplied R04 board. Three reserve icons from a second reference-generated sheet were added at eb7314d1. |
| [ ] N11 | VL-210 | Production sprite atlas integrated into Unity. | IN_PROGRESS | fa65a2de · [R04 provenance](../media/hydrogen-production.md) | All six 128×128 regions and six standalone icons matched resized provider pixels. At eb7314d1, 85 EditMode and 43 PlayMode cases passed, with two PlayMode skips. At ae93b774 the [packaged Fire board](../../assets/review/wave-d4/combat/fire-coop-r04-jewels-720.webp) displayed all six designs across its 64 cells at 1280×720. At e9aacee9 the same Linux workflow cleared Fire, settled four rewards and captured the [Water board after a swap](../../assets/review/wave-d4/combat/water-coop-r04-jewels-720.webp). Owner visual acceptance remains open. |
| [x] N12 | VL-210 | Actual battle screen contains a centered 8x8 board. | PASS | d203f179 and a7a71647 · [Cooperative board](../../assets/review/wave-d4/combat/fire-functional-coop-packaged-720.webp) | The measured horizontal grid-center offset was 0 px at 1280×720 and 1920×1080. Fire co-op before and after reconnect produced identical frames. |
| [ ] N13 | VL-210 | Player Pets and Boss have dedicated battle-side presentation. | IN_PROGRESS | 415c9754 · [Battle layout](../../apps/unity-client/Assets/Aetheria/Features/PetArena/Presentation/BattleScreenLayout.cs) | Four separate roster panels and a dedicated Boss panel were visible at 720p and 1080p. At 9eb7df53 each participant gained a projected HP meter; 13 co-op EditMode and 7 HUD PlayMode checks passed, including meter bounds at both resolutions. A [6a100b61 Linux capture](../../assets/review/wave-d4/combat/fire-functional-regular-hp-720.webp) shows the solo meter after a committed swap. Fire still uses one Pet and one enemy blockout. Runtime admission of final Pet and Warden artwork is pending. |
| [x] N14 | VL-196 | No player-controlled locomotion during active battle. | PASS | 8ad6e6e6 · [Packaged Fire battle](../../assets/review/wave-d4/combat/fire-functional-coop-packaged-720.webp) | In a separate packaged Fire run, held W/A/S/D and two E presses left the same authenticated match and committed turn v1. A legal mouse swap then committed v2. |
| [x] N15 | VL-196 | No redundant physical checkerboard behind the interactive board. | PASS | 8ad6e6e6 · [Water regular](../../assets/review/wave-d4/combat/water-functional-regular-1080.webp) | Fire 720p and Water 1080p show one interactive grid over their fixed landscape backgrounds. |
| [x] N16 | VL-196 | Battle camera remains stable during ordinary gameplay. | PASS | 8ad6e6e6 · [Fixed camera](../../apps/unity-client/Assets/Aetheria/Features/World/Presentation/FixedBattleCamera.cs) | Three actor/background regions were pixel-identical in 13 private Linux frames before, during and after movement and portal input. Grid bounds stayed fixed. |
| [ ] N17 | VL-206 | Fire battle background demonstrates original visual identity. | IN_PROGRESS | ef7beab0 · [PACKAGED_GAMEPLAY](../../assets/review/wave-d4/combat/fire-functional-solo-packaged-1080.webp) | Background rendered in the fixed Fire battle. Both actors still use development blockouts. Owner visual review pending. |
| [ ] N18 | VL-206 | Water battle background demonstrates distinct visual identity. | IN_PROGRESS | 8ad6e6e6 · [PACKAGED_GAMEPLAY](../../assets/review/wave-d4/combat/water-functional-regular-1080.webp) | Tideglass cliffs, turquoise water and shells are visible after a committed swap. Disposable account had both Fire clears preloaded. Owner visual review pending. |
| [ ] N19 | VL-205 | Actual character animation and skill effects integrated where authorized. | NOT_RUN | 3c9ac05b · [Product contract](../pet-arena/mvp-wave-a.md) | H1 owner decision and later rig/animation gates pending. |
| [x] N20 | VL-199 | Actual solo battle screenshot captured. | PASS | 8ad6e6e6 · [Fire](../../assets/review/wave-d4/combat/fire-functional-regular-720.webp) and [Water](../../assets/review/wave-d4/combat/water-functional-regular-1080.webp) | Real Linux regular combat after the camera fix. Each native allocation recorded Start v1 and swap v2 with 64 tiles and four abilities. |
| [x] N21 | VL-199 | Actual four-player cooperative battle screenshot captured. | PASS | a7a71647 · [PACKAGED_GAMEPLAY](../../assets/review/wave-d4/combat/fire-functional-coop-packaged-720.webp) | Four authenticated seats in the same Fire match, 64 functional tiles, committed Start v1 at 1280×720. One Linux player and three integration clients. |
| [x] N22 | VL-210 | Before-and-after visual comparison available. | PASS | [Elemental board, d032a3b9](../../assets/review/wave-d4/combat/fire-board-element-glyphs-1024x768.webp) · [Functional board, 8ad6e6e6](../../assets/review/wave-d4/combat/fire-functional-coop-1024x768.webp) | Both show a four-seat Cinder Terraces Warden match at 1024×768. The old frame follows a reconnect. The new frame follows Start at v1 and shows the Reconnect control. |
| [x] N23 | VL-210 | Corrected battle presentation tested at 1080p and 720p. | PASS | 8ad6e6e6 · [Fire 720p](../../assets/review/wave-d4/combat/fire-functional-regular-720.webp) · [Water 1080p](../../assets/review/wave-d4/combat/water-functional-regular-1080.webp) | Solo Start and swap at both sizes. Fire co-op showed all four seats and actions at 720p and 1080p. The 1080p co-op frame shows turn 0 and four separate skill buttons after a committed Start. |
| [x] N24 | VL-211 | Performance measured with the corrected presentation. | PASS | 150ac8f2 solo, 8ad6e6e6 four seats, 2ae2d772 backdrop profile | At idle after Start, p95 was 19.56 ms solo 720p, 19.94 ms solo 1080p and 20.72 ms co-op 1024×768. Same camera code measured 16.387/19.282 ms per Fire/Water load and 4,720,504 Unity-estimated texture bytes each. One shared AMD host, one request per map, no timed swaps. |
| [x] N25 | VL-203 | Security and historical compatibility independently verified. | PASS | 9ab5beac and 5b6aab57 · [Publication and recovery harness](../../scripts/admin-gameplay-publication.mjs) | Independent local review, 21 security files with 278 passing tests, both archived migration gates through 0066, two native executables and 30 historical recovery/settlement scenarios. Hosted CI pending. |
| [x] N26 | VL-199 | Public-safe review screenshots committed to GitHub. | PASS | [GitHub gallery at 7a356c69](https://github.com/tiecont/virtual-life-platform/tree/7a356c69d14f953203f3edd57d24a70e84cb8529/assets/review/wave-d4/combat) | Verified the hosted Git blob IDs for four stripped WebP frames against the integrated sources. |
| [ ] N27 | VL-204 | Authorized original artwork and production assets delivered to private cloud with verified manifests. | IN_PROGRESS | 14af5af3 · Local manifest `a4a5a0a3997a85c90a12725de1e6778f5690033e6669c73bd0470aa6681103f8` | Local private stage verified. Destination and authorized cloud receipt pending. |
| [ ] N28 | VL-198 | Owner visual acceptance recorded separately. | OWNER_REVIEW_REQUIRED | 3c9ac05b · [Product contract](../pet-arena/mvp-wave-a.md) | Obtain explicit owner visual decision. |

The fixed-camera Fire and Water studies are CONCEPT images generated with OpenAI ImageGen on 27 November 2026 using original text briefs. No external character reference was supplied. The 1,672×941 PNG originals are in the private local stage identified at N27. The JPEGs bundled for offline review and the smaller WebP derivatives share those originals. Owner art and rights review remain pending. The linked scale and state sheet documents the historical vector design. At fa65a2de the functional board switched to six sprites generated directly from the owner’s R04 image. The Gemini comparison atlas was restored from its private master. Owner visual acceptance remains open.

[Fire concept](../../assets/review/wave-d4/world/cinder-terraces-battle-concept.webp) · [Water concept](../../assets/review/wave-d4/world/tideglass-lagoon-battle-concept.webp) · [Jewel scale and states](../../assets/review/wave-d4/combat/functional-gems-scale-states.webp)

The Gemini tab produced a separate navigation concept showing the arrival path around a tidal pool toward a stone arch. Its 2730×1536 PNG is in the verified private local stage `wave-d4-gemini/tideglass-navigation-stage-r1`. [Tideglass navigation concept](../../assets/review/wave-d4/world/tideglass-navigation-gemini-concept.webp)

Using a disposable acceptance configuration with adjusted encounter, skill costs and rewards, the functional Fire PACKAGED_GAMEPLAY run on ea298452 verified settlement. In that run, the native player and three authenticated peers resumed the saved board after a runtime restart. The Warden entered phase two at version 23. Victory at version 32 produced four first-clear receipts, each worth 144 coins, 105 Pet EXP, 333 Achievement Points and 7 artifact materials. The player equipped the Emberglass Core and upgraded it to level 2. [Phase two](../../assets/review/wave-d4/combat/fire-functional-phase-two-720.webp) · [Victory and rewards](../../assets/review/wave-d4/combat/fire-functional-victory-720.webp)

The c1c5b343 Linux player displayed Victory and kept Return to roster disabled while the Fire solo receipt was pending. The receipt then showed 200 coins, 500 Pet EXP and zero Artifact materials, and enabled the return button. This 1280×720 PACKAGED_GAMEPLAY capture used a disposable Fire regular with 12 HP, 1 defense and zero MP cost for Ember Lance. The test delayed the settlement response by seven seconds so both states could be captured. [Pending settlement](../../assets/review/wave-d4/combat/fire-solo-settlement-pending-720.webp) · [Received reward](../../assets/review/wave-d4/combat/fire-solo-settlement-720.webp)

On 86f883d2 a guest playing solo Fire on the unchanged functional candidate survived a Nest and Rust restart. The same running Linux player recovered the saved version 2 and committed a subsequent swap at version 3. The journal contained exactly the three Start and swap receipts.

A second 1280×720 packaged run on 8c69d12c completed the Fire-to-Water route through the Plaza. After Fire victory at version 37 the host equipped and upgraded Emberglass. The four-seat Tideglass allocation displayed 191 HP for the host Coalwhisk and 186 HP for its unequipped level-4 counterpart. This capture shows Water before Start. On 824ea699 a new four-seat run won Fire at v39, then the packaged host started Water and swapped at v2. The journal attributed both actions to the host, all 64 cells held functional jewels, and Emberglass still gave +5 HP over the same-level unequipped Coalwhisk. [Water after the swap](../../assets/review/wave-d4/combat/water-functional-coop-turn-720.webp). [PACKAGED_GAMEPLAY · Water admission](../../assets/review/wave-d4/combat/water-functional-coop-ready-720.webp)

The 137b8ff2 package produced populated Water screenshots for v1 and v2 in a 1280×720 run using runtime SHA-256 `7f349430774a4a2aa8127e11d6f4ebcea523687f0e93aa9a14a3cd64597a1d1c`. Its copied manifest named a different runtime; the observed inputs are recorded separately. A rerun with the binary named in that manifest rendered the v1 board and timed out awaiting the v2 swap while the peer socket repeatedly closed. Both outcomes are retained under `artifacts/wave-d4-session/functional-coop/water-137b8ff2/`.

A fresh 1280×720 packaged run on f50853e1 built the Linux player and Rust runtime from the same revision and passed both hash checks. Under the disposable cooperative fixture, Fire resumed at v3 and paid four rewards at victory v42. The packaged host started Water at v1 and swapped at v2 for 36 Mana. Coalwhisk had 191 max HP with the upgraded Core and its unequipped counterpart had 186. Three authenticated socket peers occupied the other seats. [Water after Start](../../assets/review/wave-d4/combat/water-functional-coop-start-720.webp) · [Water after the host swap](../../assets/review/wave-d4/combat/water-functional-coop-swap-f50853e1-720.webp)

The unpublished revision 4 candidate adds Stormcoil solo encounters and pins the Fire, Water and Stormcoil recruitment lists. In the level-1 native WSS campaign check on 7a6ae98e, the test account started with Dewskip and Quorion and no map clears. Settling both Fire encounters granted Coalwhisk. The Water Warden recovered after a process restart, and completing Water granted Ripplefin. Replaying Water regular awarded 50 coins and 150 EXP with no second recruit. Stormcoil admission returned 403 before the Water pair and accepted Start afterward. Both revision 3 and revision 4 passed 19 scenarios using the [campaign probe](../../scripts/solo-water-campaign-probe.mjs). The test used PostgreSQL, Nest and Rust with preset Pet ownership.

The normal 1280×720 Linux player on 6a100b61 admitted a level-1 Coalwhisk to Stormcoil regular using the unmodified revision 4 bundle on backend 6ab620e4. This run supplied prior Fire and Water clears. Start at v1 displayed 64 jewels. A legal swap advanced to v2 and granted Mana. The flat backdrop and actor placeholders are visible in the [Stormcoil gameplay capture](../../assets/review/wave-d4/combat/stormcoil-functional-regular-720.webp).

At ef30e7dd a separate native Stormcoil run supplied the prerequisite receipts and a level-20 team member. Two accounts cleared Stormcoil in opposite encounter orders and each recruited Zipspool once. Replacing the Admin configuration and restarting Nest and Rust preserved the active Warden match’s original board version, digest and payout. The durable map clear opened the Lantern prerequisite; At revision 4 Lantern had no solo encounter definition.

One fresh guest on ef30e7dd then completed all six encounters across Cinder, Tideglass and Stormcoil through authenticated Nest and native Rust play, with ordinary starter ownership and earned levels. Tideglass Warden fell on the first attempt at Clodkin level 19. The first Stormcoil Warden attempt left 24 Boss HP; one regular replay earned 180 EXP, and the second attempt won at level 28. PostgreSQL recorded one campaign recruit per map: Emberloom, Ripplefin and Zipspool. A second fresh guest on the same revision lost eight Tideglass Warden attempts despite five regular replays and growing from level 19 to 24. All eight reached phase two. The successful journey proves reachability; difficulty and repeatability remain open for owner and player review.

Revision 5 on fd5c6c12 adds Lantern, Ochre and Dawn regular and Warden encounters. The engine validated digest `f35e95bc62fc8791000fd2c6f996f931af337c477291d6148f2ce3f1da4c3847`. All 157 Pet Arena Rust tests passed. The PostgreSQL settlement suite passed 10 tests, including both encounter orders across six maps. Across 24 tactical seeds per encounter without gear or skill boosts, all three late regulars won 24/24; Warden wins were 24/24 for level-36 Clodkin in Lantern, 13/24 for level-23 Dewskip in Ochre, and 21/24 for level-46 Clodkin in Dawn. These are simulated battles at the stated levels.

On 4bae21f5, one new guest with three level-1 starters completed the revision 5 native solo campaign with all twelve first clears and six campaign recruits. Tideglass Warden took five attempts with four regular replays. A replacement publication during Lantern Warden followed by a Nest and Rust restart restored board version 2 and the original configuration digest. The final settlement recruited Gleamlet and left no next map. The [native campaign probe](../../scripts/solo-water-campaign-probe.mjs) recorded 73 scenarios and checked zero administrator ledger grants at entry and completion. An earlier run on 18265209 included a 5250-point cooperative grant. Packaged six-map play and human difficulty review remain open.

The previous four-account PACKAGED_GAMEPLAY run on d032a3b9 reached Fire victory at version 31 after restart, produced four award rows, and admitted all four to Water with the equipped Core at upgrade level 2. The local acceptance receipt is `artifacts/wave-d4-session/elemental-package-d032a3b9.json`. The historical security suite passed 21 files and 278 tests, with results in `artifacts/wave-d4-session/direct-session-security.log`.

Functional candidate B was also tested on held-out seeds 601–612 across six parties with the Rust example at ef7beab0. Under the tactical policy, the level-20 starter party with Core won Fire 11/12 and Water 0/12. The level-40 Ground and Icarus parties won Water 5/12 and 7/12 respectively. The 576-match study is retained under `artifacts/wave-d4-session/functional-board/confirmation-b/`. Balance selection and owner acceptance remain open.

## O. Wave D4 reference-driven production run

Rows use the same condition model as above. Previously passed rows tied to elemental tiles, 60-second timers or walkable battle are historical, not current acceptance.

| ID | Task | Condition | Status | Source and evidence | Remaining qualification |
| --- | --- | --- | --- | --- | --- |
| O-A01 | VL-210 | All five owner reference files located and hashed. | PASS | R01 f41ee523…, R02 eb6217df…, R03 1cad5126…, R04 c4f4874c…, R05 7326612a… (full SHA-256 in `assets/review/wave-d4/design-system` manifest) | Prefixes match the owner's copies. |
| O-A02 | VL-210 | Canonical visual design system established. | IN_PROGRESS | Icons, frames, fonts, localization catalog produced; Unity components pending | Unity worker hit provider quota; resumes after reset. |
| O-A04 | VL-210 | Reference-matched element icons. | IN_PROGRESS | Six active-element medallions, procedural reconstruction | Not pixel-exact; owner visual review pending. |
| O-A06 | VL-210 | Functional gem visual mapping prepared for review. | PASS | [Mapping sheet](../../assets/review/wave-d4/design-system/wave-d4-gem-mapping-and-ui-kit.webp) | Design candidate, not an approved gameplay change. |
| O-A07 | VL-210 | Reference-faithful gem atlas integrated. | IN_PROGRESS | FunctionalGems atlas replaced, same sprite layout | Unity import and render check not yet run. |
| O-A08 | VL-210 | Four currency icons match reference family. | IN_PROGRESS | Energy, diamond, coin, stone icons produced | Owner review pending. |
| O-B02 | VL-211 | Server-authoritative turn duration is 15 seconds. | IN_PROGRESS | c8698d6a · authenticated Nest/Rust solo fixture, PostgreSQL system receipt | The solo package displayed the countdown at 763461ac. The cooperative fixture at 660475d0 recovered the absolute 15-second deadline across restart. |
| O-B03 | VL-211 | End Turn works with the authorized action economy. | IN_PROGRESS | c8698d6a · native WSS EndTurn and a760eef5 · Unity action | At 763461ac a click on End Turn advanced the packaged Linux solo HUD from round 1 to 2. The cooperative fixture at 660475d0 rejected a wrong-seat pass without a journal write. Rendered four-seat input remains open. |
| O-B04 | VL-211 | Timeout advances without automated gameplay. | IN_PROGRESS | c8698d6a · PostgreSQL journal after Nest and Rust restart | At 660475d0 PostgreSQL recorded cooperative expiry before stale input. At 763461ac the idle packaged solo HUD advanced again to round 3, turn 2. Rendered four-seat expiry remains open. |
| O-B05 | VL-211 | No maximum-turn or maximum-round combat defeat. | IN_PROGRESS | 6402dd7d · v3 tests | v1/v2/functional-v1 unchanged. |
| O-B12 | VL-211 | x2 through x8 supported. | IN_PROGRESS | 6402dd7d · candidate bundle | x7/x8 thresholds are an unapproved candidate. |
| O-B18 | VL-203 | Historical rulesets remain recoverable. | IN_PROGRESS | 17beff1f · schema 3 solo restart, pinned reward and EndTurn rejection | Hosted CI pending. |
| O-B19 | VL-211 | New balance simulations executed. | IN_PROGRESS | 6402dd7d · initial 3,456 matches and 5213a1c7 follow-up | The unchanged baseline also lost all 2,592 composition holdout matches. Quartering both Warden HP and attack produced 1,635 wins on those seeds. Level-20 tactical starters still lost six of six Water battles in the two separate confirmation sets. Candidate publication and human balance review remain open. |
| O-J01 | VL-203 | PR90 aggregate failure resolved. | IN_PROGRESS | 6402dd7d · ci-capacity 898→902 | Four added tests identified; hosted CI pending. |
| O-F04 | VL-204 | Representative starter Pet assets advanced. | IN_PROGRESS | Blender 5.3 candidates: Coalwhisk, Dewskip, Clodkin | Coalwhisk and Cinder Warden each have four joints, four named clips and zero textures in the actual GLB. The private local stage verified both Blender/GLB/portrait sets. Reference-faithful production meshes and art approval remain open. |
| O-F09 | VL-206 | Fire background production candidate. | IN_PROGRESS | Gemini Neon High master 2730×1536 | Runtime JPG swapped; Unity render pending. |
| FLOW-01 | VL-184 | Account entitlement and credit costs verified. | PASS | Flow showed 1,050 credits, reset Dec 26. 720p 8s video: 24 credits (x1) | Watermark required in region. |
| FLOW-03 | VL-184 | Icarus introduction produced. | IN_PROGRESS | 8 s 720p h264 clip, 24 credits | Wings drift from folded to spread; face consistent in mid frames. Review pending; not accepted. |
| FLOW-04 | VL-184 | Icarus ultimate cinematic produced. | IN_PROGRESS | Second 24-credit generation submitted | First prompt risked extra wings; retry added a two-wing constraint. Not yet downloaded. |

Not yet started: remaining O-A to O-J and FLOW-02, 05..12 rows. Private cloud upload is NOT_RUN. Owner reviews are outstanding for art, balance and x7/x8.

## Campaign V3 acceptance

V3 identifiers below retain the owner's numbering. The prefix distinguishes them from the existing security and product gates. A passing historical receipt is scoped to its recorded build and configuration. Owner approval on 28 November covers the two exact R04 sheets and nine jewel roles. Numerical balance, media rights, H1–H4 and release have separate decisions.

| Gate | Canonical task | Condition | Status | Evidence or remaining check |
|---|---|---|---|---|
| V3-J01 | VL-210 | Exact nine owner-approved artworks located and hashed. | PASS | Both private R04 master hashes match the [provenance record](../media/hydrogen-production.md). |
| V3-J02 | VL-210 | Explicit owner visual approval recorded. | PASS | Owner approved the six-jewel and three-jewel sheets in the Campaign V3 directive. |
| V3-J03 | VL-210 | Nine individual transparent sprite assets verified. | PASS | eb7314d1 · independent exact pixel comparisons on nine transparent derivatives. |
| V3-J04 | VL-210 | Runtime atlas preserves artwork fidelity and compatible sprite identifiers. | PASS | 6fc183f4 · nine stable sprite identifiers, 396×396 extruded atlas from the approved masters. |
| V3-J05 | VL-210 | Jewels occupy the full usable square cell. | PASS | 6fc183f4 · source occupancy 96.9–98.4% in both axes. Native 720p and 1080p Fire captures at ec4b2cfe show full-cell sprites. |
| V3-J06 | VL-210 | No clipping, distortion, redundant borders or atlas bleeding. | IN_PROGRESS | ec4b2cfe · six basic jewels retain their silhouettes in both native Fire renders. Inspect the three advanced kinds under all multipliers. |
| V3-J07 | VL-210 | All 64 cells are visible and interactive. | PASS | e038a404 · PlayMode located all 64 real buttons and their 64 sprites across four viewport sizes. Actual 720p host swaps and reconnect preserved the full grid. |
| V3-J08 | VL-210 | Multiplier badges do not obscure jewel symbols. | PASS | e038a404 · PlayMode checked badge bounds above the glyph center and input-transparent labels at four viewport sizes. Actual compact corner badges are visible in both Fire screenshots. |
| V3-J09 | VL-210 | Actual 720p and 1080p packaged screenshots captured. | PASS | ec4b2cfe · actual [720p reconnect](../../assets/review/wave-d4/combat/fire-full-cell-r04-720.webp) and [1080p Fire board](../../assets/review/wave-d4/combat/fire-full-cell-r04-1080.webp). A manual lobby Enter click assisted the 1080p run. |
| V3-J10 | VL-210 | Higher-resolution visual checks executed where supported. | PASS | Unassisted Linux player at [1440p](../../assets/review/wave-d4/combat/fire-full-cell-r04-1440.webp) (1aae6433) and [4K](../../assets/review/wave-d4/combat/fire-full-cell-r04-2160.webp) (6404c50b). Both accepted a real host swap and restored the same 64-tile board after restart. |
| V3-J11 | VL-176 | Strike resolves normal attack correctly. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J12 | VL-176 | Mana restores individual Mana within its cap. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J13 | VL-176 | Rage restores individual Rage within its cap. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J14 | VL-176 | Vitality heals the correct eligible target. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J15 | VL-176 | Aegis applies bounded shield and duration. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J16 | VL-176 | Soul grants both Mana and Rage correctly. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J17 | VL-176 | Utility-only matches deal zero implicit normal damage. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J18 | VL-176 | Functional jewel identity remains independent of Pet element. | PASS | 9f0aecdd · identical_sword_matches_follow_the_six_pet_elements_against_each_warden and historical bundle digest/replay regressions. |
| V3-J19 | VL-176 | Six-kind default board remains compatible. | PASS | 9f0aecdd · identical_sword_matches_follow_the_six_pet_elements_against_each_warden and historical bundle digest/replay regressions. |
| V3-J20 | VL-176 | Nature cleanses eligible statuses deterministically. | PASS | 07d135ea · actual solo Nature WSS receipt removed one Vulnerability while preserving Guard for its normal duration. A subsequent Ghost impact on the same turn reapplied Vulnerability. |
| V3-J21 | VL-176 | Protected and non-cleansable effects remain intact. | PASS | 9f0aecdd · nature_groups_cleanse_only_eligible_slots_and_one_living_ally_without_healing checks stable status slots, excluded buff and defeated ally. |
| V3-J22 | VL-176 | Nature Match-3/4/5+ policies and solo fallback verified. | PASS | 54eb07f9 · targeted Rust solo regression passed for lines of three, four and five plus T, L and cross shapes. Exactly one group event and the expected number of cleanses per shape. |
| V3-J23 | VL-176 | Frost mitigation magnitude and consumption verified. | PASS | 9f0aecdd · frost_strongest_persists_until_one_committed_multi_target_impact checks unchanged target count and one-time reduction. |
| V3-J24 | VL-176 | Frost cannot skip enemy turns or alter committed targets. | PASS | 9f0aecdd · frost_strongest_persists_until_one_committed_multi_target_impact checks unchanged target count and one-time reduction. |
| V3-J25 | VL-176 | Frost cannot stack without bounds. | PASS | 9f0aecdd · frost_strongest_persists_until_one_committed_multi_target_impact checks unchanged target count and one-time reduction. |
| V3-J26 | VL-176 | Astral upgrades valid surviving jewel targets. | PASS | 07d135ea · level-one solo WSS, Astral receipt targeted cell 4. Re-reading confirmed the basic shield jewel at ×2 and omitted transient effects. |
| V3-J27 | VL-176 | Astral respects the unlocked tier and x8 cap. | PASS | 9f0aecdd · astral_uses_row_major_survivors_once_after_settling_and_obeys_current_ceiling verifies survivor order, eligible kinds and unlocked tier limit. |
| V3-J28 | VL-176 | Astral cannot recursively amplify itself. | PASS | 9f0aecdd · astral_uses_row_major_survivors_once_after_settling_and_obeys_current_ceiling verifies survivor order, eligible kinds and unlocked tier limit. |
| V3-J29 | VL-176 | No-target and resource-cap edge cases verified. | PASS | 9f0aecdd · focused advanced tests cover zero conversion on a full board, skill authority, deterministic opening groups, resource caps and unchanged historical generation. |
| V3-J30 | VL-176 | Advanced jewel generation works through authored skills or encounter configurations. | PASS | 9f0aecdd · focused advanced tests cover zero conversion on a full board, skill authority, deterministic opening groups, resource caps and unchanged historical generation. |
| V3-J31 | VL-176 | Default natural spawning remains limited to six basic kinds. | PASS | 9f0aecdd · focused advanced tests cover zero conversion on a full board, skill authority, deterministic opening groups, resource caps and unchanged historical generation. |
| V3-J32 | VL-176 | Advanced jewel availability and occupancy remain bounded. | PASS | 9f0aecdd · focused advanced tests cover zero conversion on a full board, skill authority, deterministic opening groups, resource caps and unchanged historical generation. |
| V3-J33 | VL-176 | Initial boards contain no pre-existing matches and have legal moves. | PASS | 9f0aecdd · initial_board_is_matchless_and_playable, swaps_require_bounds_adjacency_different_elements_and_a_new_match, gravity and dead-board recovery. |
| V3-J34 | VL-176 | Adjacent swap validation is correct. | PASS | 9f0aecdd · initial_board_is_matchless_and_playable, swaps_require_bounds_adjacency_different_elements_and_a_new_match, gravity and dead-board recovery. |
| V3-J35 | VL-176 | Match-3, Match-4 and Match-5 resolution verified. | PASS | 54eb07f9 · targeted Rust solo regression passed for lines of three, four and five plus T, L and cross shapes. Exactly one group event and the expected number of cleanses per shape. |
| V3-J36 | VL-176 | T, L and Cross matches deduplicate shared cells. | PASS | 54eb07f9 · targeted Rust solo regression passed for lines of three, four and five plus T, L and cross shapes. Exactly one group event and the expected number of cleanses per shape. |
| V3-J37 | VL-176 | Cascades, refill and dead-board recovery remain deterministic. | PASS | 9f0aecdd · initial_board_is_matchless_and_playable, swaps_require_bounds_adjacency_different_elements_and_a_new_match, gravity and dead-board recovery. |
| V3-J38 | VL-176 | Progressive x2–x8 tier behavior verified. | PASS | 9f0aecdd · timed uncapped rounds crossed 4,096 turns with x7/x8. Cascade cap regenerated after 16 passes. |
| V3-J39 | VL-176 | Damage and utility multiplier weights resolve correctly. | PASS | 9f0aecdd · functional_tile_effects_scale_only_their_authored_function and functional_utility_caps_and_shield_credit_hold_when_yields_exceed_capacity. |
| V3-J40 | VL-176 | No uncontrolled amplification or infinite cascade. | PASS | 9f0aecdd · timed uncapped rounds crossed 4,096 turns with x7/x8. Cascade cap regenerated after 16 passes. |
| V3-J41 | VL-210 | Authoritative 15-second countdown is correct. | PASS | 660475d0 timed WSS tests, 763461ac packaged solo pass/idle expiry, and e038a404 packaged co-op confirmed the 15-second turn and an authorized Water swap. |
| V3-J42 | VL-210 | EndTurn and timeout advance without free resources or automated actions. | PASS | 660475d0 timed WSS tests, 763461ac packaged solo pass/idle expiry, and e038a404 packaged co-op confirmed the 15-second turn and an authorized Water swap. |
| V3-J43 | VL-210 | Jewel VFX consume committed gameplay events. | PASS | 44cee53b · focused Unity PlayMode passed, including committed receipt routing, exact target, duplicate suppression, ×1/×2 travel and stationary reduced-motion cues. Full PlayMode 49 passed, 5 ignored. |
| V3-J44 | VL-210 | Damage, resources, healing and shielding match authoritative results. | IN_PROGRESS | 249bf827 · runtime receipt parity and all 82 arena library tests passed. Authoritative attack, heal, shield and attributable resource gains route to R04 sprites. Mixed capped gains have no unique source and are omitted. 44cee53b verifies target sprites and labels in PlayMode. Full packaged presentation checks remain. |
| V3-J45 | VL-210 | Cleanse, Chill and Amplify presentation match authoritative results. | IN_PROGRESS | Native WSS receipts now verify all three effects (21307eaf and 07d135ea). Packaged visual qualification of Nature and Astral remains open. |
| V3-J46 | VL-210 | Reduced motion and x1/x2 speed preserve gameplay semantics. | PASS | 44cee53b · focused Unity PlayMode passed, including committed receipt routing, exact target, duplicate suppression, ×1/×2 travel and stationary reduced-motion cues. Full PlayMode 49 passed, 5 ignored. |
| V3-J47 | VL-210 | Tooltips and localization explain all nine jewels. | PASS | e038a404 · the desktop PlayMode case verifies all 64 sprite bindings cycling nine roles and visible focus tooltip text. Nine names and descriptions are included in five locales in 6fc183f4. |
| V3-J48 | VL-210 | Reconnect restores jewel identities, multipliers and advanced effects. | PASS | 21307eaf · four-seat schema 5 WSS restored the Frost board, 150‰ Chill, deadline and pinned digest after replacement publication and restart. |
| V3-J49 | VL-203 | New gameplay capability and schema compatibility validated. | PASS | 9f0aecdd · engine regression suite and historical digest fixtures pass. Engine CLI accepted schemas 1–5 at 1f319c73; invalid candidates rejected in tests. |
| V3-J50 | VL-203 | Historical six-kind matches and replays remain unchanged. | PASS | 9f0aecdd · engine regression suite and historical digest fixtures pass. Engine CLI accepted schemas 1–5 at 1f319c73; invalid candidates rejected in tests. |
| V3-J51 | VL-203 | Identical inputs reproduce identical state and events. | PASS | 9f0aecdd · engine regression suite and historical digest fixtures pass. Engine CLI accepted schemas 1–5 at 1f319c73; invalid candidates rejected in tests. |
| V3-J52 | VL-203 | Restart restores exact board and status state. | PASS | 21307eaf · four-seat schema 5 WSS restored the Frost board, 150‰ Chill, deadline and pinned digest after replacement publication and restart. |
| V3-J53 | VL-203 | Active encounters retain their pinned configuration. | PASS | 21307eaf · four-seat schema 5 WSS restored the Frost board, 150‰ Chill, deadline and pinned digest after replacement publication and restart. |
| V3-J54 | VL-203 | Admin rejects unsupported jewel configurations. | PASS | 9f0aecdd · engine regression suite and historical digest fixtures pass. Engine CLI accepted schemas 1–5 at 1f319c73; invalid candidates rejected in tests. |
| V3-J55 | VL-203 | Duplicate, stale and unauthorized actions are rejected. | PASS | fda59517 · exact command replay on fresh WSS returned the sealed bytes after restart. Stale version and wrong-seat actions were rejected with codes 4 and 13. Receipts stayed at 2 and events at 7, outsider returned 403, and the correct active seat then advanced to v3. |
| V3-J56 | VL-203 | Reward settlement remains exactly-once. | PASS | 660475d0 · concurrent and repeated settlement across Nest restart; four seats paid once. |
| V3-J57 | VL-203 | No unauthorized production configuration publication occurs. | PASS | 9822cd51 · private migration and publication tests use disposable databases; source migration creates no published candidate. |
| V3-J58 | VL-211 | Six-kind baseline reproduced. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-J59 | VL-211 | Advanced-jewel variants simulated. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-J60 | VL-211 | Multiple compositions, levels and loadouts evaluated. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-J61 | VL-211 | Legal move availability and dead-board rates measured. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-J62 | VL-211 | Resource generation and survivability measured. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-J63 | VL-211 | Advanced mechanic utilization and exploit risks evaluated. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-J64 | VL-211 | Held-out seed validation completed. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-J65 | VL-211 | Owner balance decision package prepared. | PASS | 9f0aecdd · 19,680 matches, disjoint discovery and holdout seeds. See the Campaign V3 balance decision package in this ledger. Numerical publication awaits owner decision. |
| V3-P01 | VL-203 | Current integration PRs and CI reconciled. | PASS | f6ddd3d8 · PR 90 inspected. Core lint and shard 1 failed. Corrective source 55252788 awaits hosted checks. |
| V3-P02 | VL-203 | Combat v3 cross-layer integration advanced and verified. | PASS | 660475d0 · authenticated timed co-op and durable per-seat settlement. |
| V3-P03 | VL-204 | Icarus production advanced through the next authorized gate. | OWNER_REVIEW_REQUIRED | Icarus H1 face and hair review is open. |
| V3-P04 | VL-205 | Representative starter Pet and Fire Boss production advanced. | IN_PROGRESS | Existing Coalwhisk and Cinder Warden candidates are private. Reference-faithful models await admission. |
| V3-P05 | VL-206 | Production battle UI and environment improvements verified. | IN_PROGRESS | ec4b2cfe · full-cell Fire board rendered at 720p and 1080p. Both combatants still use blockout models. |
| V3-P06 | VL-171 | Cinematic infrastructure advanced using canonical assets or labeled test fixtures. | PASS | 8c252e59 · direct Editor 5/5. Saved and reloaded four Timeline presets animate only the bound synthetic model; reused assets and rebind survive removal of the scene director. Timeline 1.8.12 is installed. Cinemachine/Recorder remain metadata-only candidates. Canonical Icarus footage awaits H1. |
| V3-P07 | VL-208 | Wallet, progression and Admin work advanced. | PASS | 2f208d0c · combined operator build, 16 focused tests, 12 DB proxy cases and four desktop/mobile browser journeys. |
| V3-P08 | VL-170 | Private asset delivery and retrieval advanced where authorized. | BLOCKED | Private staging receipts exist; authorized remote target and independent retrieval receipt remain open. |
| V3-P09 | VL-106 | Audio and localization improvements verified. | IN_PROGRESS | 6fc183f4 · localized all nine jewels in five locales, with Chill coverage. Production audio review remains open. |
| V3-P10 | VL-210 | Additional eligible campaign work completed without duplicating earlier work. | PASS | ec4b2cfe · new schema 5 publication/restart WSS probe and disjoint 19,680-match comparison both completed. |
| V3-Q01 | VL-212 | Focused Rust and TypeScript regression suites pass. | PASS | 249bf827 · 82 arena library tests plus scoped Rust runtime and attribution checks. 37 TypeScript unit tests at 9822cd51 and 21 admission cases at ddfaa240. |
| V3-Q02 | VL-212 | PostgreSQL integration and historical migration checks pass. | PASS | 9822cd51 · 20 integration cases and both archived migration probes passed in disposable PostgreSQL databases. |
| V3-Q03 | VL-212 | Unity EditMode and PlayMode checks pass. | PASS | e038a404 · 95/95 EditMode, 48 PlayMode passed and two skipped. Includes five Cinematic Studio cases and native receipt decoding. |
| V3-Q04 | VL-212 | Actual packaged solo gameplay verified. | PASS | 1aae6433 · actual Linux guest, Coalwhisk, Fire regular. Recorded [round 3 at 4 seconds](../../assets/review/wave-d4/combat/fire-solo-full-cell-timed-720.webp), followed by round 5 with no further input. End Turn was submitted; the intermediate command receipt was not individually retained. |
| V3-Q05 | VL-212 | Four authenticated cooperative seats verified. | PASS | 660475d0 · four authenticated WSS seats; e9aacee9 · one Linux player and three authenticated peers. |
| V3-Q06 | VL-212 | Advanced jewel effects verified in packaged gameplay when enabled in an experimental configuration. | IN_PROGRESS | e038a404 · packaged host matched three Frost jewels in Water v2. Immutable receipts and the [720p board](../../assets/review/wave-d4/combat/water-full-cell-frost-swap-720.webp) confirm 150‰ Chill. Nature and Astral have authenticated solo WSS receipts; their packaged effects remain open. |
| V3-Q07 | VL-212 | Fire victory, reward settlement and Water admission verified. | PASS | e038a404 · unassisted packaged Fire victory at version 25, four reward rows, upgraded Core and Water admission followed by host Frost swap v2. |
| V3-Q08 | VL-212 | Performance and memory measurements recorded. | PASS | Successful unassisted Linux runs measured via procfs at 720p, 1440p and 4K. See the native player measurements below. |
| V3-Q09 | VL-212 | Independent security and compatibility review completed. | PASS | Independent source review of 249bf827 and e038a404 found no blocking regression in receipt bounds, scope, admission renewal or replay. Review confirmed actor authentication, version and epoch guard before intent creation, and retention of the pending command identifier. The four-seat WSS result covers server behavior. |
| V3-Q10 | VL-212 | Required exact-source hosted CI passes. | IN_PROGRESS | PR 90 failed at f6ddd3d8. Verify the final integrated revision before merge. |
| V3-Q11 | VL-212 | Canonical backlog and acceptance ledger updated. | PASS | Campaign V3 verification entries in config/development-plan.json and this 87-gate ledger. |
| V3-Q12 | VL-212 | Durable resumable campaign checkpoint recorded. | PASS | SQLite run master-campaign-v3 recovers isolated ownership and pending work. |

### Native player measurements

The sampler read the Unity player process every 250 ms through Linux procfs. Wall time includes scripted navigation and OCR. Some runs overlapped other local tests. Frame times, GPU utilization and four-human play were outside these measurements.

| Completed run | Elapsed | CPU seconds | Peak RSS | Verified interaction |
|---|---:|---:|---:|---|
| 1280×720 · e038a404 | 152.320 s | 64.32 | 526.9 MiB | One packaged host and three authenticated peers. Fire win v25, four settled rewards, Water Frost swap v2 and 150‰ Chill. |
| 2560×1440 · 1aae6433 | 117.042 s | 52.86 | 455.7 MiB | Normal host Start, legal swap v2 and restart with the same board and fresh host admission. |
| 3840×2160 · 6404c50b | 122.768 s | 57.16 | 504.5 MiB | All 64 tiles rendered, 9 multiplied tiles, host swap v2, restart at v3 and same restored board. |

The passing receipts are `artifacts/packaged-coop-runs/run-3O68e2sy/acceptance.json`, `artifacts/campaign-v3/work/packaged-board-smoke/artifacts/packaged-coop-runs/run-RIWDKdKC/board-acceptance.json`, and `artifacts/packaged-coop-runs/run-KkhkeFl8/board-acceptance.json`.

Earlier attempts at 4584d95f exposed the admission renewal, high-resolution layout and lobby control problems repaired before these runs.

| Native output | Elapsed | CPU seconds | Peak RSS | Last verified interaction |
|---|---:|---:|---:|---|
| 1280×720 | 271.202 s | 115.75 | 573.1 MiB | Fire won at v41, four rewards, three Frost jewels in Water at v1. The observer reached v2 without the required Frost swap. |
| 2560×1440 | 115.808 s | 53.99 | 476.7 MiB | Native Fire admission. A recursive UI layout diagnostic opened the development console over Start. |
| 3840×2160 | 84.075 s | 40.27 | 512.7 MiB | The lobby showed one seat while the backend had three authenticated peers ready. |

Raw sampler records and attempt logs are in `artifacts/packaged-coop-runs/run-PUcW8J9p/` and `artifacts/campaign-v3/work/packaged-board-smoke/artifacts/packaged-coop-runs/{run-vJ8eO9b1,run-FvgZLb4s}/`.

## Campaign V4 acceptance

The owner decisions apply to future schema 6 allocations. Previous rulesets retain their original digests and replay semantics. The active campaign uses the [roster and route draft](../pet-arena/campaign-v4-content.md).

| Gate | Task | Acceptance | Status | Evidence and outstanding work |
|---|---|---|---|---|
| V4-R01 | VL-203 | Current Git, PR, CI and checkpoint state reconciled. | PASS | V3 checkpoint 22 recovered. PRs 88 and 89 are ancestors of PR90. PR91 owns migration 0067 and remains separate. PR90 runtime image navigation repair 17085eda has 14 passing focused checks. Schema 5 evidence stays historical. |
| V4-R02 | VL-203 | Existing worktree ownership preserved. | PASS | V3 checkpoint 22 recovered. PRs 88 and 89 are ancestors of PR90. PR91 owns migration 0067 and remains separate. PR90 runtime image navigation repair 17085eda has 14 passing focused checks. Schema 5 evidence stays historical. |
| V4-R03 | VL-203 | V3 open technical evidence reconciled. | PASS | V3 checkpoint 22 recovered. PRs 88 and 89 are ancestors of PR90. PR91 owns migration 0067 and remains separate. PR90 runtime image navigation repair 17085eda has 14 passing focused checks. Schema 5 evidence stays historical. |
| V4-R04 | VL-203 | Superseded six-kind and conversion assumptions identified. | PASS | V3 checkpoint 22 recovered. PRs 88 and 89 are ancestors of PR90. PR91 owns migration 0067 and remains separate. PR90 runtime image navigation repair 17085eda has 14 passing focused checks. Schema 5 evidence stays historical. |
| V4-R05 | VL-203 | Historical schemas, migrations, digests and replays preserved. | PASS | Migration 0071 preserves immutable solo pins and historical checksums. Both archived API migration probes passed at 50cfa7fa. PostgreSQL settlement and publication 30/30 at 66af0a44. |
| V4-R06 | VL-203 | Independent integration review completed. | PASS | Independent reviewer found a schema-6 UI capability limit, incomplete Admin metadata and mutable turn duration. Fixed in 787d4142, 66af0a44 and 5384c164; historical capabilities retain their existing contracts. Scope is source review and local qualification. |
| V4-J01 | VL-210 | All nine approved artwork masters and sprites preserved. | PASS | R04 sheets, sprite IDs, atlas and full-cell sizing retained byte-for-byte from 5a30ff82. Both advanced versions render in 787d4142 EditMode. |
| V4-J02 | VL-210 | All nine kinds naturally spawn. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J03 | VL-210 | No active Pet-specific jewel creation. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J04 | VL-210 | No active skill-specific jewel conversion. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J05 | VL-210 | No forced encounter-specific advanced opening groups. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J06 | VL-210 | No rarity-dependent, element-dependent or spending-dependent RNG. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J07 | VL-210 | Shared spawn distribution editable through Admin. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-J08 | VL-210 | Board RNG deterministic and authoritative. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J09 | VL-210 | Combat RNG does not introduce unintended Pet-specific spawn bias. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J10 | VL-210 | Board always initializes with legal moves and no starting matches. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J11 | VL-210 | Match-3/4/5 and crossed formations verified. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J12 | VL-210 | Cascades and recovery remain bounded. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J13 | VL-210 | All six basic jewel effects verified. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J14 | VL-210 | Nature verified in actual packaged gameplay. | IN_PROGRESS | a65b0107 · Actual 720p host saw all nine natural kinds. This run attached Sword damage 461 after the host swap. A committed Nature cleanse with a removable status and visible feedback still requires evidence. |
| V4-J15 | VL-210 | Frost verified in actual packaged gameplay. | IN_PROGRESS | a65b0107 · Frost appeared on the actual natural board. Shared-RNG packaged Chill feedback still requires a committed match, separately from historical Frost captures. |
| V4-J16 | VL-210 | Astral verified in actual packaged gameplay. | IN_PROGRESS | a65b0107 · Astral appeared on the actual natural board. Shared-RNG packaged amplification still requires visible feedback for a committed match. |
| V4-J17 | VL-210 | Progressive multiplier tiers and caps verified. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-J18 | VL-210 | All nine jewels retain full-cell presentation. | PASS | R04 sheets, sprite IDs, atlas and full-cell sizing retained byte-for-byte from 5a30ff82. Both advanced versions render in 787d4142 EditMode. |
| V4-J19 | VL-210 | No clipping, texture bleeding or unreadable multiplier labels. | IN_PROGRESS | V3 packaged captures and Frost qualify the historical capability. Shared RNG requires its own packaged evidence. Four independent packaged processes remain to qualify. |
| V4-J20 | VL-210 | Actual packaged resolution and accessibility checks recorded. | PASS | Actual shared board resolutions verified: 1280x720, 1920x1080, 2560x1440, 3840x2160. 787d4142 verifies reduced motion, speed semantics and versioned HUD cues in Editor. |
| V4-E01 | VL-211 | All six same-element coefficients equal 100%. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-E02 | VL-211 | All 36 matchups validated. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-E03 | VL-211 | Ordinary matchup design no longer creates unintended permanent immunity. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-E04 | VL-211 | Previous mirror-immunity unresolved cases reevaluated. | PASS | 578944f5 exact prior 4001/5001 seed groups: all 245 previously unresolved observations covered. The 134 groups contained 268 seed outcomes, all losses and zero unresolved; repeated historical variants share 10 unique input groups. |
| V4-E05 | VL-211 | Damage calculations retain defense, critical and effect semantics. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-E06 | VL-211 | Complete matrix managed through Admin. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-E07 | VL-211 | Historical configurations retain original behavior. | PASS | Migration 0071 preserves immutable solo pins and historical checksums. Both archived API migration probes passed at 50cfa7fa. PostgreSQL settlement and publication 30/30 at 66af0a44. |
| V4-B01 | VL-211 | Boss statistics are explicit authored configuration. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-B02 | VL-211 | The same Boss encounter does not weaken automatically for solo. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-B03 | VL-211 | Early solo-oriented encounters are appropriately accessible. | PASS | 9c742fa6 · Authoritative schema 6 regular encounters in all six regions. Three unequipped starters at levels 1 and 10 won 528/576 across four policies and two disjoint seed pairs. Each starter won at least 13/16 per region and level. All 48 defeats were party wipes. |
| V4-B04 | VL-211 | High-tier encounters favor strong cooperative parties. | PASS | ddfe5dbd · Fixed quarter-HP and one additional telegraph turn at every party size. Two four-seed cohorts produced 14/192 and 6/192 co-op wins, collectively across all six Wardens, and 0/672 and 1/672 solo wins. Vitality-only controls had zero wins in these cohorts. Distinct config digests affect natural boards. Rust validated schema 6 study digest 349adf3a…. The optional schema 7 Admin draft at 063a94e4 validated with digest 96aa5285…; all 48 routes and regular profiles were unchanged. Starter and level-40 controls had four total co-op wins over 288 cases and zero solo wins. Draft remains unpublished. |
| V4-B05 | VL-211 | Legitimate powerful-solo victories remain possible. | PASS | One-seat authenticated allocation plus a near-victory Rust reducer regression verifies an ordinary won settlement for one legitimate participant. Difficulty statistics are reported independently. |
| V4-B06 | VL-211 | Limited S does not guarantee victory. | PASS | Held separate from starter cohorts: 1,584 additional single- and four-seat high-tier simulations, including Icarus; zero wins in this sample. |
| V4-B07 | VL-211 | Boss HP, attack, defense and phases are Admin-configurable. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-B08 | VL-211 | No artificial adaptive-difficulty or favorable RNG assistance. | PASS | Schema 6 Rust rules and candidate. Shared spawn, three board paths, all 36 matchups, zero and diagonal negatives, independent combat entropy and fixed Warden are covered in crates/aetheria-pet-arena/src/arena8/coop/tests/shared_rng.rs and the arena8 regression suite. |
| V4-B09 | VL-211 | Boss and collectible Pet statistics remain separate. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-B10 | VL-211 | Difficulty study covers levels, loadouts, party sizes and policies. | PASS | 578944f5 · 4,032 starter-distribution matches plus 1,584 geared, trained and Limited S cases across one and four seats. Three seeds per high-tier scenario; results are a candidate baseline, not a publication decision. |
| V4-M01 | VL-202 | Six canonical maps preserved. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-M02 | VL-202 | All six Dragons assigned to correct maps. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-M03 | VL-202 | All six Birds assigned to correct maps. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-M04 | VL-202 | All 48 map-based Pet identities represented. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-M05 | VL-202 | Rarity-appropriate progression authored. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-M06 | VL-202 | Solo-oriented and cooperative-oriented encounters distinguished. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-M07 | VL-202 | Recruitment and acquisition routes validated. | PASS | a8e19d53 · 48 authored profiles pass engine validation. Actual solo and four-seat WSS won both phases of Coalwhisk and Emberloom, unlocked prerequisite, recruited Emberloom and preserved exact retry payouts. The two co-op entries used a disposable mode override. Six-region traversal is a separate breadth check. |
| V4-M08 | VL-202 | High-tier acquisition cannot bypass encounter eligibility. | PASS | 900431e9 · Disposable PostgreSQL passed four draft and twenty settlement cases. Pin and prerequisite checks govern allocation and settlement, existing ownership survives, route clears and grants are transactional and idempotent. These database cases used fixture terminal journals. |
| V4-M09 | VL-202 | Existing earned ownership preserved. | PASS | 900431e9 · Disposable PostgreSQL passed four draft and twenty settlement cases. Pin and prerequisite checks govern allocation and settlement, existing ownership survives, route clears and grants are transactional and idempotent. These database cases used fixture terminal journals. |
| V4-M10 | VL-202 | Rewards settle exactly once. | PASS | 900431e9 · Disposable PostgreSQL passed four draft and twenty settlement cases. Pin and prerequisite checks govern allocation and settlement, existing ownership survives, route clears and grants are transactional and idempotent. These database cases used fixture terminal journals. |
| V4-P01 | VL-202 | All 61 stable identities accounted for. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-P02 | VL-202 | Six additional Standard S identities have development assignments. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-P03 | VL-202 | Gameplay bindings expanded without duplicate IDs. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-P04 | VL-202 | Existing 221 abilities preserved unless explicitly reconciled. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-P05 | VL-202 | Actual final ability count recorded. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-P06 | VL-202 | Pet progression and Artifact compatibility validated. | PASS | f780250a · Rust allocated all 61 Pets at level 1 and 100. Each Pet received all seven artifacts at its authored unlock level, at ranks 1–5 (2,135 eligible combinations). Below-threshold allocations failed for every gated definition. |
| V4-P07 | VL-202 | New content has acquisition and release gates. | PASS | 656adc15 composes six gated kits and 48 ordered map opponents across the six elemental maps. Candidate has 61 unique Pets and 245 bound abilities. Five positive and negative authoring tests passed. Separate collectible and encounter stat records. |
| V4-P08 | VL-202 | Asset and localization coverage tracked per identity. | PASS | 61-identity inventory joins stable IDs, actual reference availability and stages, rig assignment and individual locale coverage. New kits have EN, VI, JA, KO and ZH names. Tracking does not confer art qualification. |
| V4-A01 | VL-192 | Pet statistics and growth editable. | PASS | a97cc95a · Chromium, disposable PostgreSQL and Rust. Operator edited Icarus critical attributes and growth, Frost limit and first-clear coins, corrected a rejected mirror value in the same draft, published, rolled back and verified audit and pinned digests. Reward coverage is the supported Warden policy. |
| V4-A02 | VL-192 | Boss statistics and phases editable. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-A03 | VL-192 | Nine-kind spawn distribution editable. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-A04 | VL-192 | Supported jewel effects and limits editable. | PASS | a97cc95a · Chromium, disposable PostgreSQL and Rust. Operator edited Icarus critical attributes and growth, Frost limit and first-clear coins, corrected a rejected mirror value in the same draft, published, rolled back and verified audit and pinned digests. Reward coverage is the supported Warden policy. |
| V4-A05 | VL-192 | Element matrix editable. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-A06 | VL-192 | Map progression and recruitment editable. | PASS | 5da701bd · Chromium and disposable PostgreSQL covered 48 routes, cyclic rejection (422), profile, host threshold, recruitment and mode edits, publication, fresh operator MFA, rollback (200), active pointer and immutable audit history. |
| V4-A07 | VL-192 | Economy and reward policies validated. | PASS | a97cc95a · Chromium, disposable PostgreSQL and Rust. Operator edited Icarus critical attributes and growth, Frost limit and first-clear coins, corrected a rejected mirror value in the same draft, published, rolled back and verified audit and pinned digests. Reward coverage is the supported Warden policy. |
| V4-A08 | VL-192 | Draft comparison and validation work. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-A09 | VL-192 | Simulation uses exact candidate configuration. | PASS | Balance example loaded the specified immutable source candidate and each weight variant and recorded contentDigest per row. See comparison below. |
| V4-A10 | VL-192 | Publication and rollback are auditable. | PASS | a97cc95a · Chromium, disposable PostgreSQL and Rust. Operator edited Icarus critical attributes and growth, Frost limit and first-clear coins, corrected a rejected mirror value in the same draft, published, rolled back and verified audit and pinned digests. Reward coverage is the supported Warden policy. |
| V4-A11 | VL-192 | Active matches retain pinned configuration. | PASS | 973c55a6 · After a replacement publication and restart, four-seat authenticated WSS restored the original digest, 64 cells, absolute deadline and byte-identical receipt. Replay kept two receipts and three events; the next seat then committed. |
| V4-A12 | VL-192 | Unauthorized operators and invalid values rejected. | PASS | f9e5b780 · real Chromium, Nest/PostgreSQL and Rust. Unauthenticated visitor denied 401; invalid mirror 99% rejected 422. Same draft corrected to 100%, Nature weight 501, Fire→Water 60% and Warden ATK +1 validated and published. Prior digest remained intact. Full existing historical phase controls retained. |
| V4-ART01 | VL-205 | Existing source references recovered. | PASS | Opened actual Charakuru Icarus Motion preview; 16,892,316-byte export matches Unity Source/Icarus.vrm by SHA-256 f1d2b65d…e0286a. Existing product provides the development baseline. Separate H1 R3 study receipt and all 17 hashes retained; approval applies only if adopting that revision. |
| V4-ART02 | VL-205 | Icarus next H-gate evidence prepared. | PASS | 10989bab · OpenGLCore neutral face and walk frames from the original Charakuru VRM. 54 mapped bones, 11 skinned meshes, 36.4 degrees maximum measured motion. 5bdf49ce rotated each original eye bone by 10 degrees in Unity. Baked skin moved 84 vertices (2.10 mm maximum) on the left and 92 (2.70 mm) on the right. All 18 expression presets lack bindings. Shader-link errors recorded. Owner review remains required for revisions. |
| V4-ART03 | VL-205 | No Icarus owner gate bypassed. | PASS | Opened actual Charakuru Icarus Motion preview; 16,892,316-byte export matches Unity Source/Icarus.vrm by SHA-256 f1d2b65d…e0286a. Existing product provides the development baseline. Separate H1 R3 study receipt and all 17 hashes retained; approval applies only if adopting that revision. |
| V4-ART04 | VL-205 | Standard Pet benchmark advanced. | PASS | 33bb547a · The actual retained Coalwhisk GLB imported with UniGLTF in Unity 6000.3.14f1. Four joints, 10,272 triangles, three URP/Lit slots and four deforming source clips at nine samples per clip. Prototype still needs textured material and owner review. |
| V4-ART05 | VL-205 | Dragon benchmark advanced. | PASS | Tripo Smart Mesh P2.0 job b6c5ecd7-1e38-4fdf-b410-25df2fdc5886 used the verified dragon-fire-ignivar concept, Sharing Only, 100 credits. Downloaded GLB has 11,016 triangles, no UVs, textures, skin or animation. Owner approved the silhouette. A separate 40-credit segment operation produced 38 mesh parts. The 132a40c9 Blender derivative restores all 11,016 oriented faces, includes verified UVs and matches five silhouette masks. Materials and rig pending. |
| V4-ART06 | VL-205 | Bird benchmark advanced. | PASS | Tripo Smart Mesh P2.0 job 8da4fae5-9f09-49ca-a5cc-378cbdf0bd00 used the verified bird-fire-cinderquill concept, Sharing Only, 100 credits. Downloaded GLB has 8,386 triangles, no UVs, textures, skin or animation. Owner approved the silhouette. A separate 40-credit segment operation produced 25 mesh parts. The 132a40c9 Blender derivative restores all 8,386 oriented faces, includes verified UVs and matches five silhouette masks. Materials and rig pending. |
| V4-ART07 | VL-205 | Boss benchmark advanced. | PASS | 33bb547a · The retained Cinder Terraces Warden prototype imported in the real Editor. Four joints, 5,504 triangles, three URP/Lit slots, and four deforming source clips. No texture subassets. Production art acceptance remains pending. |
| V4-ART08 | VL-205 | Reusable morphology and rig profiles validated. | IN_PROGRESS | Starter and Warden private rig prototypes exist. Canonical Dragon and Bird references and rig assignments recovered. Detailed production meshes, deformation, independent art review and Unity admission remain. |
| V4-ART09 | VL-205 | Production geometry and textures inspected. | IN_PROGRESS | Tripo GLB imports in Blender 5.3 show 79 boundary edges on Ignivar and 2,689 on Cinderquill. Both have no UVs or textures. Owner retained both silhouettes for mesh processing. 9d824f91 · Actual private GLB reimport, four isolated actions, five mesh samples per action for Coalwhisk and Cinder Warden. Both deform. Prototype geometry and materials still need production review. |
| V4-ART10 | VL-205 | Animation and deformation evidence retained. | PASS | 9d824f91 · Blender 5.3 retained 20 rendered samples per model plus mesh displacement measurements across Idle, Hit, Attack and Skill for the two available skinned prototypes. Bird and Dragon qualification remains open under ART05 and ART06. |
| V4-ART11 | VL-205 | Unity admission distinguished from candidate assets. | PASS | 33bb547a · Actual Editor report classifies Coalwhisk and the Warden as DEVELOPMENT_PROTOTYPE_IMPORT. The generated untextured Dragon and Bird exports are tracked as separate source candidates outside Unity. Owner approved both silhouettes for mesh processing on 2026-11-28. Production and rights approval remain pending. |
| V4-ART12 | VL-205 | All 61 identities have accurate production-stage tracking. | PASS | 61-identity inventory joins stable IDs, actual reference availability and stages, rig assignment and individual locale coverage. New kits have EN, VI, JA, KO and ZH names. Tracking does not confer art qualification. |
| V4-C01 | VL-206 | Existing Timeline presets recovered and verified. | PASS | 787d4142 direct EditMode 101/101. Eight model-bound Timeline presets, including Boss intro, phase transition, victory and defeat, tested with private animation fixtures. |
| V4-C02 | VL-206 | Cinemachine integration qualified where applicable. | PASS | 7c1c364f · Original Charakuru model and walk sampled by the active Cinemachine full-body camera in Unity 6000.3.14f1 with Cinemachine 3.1.8. 30 distinct frame files retained, hip travel 0.032 m and angular range 17.37 degrees. |
| V4-C03 | VL-206 | Recorder workflow qualified where applicable. | PASS | fbeb2b46 · The original VRM and walk, real bow and wings, and Cinemachine camera produced 30 actual 720×720 frames at 24 fps. Dedicated Recorder exited 0. Bow and wings appeared for 25 samples. Maximum clipped white 0.412%, minimum foreground 10.02%. |
| V4-C04 | VL-206 | Model-bound intro workflow verified. | PASS | 787d4142 tested eight model-bound Timeline presets. At a9a3625a the existing Icarus VRM and private Charakuru walk were exercised in the actual modular prefab: 54 mapped bones, 11 skinned meshes, 36.40 degrees maximum joint rotation and 0.4874 m skin displacement. |
| V4-C05 | VL-206 | Model-bound skill showcase verified. | PASS | 787d4142 direct EditMode 101/101. Eight model-bound Timeline presets, including Boss intro, phase transition, victory and defeat, tested with private animation fixtures. |
| V4-C06 | VL-206 | Ultimate presentation preserves server authority. | IN_PROGRESS | Timeline installed. Cinemachine and Recorder remain unqualified. Existing five-language jewel text, timed authority and media provenance retained. Production model footage, audio and rights review remain. |
| V4-C07 | VL-206 | Boss intro and phase presentation advanced. | PASS | 787d4142 direct EditMode 101/101. Eight model-bound Timeline presets, including Boss intro, phase transition, victory and defeat, tested with private animation fixtures. |
| V4-C08 | VL-206 | Audio and five-language localization advanced. | IN_PROGRESS | 9d017162 covers EN, VI, JA, KO and ZH room status, seats, host and prerequisites. Generated font validation found no missing catalog glyphs in any language. Audio EditMode at 4884f818 passed six of nine in the warm project; the library and prefab failed to load. Native UI and clean audio checks remain. |
| V4-C09 | VL-206 | Rights and media provenance accurately recorded. | PASS | Original Charakuru motion and local VRM, private accessory manifest and eight locally synthesized score auditions are traced to source hashes. All eight audio hashes matched the composer manifests. Listening, commercial rights and publication remain owner gates. |
| V4-D01 | VL-170 | Existing Cloudflare resources inspected. | PASS | Authorized Chrome DevTools session and Wrangler verified public R2 reference bucket, deployed portal/admin Workers and Northflank default project backend/frontend. Running backend shows source 599f121a. Image digest was unavailable. |
| V4-D02 | VL-170 | Existing Northflank services inspected. | PASS | Authorized Chrome DevTools session and Wrangler verified public R2 reference bucket, deployed portal/admin Workers and Northflank default project backend/frontend. Running backend shows source 599f121a. Image digest was unavailable. |
| V4-D03 | VL-170 | Authorized staging destination identified. | BLOCKED | Owner confirms main deploys directly to production and no staging exists. No staging deployment, private upload, cluster restart or staging browser run. Source and local isolated service qualification proceed independently. |
| V4-D04 | VL-170 | Private and public asset access separated. | IN_PROGRESS | A disposable loopback MinIO fixture returned 403 for an anonymous private GET and 200 for an anonymous public GET. Authenticated private read matched SHA-256. The live R2 bucket serves the public CDN. A private hosted destination is pending. |
| V4-D05 | VL-170 | Asset manifests and checksums validated. | PASS | 31 local private files (6,094,890 bytes) staged and independently verified against manifest SHA-256 d5fd006dc30e9b2eb0304ff3d70a820c3b79c1d47f64395772d14bccb5732654. Public delivery and private deployment have separate gates. |
| V4-D06 | VL-170 | Authorized asset upload independently retrieved and verified. | BLOCKED | Owner confirms main deploys directly to production and no staging exists. No staging deployment, private upload, cluster restart or staging browser run. Source and local isolated service qualification proceed independently. |
| V4-D07 | VL-170 | Deployment source and image revision recorded. | BLOCKED | Owner confirms main deploys directly to production and no staging exists. No staging deployment, private upload, cluster restart or staging browser run. Source and local isolated service qualification proceed independently. |
| V4-D08 | VL-170 | Database migration and service health verified. | BLOCKED | Owner confirms main deploys directly to production and no staging exists. No staging deployment, private upload, cluster restart or staging browser run. Source and local isolated service qualification proceed independently. |
| V4-D09 | VL-170 | Actual browser and Admin smoke tests executed. | BLOCKED | Owner confirms main deploys directly to production and no staging exists. No staging deployment, private upload, cluster restart or staging browser run. Source and local isolated service qualification proceed independently. |
| V4-D10 | VL-170 | Runtime restart and rollback procedure qualified. | BLOCKED | Owner confirms main deploys directly to production and no staging exists. No staging deployment, private upload, cluster restart or staging browser run. Source and local isolated service qualification proceed independently. |
| V4-D11 | VL-170 | Secrets and access controls preserved. | IN_PROGRESS | 15c8bb04 · All 16 private-delivery governance cases passed, including secret suppression, authenticated readback and rejection of public delivery settings. Disposable MinIO verified anonymous private 403 and public 200. Hosted staging policy and deployment verification remain. |
| V4-D12 | VL-170 | Public release remains disabled. | PASS | Existing registration and release flags retained; no production mutation, registration opening or cloud deployment. |
| V4-Q01 | VL-212 | Rust focused and required regression tests pass. | PASS | Unity 787d4142 EditMode 101/101, PlayMode 49 passed, 2 ignored. Three real-process fixtures excluded by wrapper; two Wave1 cases require disposable DB. Rust, contracts and API execution logs in artifacts/campaign-v4. |
| V4-Q02 | VL-212 | TypeScript and contract tests pass. | PASS | Unity 787d4142 EditMode 101/101, PlayMode 49 passed, 2 ignored. Three real-process fixtures excluded by wrapper; two Wave1 cases require disposable DB. Rust, contracts and API execution logs in artifacts/campaign-v4. |
| V4-Q03 | VL-212 | PostgreSQL integration and migration checks pass. | PASS | ed93788f · Native-game and admission historical rollback compatibility passed against both archived inputs through 72 migrations ending in 0073. Disposable PostgreSQL draft and settlement checks previously passed 24/24. |
| V4-Q04 | VL-212 | Historical native recovery and replay checks pass. | PASS | 973c55a6 · After a replacement publication and restart, four-seat authenticated WSS restored the original digest, 64 cells, absolute deadline and byte-identical receipt. Replay kept two receipts and three events; the next seat then committed. |
| V4-Q05 | VL-212 | Unity EditMode and PlayMode results recorded. | PASS | Unity 787d4142 EditMode 101/101, PlayMode 49 passed, 2 ignored. Three real-process fixtures excluded by wrapper; two Wave1 cases require disposable DB. Rust, contracts and API execution logs in artifacts/campaign-v4. |
| V4-Q06 | VL-212 | Previously skipped test cases individually classified. | PASS | Unity 787d4142 EditMode 101/101, PlayMode 49 passed, 2 ignored. Three real-process fixtures excluded by wrapper; two Wave1 cases require disposable DB. Rust, contracts and API execution logs in artifacts/campaign-v4. |
| V4-Q07 | VL-212 | Actual packaged solo gameplay verified. | PASS | af625941 · Actual Linux player authenticated and advanced shared-RNG solo battle from version 1 to 2. Three retained 720p frames and committed digest observed on the a65b0107 player. |
| V4-Q08 | VL-212 | Actual authenticated cooperative gameplay verified. | PASS | 578944f5 localhost disposable PostgreSQL, authenticated Nest allocation and native Rust WSS: each mode observed all nine natural kinds. Cinder Warden opened with 12,000 HP under the same digest in one and four seats. Both committed a legal swap v2. Executable rendering qualifies separately. |
| V4-Q09 | VL-212 | Fixed-strength Boss behavior verified across supported party sizes. | PASS | 578944f5 localhost disposable PostgreSQL, authenticated Nest allocation and native Rust WSS: each mode observed all nine natural kinds. Cinder Warden opened with 12,000 HP under the same digest in one and four seats. Both committed a legal swap v2. Executable rendering qualifies separately. |
| V4-Q10 | VL-212 | Natural nine-kind gameplay verified end-to-end. | PASS | Linux packaged shared-RNG host and three native peers; legal host swap, 64 rendered cells and exact journal fingerprints. The unmodified WSS candidate separately produced all nine kinds in both solo and co-op. See native table. |
| V4-Q11 | VL-212 | Independent held-out balance evidence retained. | PASS | 578944f5 · two disjoint three-distribution cohorts, 2,016 matches each. No unresolved matches. Opening, refill, and recovery counters retained by kind. Digest 3869f10f…728fe54e. |
| V4-Q12 | VL-212 | Performance and memory measured. | PASS | Sampled actual Linux Unity process at 250 ms. Receipt contains CPU seconds, elapsed time and peak RSS; no GPU/frame-time claim. |
| V4-Q13 | VL-212 | Four-packaged-client qualification advanced. | IN_PROGRESS | 42e5c998 harness and b2e9e6ab Linux player · Four distinct logged-in players entered the actual room, selected owned Pets and became ready. Allocation succeeded. The host retained a stale OPEN lobby and timed out before four native tickets. Room-state handling at fd42009f awaits packaged verification. |
| V4-Q14 | VL-212 | Four-human Windows playtest separately tracked. | BLOCKED | Four consenting Windows players and target hardware have not been qualified. |
| V4-Q15 | VL-212 | Security and compatibility review completed. | PASS | Independent reviewer found a schema-6 UI capability limit, incomplete Admin metadata and mutable turn duration. Fixed in 787d4142, 66af0a44 and 5384c164; historical capabilities retain their existing contracts. Scope is source review and local qualification. |
| V4-Q16 | VL-212 | Exact-source hosted CI passes. | IN_PROGRESS | Protected hosted CI must pass on final V4 PR head. |
| V4-Q17 | VL-212 | Canonical backlog and acceptance ledger updated. | PASS | Canonical backlog and 124-gate V4 ledger retained alongside historical V3 evidence. Durable SQLite run master-campaign-v4. |
| V4-Q18 | VL-212 | Durable resumable checkpoint recorded. | PASS | Canonical backlog and 124-gate V4 ledger retained alongside historical V3 evidence. Durable SQLite run master-campaign-v4. |

### V4 comparison and executable qualification

At 578944f5, the published-candidate validator emitted `3869f10f06bb024cc117a8bbebccde8fec1d82dffd48a206cb03d713728fe54e`. The 61 kits have 245 bound abilities. The weighted candidate assigns 15% of base weight to the three advanced jewels. The reducer constrains initial and recovered boards for playability, so observed frequencies can differ from input weights. These studies used the unchanged authored Wardens. The two seed pairs and candidate variants were tested with the same parties, levels, loadouts and policies.

| Distribution | Wins / matches, 6001–6002 | Wins / matches, 7001–7002 | Mean legal swaps per observed turn, discovery / held-out | Advanced share of ordinary refill, discovery / held-out |
|---|---:|---:|---:|---:|
| Authored candidate | 237 / 672 | 288 / 672 | 9.13 / 10.73 | 12.86% / 13.18% |
| Nine equal weights | 254 / 672 | 158 / 672 | 6.09 / 7.45 | 27.96% / 30.86% |
| Basic-heavy candidate | 287 / 672 | 241 / 672 | 10.90 / 8.36 | 6.65% / 9.16% |

All 4,032 matches terminated. No observed playing turn had zero legal moves. The separate 1,584-match cohort covered trained and geared parties, including Icarus, against Wardens. All ended in defeat, indicating that progression and Warden pressure need further qualification. The 245 historical mirror-immunity observations occupied 134 groups of two seeds across prior variants. Rechecking those 268 outcomes with schema 6 yielded 268 losses, zero wins and zero unresolved. This comparison reuses the ten unique input groups and preserves the historical aggregate denominator. Raw results live under `artifacts/campaign-v4/study-{6001,7001}-final/`, `advanced-parties-8001/` and `mirror-recheck.json`.

The shared executable fixture changes only the Fire hosting threshold to zero. The display uses the actual server-generated board and the host's legal swap. Journal fingerprints, authenticated participants, captioned turns, tile counts, before/after captures and sampled process memory are retained in each receipt.

| Native Linux resolution | Distinct jewels actually seen across the two boards | Elapsed | Peak RSS | Receipt |
|---|---:|---:|---:|---|
| 1280x720 | 8 | 55.2 s | 527.9 MiB | `artifacts/packaged-coop-runs/run-2ob2SdWJ/board-acceptance.json` |
| 1920x1080 | 9 | 43.4 s | 535.3 MiB | `artifacts/packaged-coop-runs/run-ysnX94Ke/board-acceptance.json` |
| 2560x1440 | 9 | 48.9 s | 537.0 MiB | `artifacts/packaged-coop-runs/run-Q5Ro5QnE/board-acceptance.json` |
| 3840x2160 | 9 | 71.8 s | 499.3 MiB | `artifacts/packaged-coop-runs/run-5CTRMycE/board-acceptance.json` |

Linux captures: [720p](../../assets/review/wave-d4/combat/fire-shared-natural-720.webp), [1080p](../../assets/review/wave-d4/combat/fire-shared-natural-1080.webp), [1440p](../../assets/review/wave-d4/combat/fire-shared-natural-1440.webp), [2160p](../../assets/review/wave-d4/combat/fire-shared-natural-2160.webp). Unity source f9e5b780, runtime binary baf6b7dc. A later validator change locks the candidate’s existing 15-second deadline.

The private [Charakuru motion preview](../../assets/review/wave-d4/characters/icarus-charakuru-motion-preview.webp) shows the existing Icarus product. The export is byte-identical to the Unity source. The [actual Unity walk capture](../../assets/review/wave-d4/characters/icarus-charakuru-unity-walk.webp) is frame three of four from the private OpenGLCore URP run at e1deb436. All four had zero near-white foreground pixels. Twelve private family plates matched their canonical SHA-256 values. Public CDN access to the two priority Bird and Dragon references returned HTTP 403. New provider jobs and generation credits both totaled zero.

Live provider inspection used a single authorized Chrome DevTools session and read-only Wrangler. Northflank showed the existing backend and frontend in the default project. The backend deployment linked source `599f121a` and displayed Running. The owner confirmed main deploys to production and no staging exists. R2 reported one bucket with the historical public CDN address enabled; no custom domains were listed. No production deployment or upload was attempted.
