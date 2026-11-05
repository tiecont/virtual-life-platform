# Local accessibility audit

M22-06 audits implemented native journeys rather than inferring accessibility from a canvas or stylesheet. Current browser outcomes and exact scope belong in [the evidence ledger](../agent/evidence/m22-accessibility-checks.json). The local acceptance is keyboard operation/focus restoration,reduced motion,selected small-text contrast>=4.5and sampled button/hotspot targets>=44px,no horizontal overflow. It is not a full WCAG conformance or assistive-technology certification.

Actual final coverage is10unique desktop/mobile cases:2Library,6SDK/Restaurant/Lounge and2map. The initial2Library executions also passed before a test-only NodeList/DOM type correction;they are retained separately rather than counted as additional unique cases. Final Library typecheck/whole lint/CI policy pass;all335runtime paths match5af78c6 and456source hashes around the final run remain identical.24fresh images/facts(12PNGs/12JSONs) were saved before10changed historical files were restored;4selected images inspected. No product change or new full-build/full-suite claim follows.

| Surface | Executable scope |
|---|---|
| SDK Sandbox | Skip to controls → Tab/Enter admission → focused walking heading → native destination;system and explicit reduced motion,zero idle canvas frames;back to controls → Tab/Enter leave → entry focus restored. Selected text contrast and all queried buttons checked on desktop/mobile. |
| Library | New case operates entry,desk selection,start/pause/resume/cancel private timer and exit using native keyboard controls. Verifies focus transitions,timer `aria-live=off`,system reduced motion/no idle frames,11selected text samples and20visible main buttons. |
| Restaurant | Native entry/action focus and movement,reduced-motion canvas/no idle frames,selected service/event text contrast and visible main-button geometry. Earlier actual three-course service has native controls but its full tab sequence is outside this specific contrast/motion case. |
| Lounge | Native entry/focus/seat/exit,OS reduced motion,closed-stage restriction,silent media-free presentation and visible main-button geometry. One pointer action tests stage denial;seat/admission/exit have keyboard alternatives. This case does not measure all Lounge text contrast. |
| Portal map | Every real catalog hotspot has a matching native list item,keyboard anchor focuses that item,44px non-overlapping targets and same-identity native cafe navigation. The base fixture catalog contains4entries;the map case runs separately from enabled-world fixtures. |

Tests are actual Chromium desktop and iPhone-sized/touch Chromium emulation,not physical Safari/iOS evidence. Browser artifacts are real PNGs/computed JSON facts;manual review covers selected images only. Contrast sampling uses computed text/nearest background on selected components,not every state,pixel,alpha-composited background or non-text control boundary. Focus assertions cover explicit named transitions,not every possible Tab order in the application.

Code audit confirms native controls remain independent of canvas rendering,canvas descriptions/participant lists communicate state,connection/visit feedback is polite,and timer seconds are not continuously announced. Shared controls retain visible focus styling. Existing asset-fallback/report/private negative-action tests are separate evidence;their entire screen-reader/modal behavior has not been certified by this audit.

## Remaining review work

These are known coverage/release gates,not invented confirmed runtime defects. No new blocking defect was found in the exercised controls.

| ID | Priority | Remaining verification / owner gate |
|---|---|---|
| A11Y-01 | P1 before public | Human NVDA/VoiceOver and real keyboard/touch device review,including announcements,reading order and native dialog focus. No real tester/operator is provisioned by this work. |
| A11Y-02 | P1 before integrated beta | Actual Deadline/Maid keyboard/focus/fallback journeys after clean revisions/adapters/reuse scope(B-001/B-002). Synthetic destinations do not close this gate. |
| A11Y-03 | P1 before restricted operation | Human review of all private consent/withdrawal/report/moderation paths and dialog Tab loops on intended devices. Independent negative actions have protocol/browser tests;that is narrower than full accessibility signoff. |
| A11Y-04 | P2 | Text resize/high zoom/reflow,forced colors/high contrast,all interactive/focus/non-text states and all composite backgrounds. Current contrast samples alone cannot settle those checks. |
| A11Y-05 | P2 | Extend full Tab-order/contrast inventory across less-used scheduling,staff/event/private forms;validate new worlds when implemented. |

Keep each finding's scope open until actual results exist. Closed real-world flags,privacy/age/operator/media gates and the actual legacy acceptance blocker remain in force. This audit introduces no public activation or production claim.
