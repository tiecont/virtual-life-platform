# Eternal Library

The original Library module in packages/library-world defines eight desks and one shared quiet layout. Reading corner is for individual reading;Study alcove provides quiet company at shared desks. These labels identify areas,not private/isolation guarantees. No book files,audio,task notes or automatic social progress are distributed. Server room capacity/seat authority and the current session remain authoritative.

`/worlds/library` renders original deterministic shelves,decorative book spines,tables,plants and the existing original avatars. Native desk and movement buttons provide all essential actions when the canvas fails. The same WorldRoomPanel/RoomSafety components power the SDK sandbox;there is no second realtime or seat implementation. Entry requires a current approved catalog/version and explicit action. Opening the page does not allocate a place. The shared travel desk remains the route for cross-world admission.

## Local verification setup

Set `LOCAL_LIBRARY_WORLD=1` only in a development/test API environment and set `library:true` in that environment's trusted WORLD_FLAGS_FILE. These are separate gates;missing either does not admit a Library visit. Production rejects LOCAL_LIBRARY_WORLD=1. Default flags and publicRelease remain OFF. Stop/reload/disable using the existing registry/flag lifecycle;disabling closes active Library memberships. No migration or separate account/focus database exists.

`node scripts/run-browser-tests.mjs tests/e2e/library.spec.ts` selects the isolated Library browser flag fixture. Default full runs also isolate that spec/profile;other specs retain their original fixture. This is local implementation testing,not public enablement or staffed operations. Original art sources/provenance are at `/assets/library/provenance.json`;releaseApproved remains false.

## Slice scope

M17-01 provides scene,desk areas,access and native controls. M17-02 enables shared focus in world version1.1.0,using the unchanged scene1.0.0. It reuses the existing private timer/history and account-wide one-active rule. Start requires the server's current Library seat;bounded pause/resume is explicitly allowed here. Leaving or losing the room does not cancel or reset the durable timer. Restarted/finished history retains its original Library/room/desk scope. A public profile does not make the timer public;no task notes or productivity are broadcast.

No new timer database or per-second writes are introduced. Interrupted browser starts retain their exact mutation key;user retry observes the committed timer. Pause and completion use server time,not the browser clock. Integration tests advance only an injected trusted server clock;browser tests verify the actual response-loss/pause/resume/leave/cancel flow. See ADR0052/m17-focus-checks.json for actual outcomes and limits.

Events,quiet-policy regression,consented study invitations/progress and full timed travel remain03..05. No room population,schedule,peer or productivity value is invented. M15/M16source revision gates do not block this independent world,but actual Library->legacyDeadline acceptance cannot be claimed using synthetic travel alone.
