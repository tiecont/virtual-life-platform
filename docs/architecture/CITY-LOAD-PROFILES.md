# City load profiles

M22-05 uses the existing isolated PostgreSQL and child API harness. No public/legacy/retained database or remote target is accepted. Commands run one profile at a time:

```sh
pnpm bench:city --clients=100 --soak=120
pnpm bench:city --clients=1000 --soak=120
```

`--soak=2` is a smoke only,reported NOT_EVALUATED_SMOKE. Other targets/durations are rejected. Reports are written to `artifacts/city-profiles-<clients>-<seconds>.json`;copy dated results to task evidence before another same-profile run. A command exit0means measurement/invariants/cleanup completed. The separate `hypothesis.status` decides MET_LOCAL_ONLY or NOT_MET;neither grants public capacity approval.

Each synthetic account bootstraps through actual HTTP,explicitly makes fixture presence public and opens an actual Socket.IO connection from a unique physical loopback source address. Ramp admits batches10with100ms pauses. Stress concurrently repeats authoritative room joins. Soak staggers admitted clients' snapshots every30seconds for120seconds. This exercises current identity,authorization,owner and viewer projection work using Node clients;it does not render a scene or simulate chat,orders,travel,real legacy worlds or adult interactions.

Current SDK capacity is eight per room,max32rooms/world:256admitted. Gateway max1000transports is a different bound. Reports distinguish created/connected clients,admitted members,ROOM_FULL,RATE_LIMITED and unexpected outcomes. A1000socket experiment may complete while the1000admitted-player hypothesis fails. No production quota is raised for a passing label.

Reports provide operation/phase p50/p95/max for all attempts and successful attempts,outcome counts,unexpected/rejection ratios,API CPU percentage of one logical core,sampled API/client RSS,host available memory and API TCP byte deltas. TCP counters include HTTP/WS framing and protocol pings,exclude DB traffic,TLS,WAN/browser assets and billed egress. API CPU/RSS exclude client/DB processes,which share the larger host. A1second sampler plus phase boundaries is not an OS high-water mark. A120second soak is not the900second operations investigation window or a long-term leak test.

Start requires3GiB available host memory. API RSS>720MiB,client RSS>768MiB,host available<2GiB or a5minute profile deadline stops new work. Acknowledgments retain the5second bound. Healthy cleanup explicitly leaves/closes and observes zero sockets,transports,memberships and occupied seats;empty rooms may remain until owned process shutdown. Stop only that child,with20second deadline then own-child termination if required;drop only the generated schema. Actual fallback/cancellation/resource-exhaustion fault coverage is recorded separately from normal cleanup.

The all-target hypothesis requires every client admitted,zero command rejection/unexpected errors,successful ACKp95<=1000ms,API RSS<=768MiB and complete120second soak/cleanup. Hardware and source provenance accompany measured results. [Evidence](../agent/evidence/m22-load-checks.json) is authoritative;the benchmark is not verified merely because this guide exists. [ADR0080](../adr/0080-bounded-city-load-hypotheses.md) explains scope and limits. A local regression baseline must be chosen from actual results before any separately reviewed smaller-host/public capacity decision.

## Measured local results

The final100and1000commands both completed with exit0 and explicit zero-member/socket/transport/seat cleanup. Hardware is the larger local Linux/Node26host recorded in each report,not the planned2vCPU4GiB VPS. Both ran a full120second soak with unchanged456source hashes.

| Target / phase | Connected / admitted | Authoritative command p50 / p95 ms | Guard rejections | API CPU % of one core | Sampled API RSS MiB | API TCP bytes written |
|---|---|---|---|---|---|---|
|100 ramp|100 /100|86.3 /174.5|0 /100joins|51.63|195.69|1,090,140|
|100 stress|100 /100|297.7 /517.9|0 /100joins|51.04|197.94|215,692|
|100 soak|100 /100|13.2 /16.6|0 /400snapshots|1.60|199.32|863,968|
|1000 ramp|1000 /256|76.3 /153.5|744ROOM_FULL /1000joins|34.34|233.20|4,031,090|
|1000 stress|1000 /256|859.8 /1479.6|744RATE_LIMITED+2ROOM_FULL /1000joins|42.31|238.95|658,172|
|1000 soak|1000 /256|16.3 /32.3|0 /1023snapshots|3.67|239.95|2,247,639|

Latency here is successful ACK latency;the raw reports also include all-attempt latency so fast rejections cannot hide slow successful work. Rejection ratios for the1000join operations are74.4%ramp/74.6%stress. Phase-level report ratios include all phase operations,which additionally include guest/privacy/handshake during ramp;use each operation's outcomes for admission ratios. Unexpected outcomes are0in both experiments,not zero rejected requests.

The100target is MET_LOCAL_ONLY and becomes the **local API presence regression baseline**,with100members across13rooms. The1000admitted-player hypothesis is NOT_MET:capacity remains256across32rooms and stress successful-ACKp95exceeds1second. Its120second soak describes1000connections/**256admitted** clients,not1000game players. Keep all limits and closed flags. Any real deployment/capacity commitment still needs the smaller host,broader gameplay,proper-duration soak,DB/web/edge measurements and separately approved operations.
