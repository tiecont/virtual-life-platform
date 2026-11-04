# ADR 0055 — Original Restaurant layout and service perspectives

Status: accepted for local implementation; public release remains gated.

Audit found no existing Restaurant module. M11 owns hospitality, M12 owns event reservations, M14 owns the scene renderer and RoomAuthority owns admission/chairs. Restaurant therefore supplies a new declarative SDK adapter and original art rather than duplicating those owners or importing another world.

The first scene has two four-chair tables. Their unique seat IDs map exactly to eight reachable authoritative chairs. Room capacity is ten: two additional unseated circulation places grant no staff privilege and are not guaranteed staff slots. Declared event reservation resources reuse those same table keys/capacities. Registration alone does not schedule events, reserve tables or admit a party; M18-02 supplies that journey.

The shared shell now accepts trusted dining decor, area copy and a child presentation slot. The default Cafe and Library remain on their existing themes. Native seat/movement controls remain the canvas alternative and use the same authenticated socket commands, identity and recovery owner. Original code provenance includes fingerprints of the layout and renderer; no external food/media assets or physical food sales.

Diner, Server and Cook radios select a presentation. They issue no shift/order writes and are never authorization input. Service views read only the existing private own-shift API, report failures truthfully, and discard superseded identity requests. Actual voluntary shifts and role-specific server privileges belong to M18-03; courses/minigame belong to M18-04. The module currently offers neither hospitality nor focus capability.

Installation requires explicit nonproduction LOCAL_RESTAURANT_WORLD=1, rejected in production; its independent registry flag also defaults off. Existing real rollout flags remain off. No SQL migration or wire schema changes are needed for this slice. Production installation/release requires later reviewed configuration, social safety and acceptance gates.

Verification must cover actual admission/seat contention/capacity/flag revocation, production/default guards, keyboard and failed-asset paths, perspectives without service authority, desktop/mobile and affected shared-renderer regressions. Evidence is m18-scene-checks.json once those commands finish; implementation alone is not verification.
