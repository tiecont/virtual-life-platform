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
| Gemini workflow | [Production inputs and prompt handoffs](../media/gemini-production.md) |
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
| [x] N10 | VL-210 | Six original functional gem artwork candidates produced. | PASS | ca5978ea · [Gem sheet](../../assets/review/wave-d4/combat/functional-gems-concept.webp) | Original vector set and [Gemini Neon High sheet](../../assets/review/wave-d4/combat/functional-gems-gemini-concept.webp) both available for owner review. |
| [ ] N11 | VL-210 | Production sprite atlas integrated into Unity. | IN_PROGRESS | ca5978ea · [Gem sheet](../../assets/review/wave-d4/combat/functional-gems-concept.webp) | Both 512×256 atlases imported with six independent 128×128 sprites in 80 passing EditMode tests on a1cddd96. The development player rendered the Gemini atlas at 720p and 1080p. Production art review remains open. |
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

The fixed-camera Fire and Water studies are CONCEPT images generated with OpenAI ImageGen on 27 November 2026 using original text briefs. No external character reference was supplied. The 1,672×941 PNG originals are in the private local stage identified at N27. The JPEGs bundled for offline review and the smaller WebP derivatives share those originals. Owner art and rights review remain pending. The functional jewel sheet is an original, locally drawn vector design. Its scale and state sheet uses the runtime atlas.

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
| O-B02 | VL-211 | Server-authoritative turn duration is 15 seconds. | IN_PROGRESS | 6402dd7d · Rust `arena8-coop-v3` | Rust and PostgreSQL ignored-DB test passed; Nest and Unity not yet integrated. |
| O-B03 | VL-211 | End Turn works with the authorized action economy. | IN_PROGRESS | 6402dd7d · `EndTurn` | Voluntary pass, no free resources, not Guard. Unity button pending. |
| O-B04 | VL-211 | Timeout advances without automated gameplay. | IN_PROGRESS | 6402dd7d · `ExpireTurn` | Idempotent, restart-safe in DB test. |
| O-B05 | VL-211 | No maximum-turn or maximum-round combat defeat. | IN_PROGRESS | 6402dd7d · v3 tests | v1/v2/functional-v1 unchanged. |
| O-B12 | VL-211 | x2 through x8 supported. | IN_PROGRESS | 6402dd7d · candidate bundle | x7/x8 thresholds are an unapproved candidate. |
| O-B18 | VL-203 | Historical rulesets remain recoverable. | IN_PROGRESS | 6402dd7d · digests unchanged | Hosted CI pending. |
| O-B19 | VL-211 | New balance simulations executed. | IN_PROGRESS | 6402dd7d · 3,456 matches | 0 wins, 3,456 losses under unmodified boss values; 0 unresolved. Tuning and owner approval open. |
| O-J01 | VL-203 | PR90 aggregate failure resolved. | IN_PROGRESS | 6402dd7d · ci-capacity 898→902 | Four added tests identified; hosted CI pending. |
| O-F04 | VL-204 | Representative starter Pet assets advanced. | IN_PROGRESS | Blender 5.3 candidates: Coalwhisk, Dewskip, Clodkin | Primitive-built; art review required; 0 Meshy credits. |
| O-F09 | VL-206 | Fire background production candidate. | IN_PROGRESS | Gemini Neon High master 2730×1536 | Runtime JPG swapped; Unity render pending. |
| FLOW-01 | VL-184 | Account entitlement and credit costs verified. | PASS | Flow showed 1,050 credits, reset Dec 26. 720p 8s video: 24 credits (x1) | Watermark required in region. |
| FLOW-03 | VL-184 | Icarus introduction produced. | IN_PROGRESS | 8 s 720p h264 clip, 24 credits | Wings drift from folded to spread; face consistent in mid frames. Review pending; not accepted. |
| FLOW-04 | VL-184 | Icarus ultimate cinematic produced. | IN_PROGRESS | Second 24-credit generation submitted | First prompt risked extra wings; retry added a two-wing constraint. Not yet downloaded. |

Not yet started: remaining O-A to O-J and FLOW-02, 05..12 rows. Private cloud upload is NOT_RUN. Owner reviews are outstanding for art, balance and x7/x8.
