# Wave D4 production acceptance

The canonical backlog is [development-plan.json](../../config/development-plan.json). Each row identifies the revision on which its evidence was observed. A pending row needs a new run or the named decision. Technical, visual and owner acceptance are recorded separately.

## Evidence sources

| Source | Reproducible or retained evidence |
| --- | --- |
| Player / Native | Local evidence under `artifacts/wave-d4-session/{integrated-packaged-coop.json,integrated-native-verified.log}` |
| Admin | `artifacts/wave-d4-session/admin-skill-publication.json` |
| Balance / Performance | `artifacts/wave-d4-measures/{balance-summary.json,performance-summary.json}` |
| Character | `artifacts/wave-d4-art/icarus-H1-R3/gates/H1/` |
| Media / Local stage receipt | `artifacts/wave-d4-media/{original-score-r1,opening-animatic-r1,private-art-stage-receipt-r1.json}` |
| Gemini workflow | [Production inputs and prompt handoffs](../media/gemini-production.md) |
| Gallery | [Guest and equipment](../../assets/review/wave-d4/baseline/), [combat](../../assets/review/wave-d4/combat/), [six maps](../../assets/review/wave-d4/world/) |

![Fire board before the glyph update](../../assets/review/wave-d4/combat/fire-board-after-reconnect-1024x768.webp)

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
| B06 | Regular encounters work through normal navigation. | NOT_RUN | — | Collect dedicated evidence for this condition. |
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
| C05 | Six elements have meaningful strategic identity. | NOT_RUN | — | Collect dedicated evidence for this condition. |
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
| E07 | Combat board readability and visual quality improved. | IN_PROGRESS | e19170e5 · ElementTiles | Six shape glyphs and corner multiplier badges implemented. Verify a rendered build. |
| E08 | Six elemental tiles are visually distinguishable. | IN_PROGRESS | e19170e5 · ElementTiles | Six shape glyphs and corner multiplier badges implemented. Verify a rendered build. |
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
| G08 | Six regular encounter paths verified. | IN_PROGRESS | 76394de5 · coop-settlement.test.ts | Six-map persistence with fixture terminals. Natural six-map game journey remains open. |
| G09 | Six cooperative Boss encounter paths verified. | IN_PROGRESS | 76394de5 · coop-settlement.test.ts | Six-map persistence with fixture terminals. Natural six-map game journey remains open. |
| G10 | Portal and campaign progression verified. | IN_PROGRESS | 76394de5 · coop-settlement.test.ts | Six-map persistence with fixture terminals. Natural six-map game journey remains open. |
| G11 | Environment lighting and composition visually reviewed. | PASS | c6276c4c · Gallery | Visually reviewed development scenes; overbright Dawn and repeated primitive composition need improvement. |
| G12 | Actual in-game map screenshots available. | PASS | c6276c4c · Gallery | Visually reviewed development scenes; overbright Dawn and repeated primitive composition need improvement. |

## Gemini cinematic and music production

Related tasks VL-184, VL-187.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| H01 | Actual Gemini session capability inspected. | PASS | 3d23e0be · Gemini workflow | Authenticated tab exposed Create image, video and music. Tideglass brief submitted; output retrieval is unverified. |
| H02 | Authorized generation workflow established. | PASS | 3d23e0be · Gemini workflow | Authenticated tab exposed Create image, video and music. Tideglass brief submitted; output retrieval is unverified. |
| H03 | Opening cinematic candidate produced. | IN_PROGRESS | d2a911c7 · Media | Local still-frame opening animatic with original score; full cinematic and review remain open. |
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
| I08 | Four-player combat workload measured. | NOT_RUN | — | Collect dedicated evidence for this condition. |
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
| L04 | Production originals kept outside Git. | PASS | d2a911c7 · Media | Local editable originals and masters retained privately. |
| L05 | Authorized source images delivered to private cloud. | NOT_RUN | Local stage receipt | 9 files staged, 31481102 bytes. No verified private cloud upload or retrieval. |
| L06 | Authorized VRM/GLB/FBX/Blender assets delivered. | NOT_RUN | Local stage receipt | 9 files staged, 31481102 bytes. No verified private cloud upload or retrieval. |
| L07 | Authorized cinematic and music files delivered. | NOT_RUN | Local stage receipt | 9 files staged, 31481102 bytes. No verified private cloud upload or retrieval. |
| L08 | Authorized build and test packages delivered. | NOT_RUN | Local stage receipt | 9 files staged, 31481102 bytes. No verified private cloud upload or retrieval. |
| L09 | Versioned manifests maintained. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| L10 | Uploaded object existence verified. | NOT_RUN | Local stage receipt | 9 files staged, 31481102 bytes. No verified private cloud upload or retrieval. |
| L11 | Retrieved asset SHA-256 verified. | NOT_RUN | Local stage receipt | 9 files staged, 31481102 bytes. No verified private cloud upload or retrieval. |
| L12 | Private access configuration verified. | NOT_RUN | Local stage receipt | 9 files staged, 31481102 bytes. No verified private cloud upload or retrieval. |
| L13 | Local originals preserved. | PASS | d2a911c7 · Media | Local editable originals and masters retained privately. |
| L14 | No credentials, signed URLs or restricted evidence committed. | NOT_RUN | — | Collect dedicated evidence for this condition. |

## Final product review

Related tasks VL-199, VL-212, VL-214.

| ID | Acceptance condition | State | Revision and evidence | Finding or remaining work |
| --- | --- | --- | --- | --- |
| M01 | Integrated executable available for owner review. | PASS | 68584413 · Player | One Linux guest, three socket clients, Fire victory v29, four receipts and Water admission with Lv2 Core. Restart preserved v3 and all 64 tiles. |
| M02 | Actual gameplay screenshot gallery available. | PASS | 663de837 · Gallery | 15 curated WebP baseline frames, 821278 bytes total; redacted room and guest identifiers. |
| M03 | Character review package available. | OWNER_REVIEW_REQUIRED | 89db72d3 · Character | H1 R3 is ready for owner face and hair review. |
| M04 | Cinematic and music review references available. | PASS | d2a911c7 · Media | Local opening MP4 and eight audio auditions retained. |
| M05 | Performance comparison available. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| M06 | Security verification summary available. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| M07 | Remaining visual and gameplay defects prioritized. | PASS | 663de837 · Gallery | Tile labels collided, board used half the window, actions required scrolling. Dawn highlights clip. |
| M08 | Independent QA reviewed integrated functionality. | NOT_RUN | — | Collect dedicated evidence for this condition. |
| M09 | Four-human playtest preparation completed. | PASS | 68584413 · scripts/packaged-coop/README.md | Four-person protocol available. No human session recorded. |
| M10 | Owner approval gates remain intact. | PASS | eb980abb · canonical plan | Accepted production model count 0/55. H1 undecided; later gates require separate decisions. |
| M11 | Canonical task states match actual acceptance. | IN_PROGRESS | eb980abb · canonical plan | Keep verified states tied to exact revisions and hosted checks. |
| M12 | Release remains OFFLINE_ONLY / NO_GO_PUBLIC. | PASS | eb980abb · canonical plan | OFFLINE_ONLY / NO_GO_PUBLIC. |
