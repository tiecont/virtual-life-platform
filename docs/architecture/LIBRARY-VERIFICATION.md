# Library verification

All five local M17 tasks are VERIFIED. M15 now supplies the actual Deadline adapter;M17-05 executes its own Library/Deadline acceptance instead of substituting SDK Sandbox. Real rollout/public/operator gates remain closed.

| Acceptance | Actual evidence | Limit |
| --- | --- | --- |
| Original scene,native desks/mobile/keyboard | m17-scene-checks.json and current m17-actual-journey-browser.log | No physical assistive-tech certification |
| Seat races,private timer/restart | m17-focus-checks.json and current18case Library integration run | One shared Focus owner;no new timer table |
| Quiet room and study RSVP | m17-events-checks.json/current18API20browser cases | Actual Library rejects text,canned messages and emotes even with chat enabled;real organizers remain default-deny |
| Sharing/exact-room invitations | m17-sharing-checks.json/current whole Library browser | Explicit per-visit opt-in;small-group inference/5second observation limits remain |
| Completed Library timer→actual Deadline/private history | m17-actual-library-completion.json/m17-actual-journey-integration.log | Injected trusted serverclock completes900seconds;6finish attempts yield1completion/900second private summary,Deadline history empty/foreign404;not15minutes wall time |
| Portal/reconnect→actual Deadline/native controls→City | m17-actual-journey-browser.log/m17-actual-journey-visual | Actual transport closes/reconnects with same membership/seat/timer;browser cancels the continuing Library timer after travel,it does not claim completion |
| Confidential report/block/mobile | Same20browser executions | No broadcast evidence,real moderator staffing or review-time guarantee |
| Current original-art fingerprints | m17-scene-provenance-check.log |6scene manifests/15references match after correcting4stale shared-renderer metadata fields;hash checks grant no legal/public approval |

Current verification is18integration cases,20browser executions,latest explicit test types/lint/allbuilds/assets/CI policy,as recorded in m17-actual-journey-checks.json and ADR0096. No fresh whole553integration/unit/full29spec browser result is claimed here;that wholecheck belongs to M16-06. No application/Room/Focus/Safety code,newDDL or original legacy data/process changes were needed.

The earlier m17-journey-* artifacts remain historical evidence of a deliberately limited SDK destination and unresolved then-current source gate. They are preserved and superseded for actual Deadline acceptance by the new m17-actual-* evidence. Twenty-four fresh historical browser outputs were saved before restoring all24prior files(16different). Cross-module journey/release operations remain M22/M23;B-003 remains external.
