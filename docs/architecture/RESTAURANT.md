# Grand Restaurant

M18-01 supplies an independently authored local world at `/worlds/restaurant`, using the shared room authority, identity, original Pixi scene and native keyboard controls. The package depends only on contracts and SDK. Runtime activation requires both nonproduction `LOCAL_RESTAURANT_WORLD=1` and an explicit registry flag; defaults and real rollout remain OFF.

Garden dining and Window dining each contain four reachable exclusive chairs. These are two areas of one public room, not private rooms. Eight dining seats fit within ten room places; the additional unseated places do not reserve staff capacity or grant authority. Table resource keys in the event policy match this inventory exactly. Admission and reads remain separate; opening the page/catalog never creates a room or booking.

Diner/Server/Cook perspectives use native radio controls. Choosing a perspective issues no staff/order mutation. The service perspectives display the private own-shift read or an explicit unavailable state. M18-03 will integrate actual voluntary roles; the current adapter offers no hospitality capability. M18-02 will implement reservation/group check-in UI using Events ownership. Courses/coordination, dinner offers/private-table consent and full acceptance remain M18-04..06. No private-table, food sales or service completion claim is made by this scene slice.

Existing shared report/block controls appear during an actual visit. Release requires all social safety and operator gates; this local scene is not production approval. No external media, books, food photographs, audio or shipping data are included. Source provenance is served at `/assets/restaurant/provenance.json` and releaseApproved remains false.

Room capacity, seats, version checks, disconnect recovery and revocation use the existing owners. This slice adds no table, migration, alternate session, role grant or gameplay database. See ADR0055 and `docs/agent/evidence/m18-scene-checks.json` for actual verification and limits.
