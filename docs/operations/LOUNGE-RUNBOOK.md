# Local Lounge operations and recovery

These locally verified procedures do not establish an operated public venue. The current application ships silent text/visual sets,virtual mocktails and finite anonymous reactions. No media provider/player/uplink exists. Do not provision real staff,turn on public/world flags or invent rights during these procedures. Public launch still needs named coverage/safety/appeal/incident owners,rights/privacy/age/content review,security/backup/monitoring gates and explicit owner approval.

## Reproduce the local drills

From the repository root,with Node26.9.x/pnpm11.28.5 and local Docker available:

```sh
node scripts/with-test-db.mjs pnpm exec vitest run --project integration tests/integration/lounge-operations.test.ts
pnpm bench:lounge
node scripts/run-browser-tests.mjs tests/e2e/lounge.spec.ts -g 'Lounge confidential contact report'
```

The browser command consumes an existing verified build;run `pnpm build` first after application changes and finish it before starting browser tests. The wrappers allow only disposable loopback test databases and remove their containers/schemas after exit. Benchmark role/schedule SQL rows are explicitly synthetic test provisioning. No retained local/legacy/production data is a test target. Do not raise production request limits to make a drill pass. Failure logs are evidence;keep them and record the actual cause.

## Before a set

Check `/health/ready`,the independent world/install flags,current Event schedule/timezone/capacity and actual scoped registered staff grants/session expiry. A host title,apron,public event or RSVP grants no staff authority. A current scoped moderator must explicitly open reactions and stay connected in the original room. Audience mode starts DISABLED;opening it approves at most five minutes clipped by current grant/session/Event expiry. Moderator/organizer suppression works outside the room and during an uncertain OPEN reply. Independent performer Stop and voluntary bartender Stop remain available when positive authority is lost.

Room capacity is twelve including ten audience chairs and two circulation places. Stage allocation is one logical consenting performer;the physical stage floor stays closed. RSVP grants no room/chair/stage. Only Clap/Star/Wave are offered,at most20perroom/10s,2s account cooldown,5/account/window and120/hour. Mute clears visible counts while the original-window quota remains spent. Review small-group inference disclosure with participants. General chat,voice/video,uploads,tickets,real alcohol and payments remain absent.

Confirm `config/lounge-media-clearance.json` remains empty unless actual owner-reviewed rights evidence exists. Evidence hashes establish bytes,not legal permission. Media status always says SILENT/playback disabled,even for reviewed readiness. The browser rejects playable/URL-bearing responses and CSP denies media/frames/objects. A provider-specific fault/uplink drill is inapplicable until a separately approved provider actually exists;do not substitute a mock and claim it was exercised.

## Confidential contact reports and harassment

Use the native Report or block control for a currently visible participant. A guessed hidden identity is denied;the test fixture explicitly opts its subject into public presence. Keyboard users can fill the private note and activate Send private report. An uncertain delivery retries its original key. A receipt confirms intake,not guilt,automatic sanction or response time. The peer does not see reporter identity/note/receipt;the evidence body is encrypted. The reporter retains own receipt access after blocking. Block contact independently and let the performer leave/Stop;do not compel continued performance/service to preserve a report.

Use the shared [moderation runbook](MODERATION-RUNBOOK.md) for assigned/conflict-free human review,appeals and current scoped sanctions. Reporting against a staff member requires independent oversight. Never copy confidential allegations,evidence,session cookies or keys into logs/screenshots/public chat. A hidden/anonymous performance has no invented attribution or public identity-search endpoint. If attribution is unavailable,escalate through the owner-reviewed safety process while keeping unsafe activity closed.

## Cancel a set

The current organizer uses the Events cancel mutation with the observed version and an idempotency key. Confirm the receipt/current Event before starting a different mutation after an interrupted reply. Event cancellation closes its Stage queue/active slot and Audience approval in the same SQL transaction,clearing counts. An injected Audience close failure in the local drill rolls back Event and Stage too;the exact-key retry then commits one cancel receipt. Existing RSVP/booking release/notification semantics stay owned by Events.

Cancelling a set does not promise forced travel,instant delivery to every device or cancellation of independent Hospitality work. Audience snapshots expire<=3s and Stage observations<=5s;refresh to confirm state. Stale frontend replies/old positive keys must not restore authority. Customers may withdraw unfinished virtual service and voluntary workers may Stop/refuse independently.

## Emergency shutdown and reviewed recovery

1. An authorized current in-scope safety-admin closes World admission through Incident controls with Incident or Coverage loss reason. Ordinary users and performer/host-only grants cannot do this. The owner serializes closure with Room actions,ejects current visits and denies new admission/commands. Check current Room state and incident audit;an exact-key retry creates no extra audit closure.
2. Stage/Audience positive commands reauthorize immediately. Fair20-row maintenance batches on the3second scheduler close persisted work after role/session/source/world/safety loss. The local API drill explicitly runs one batch for its one set;this does not prove every production backlog closes in three seconds. Server suppression and device snapshot expiry are different observations. Leave the incident closed if the DB/control state is uncertain.
3. Record minimal request IDs/status/timestamps and counts in a private incident record. Use existing no-store health/diagnostics and scoped moderation audit;do not export raw room membership proofs or allegations. Preserve additive SQL state/history. No destructive downgrade is needed.
4. A different current scoped safety-admin reviews the cause and records Reviewed recovery. The original closer cannot reopen;deleted/unattributable closer linkage stays fail-closed. Reopening world admission does not restore old visits,Stage consent,Audience approval,staff shift or cancelled Events. Rejoin through the normal path and obtain fresh performer/moderator consent only after the cause is resolved.
5. Verify a former source cannot send reactions,old Stage work remains ENDED,and a fresh visit observes DISABLED until a fresh current moderator explicitly approves. Keep the actual release/world flags OFF throughout local drills. A real deployment/release still needs owner approval.

## Load profile and limits

`pnpm bench:lounge` measures a bounded local profile with48actual sockets in four full rooms:forty RSVP guests,four hosts and four registered moderators. It sends three concurrent forty-request reaction waves with real2.1second cooldown waits and one forty-spectator aggregate read wave,within one real ten-second server window. The first two waves must accept forty each;the third must reject forty with429. Per-room SQL must show20accepted and20visible in the original window;every aggregate body is under500bytes. It checks no application spectator events during measured reactions/reads,grant-removal closure on the next read and explicit socket/member cleanup. Headers,engine heartbeats,transport framing/bootstrap/cleanup traffic are excluded from JSON-body egress.

The report records hardware,p50/p95/max,expected429 vs unexpected errors,child API CPU,100ms-sampled RSS/heap and measured JSON-body bytes. DB/client share the host but their CPU is excluded from child API CPU. Read waves are explicit manual refreshes,not continuous polling. The first three attempted profiles are retained:one invalid LIVE fixture timestamp;then ten unexpected statuses without sufficient diagnostics to establish their exact cause;then diagnostic proof that reading every spectator after every send wave crossed the real window and reset counts. Reducing the read cadence changes the measured workload;it does not establish that the earlier heavier workload passed. No request budget/window/clock was relaxed.

A short48socket test proves neither sustained100/1000CCU,ramp/soak,slow-client transport,WAN/TLS/browser rendering nor media delivery capacity. Broader measured targets remain M21/M22/M23 gates. Use the exact final report/command log linked in `m19-acceptance-checks.json`;do not quote a failed or concurrently loaded trial as the accepted baseline.
