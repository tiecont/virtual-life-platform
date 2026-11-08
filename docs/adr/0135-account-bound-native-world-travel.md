# ADR0135 — account-bound native room and travel adapter

Status: implemented candidate;qualification pending. Date:2026-11-08.

N06-07 requires the saved animal to survive real world visits and travel. The previous native lane supported account/creator/safety preparation only. Its preview never authenticated a room.

Add two dedicated custody operations: `roomTicket` and `world`. Both assert the displayed account inside the existing serial Android queue before HTTP. The server also checks the expected-account header;ticket issuance repeats that check after its account lock. `world` maps a finite operation enum to catalog,compatibility,own visit and own travel intent create/read/cancel. UUID paths and mutation receipt keys are mandatory. Generic `request` remains limited to own account settings. Access,refresh and CSRF custody never leaves Java;only the existing short-lived single-use socket ticket reaches the WebView.

The shared room uses an optional async socket-auth port. Browser cookie/CSRF behavior remains the default. Native reconnect creates a fresh protocol nonce/ticket;late responses cannot reconnect a cancelled,backgrounded or replaced view. Native has no cookie/legacy-handshake fallback. Session revocation invalidates the account-bound platform and city view. Existing RoomAuthority,room/seat/motion/travel services,receipt reconciliation and privacy-filtered appearance projection remain authoritative.

Extract the existing travel panel into game-client behind platform,Link and visit-change ports. The Next wrapper supplies its existing browser adapter. Native supplies bounded custody operations,lifecycle and explicit supported destinations. Android room controls include movement,seating,travel and report/block. Focus,cafe service and messaging are visibly unavailable until their complete business/safety adapters are qualified;N06-04 remains separate.

Normal native origin/trust stays disabled. A separate native-world qualification bundle and fresh local test CA exercise real Deadline/Maid adapters under one API/RoomAuthority. Proposed tests are work to run;their files alone are not evidence. Qualification requires source-bound browser regression,actual PostgreSQL/native HTTPS/WSS/AVD journeys,then normal APK restoration. Physical Android,final art,N14 Apple access,owner disclosures,public staging and distribution remain separate gates. No SQL or production data change is required.
