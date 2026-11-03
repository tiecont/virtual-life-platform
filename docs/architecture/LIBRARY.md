# Eternal Library

The original Library module in packages/library-world defines eight desks and one shared quiet layout. Reading corner is for individual reading;Study alcove provides quiet company at shared desks. These labels identify areas,not private/isolation guarantees. No book files,audio,task notes or automatic social progress are distributed. Server room capacity/seat authority and the current session remain authoritative.

`/worlds/library` renders original deterministic shelves,decorative book spines,tables,plants and the existing original avatars. Native desk and movement buttons provide all essential actions when the canvas fails. The same WorldRoomPanel/RoomSafety components power the SDK sandbox;there is no second realtime or seat implementation. Entry requires a current approved catalog/version and explicit action. Opening the page does not allocate a place. The shared travel desk remains the route for cross-world admission.

## Local verification setup

Set `LOCAL_LIBRARY_WORLD=1` only in a development/test API environment and set `library:true` in that environment's trusted WORLD_FLAGS_FILE. These are separate gates;missing either does not admit a Library visit. Production rejects LOCAL_LIBRARY_WORLD=1. Default flags and publicRelease remain OFF. Stop/reload/disable using the existing registry/flag lifecycle;disabling closes active Library memberships. No migration or separate account/focus database exists.

`node scripts/run-browser-tests.mjs tests/e2e/library.spec.ts` selects the isolated Library browser flag fixture. Default full runs also isolate that spec/profile;other specs retain their original fixture. This is local implementation testing,not public enablement or staffed operations. Original art sources/provenance are at `/assets/library/provenance.json`;releaseApproved remains false.

## Slice scope

M17-01 provides scene,desk areas,access and native controls. Focus capability is deliberately absent until02verifies correct shared focus scope. Events,quiet-policy regression,consented study invitations/progress and full timed travel are03..05. No room population,schedule,peer or productivity value is invented. M15/M16source revision gates do not block this independent world,but actual Library->legacyDeadline acceptance cannot be claimed using synthetic travel alone.
