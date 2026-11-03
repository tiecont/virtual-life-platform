# Safety threat model and escalation contract v1

M08-01 defines and validates policy. It does not implement chat moderation, reports, sanctions, appeals, moderator authentication or retention jobs. Those are M08-02..06. `config/safety-policy.json` is a versioned local draft with `SafetyPolicySchema`; public release, coverage approval and retention review are false. No operator/contact is invented, no privileged account is created, and no external message is sent.

M08-02 update: the default-OFF local [chat backend](../architecture/CHAT-SAFETY.md) now enforces pre-broadcast checks, bounded moderation and fresh audience filtering. Production is closed; reporting and staff runtime remain pending. The following table preserves the M08-01 audit baseline.

## M08-01 audit baseline: enforced then versus required next

| Surface | Current evidence-backed control | Missing runtime gate |
|---|---|---|
| Identity | Signed host-only session, Origin/CSRF, strict actor/role rejection, revocation and own-data hooks: `identity/{http,service,socket,policy}.ts` | Staff authentication/assignment, evidence-specific DSR handling and consent review |
| Social contact | Reciprocal friendship, bounded requests, bilateral block, viewer-filtered presence: `social/service.ts`, `identity.visibleRoomProfiles` | Chat/quick-chat/report/invite/sanction enforcement at their new edges |
| Rooms | Authoritative membership/seat/path, per-command auth, rate/queue limits, single-owner interruption; `rooms/{service,socket,authority}.ts` | Content checks before a future broadcast, report membership/evidence capture, cross-world sanction guard |
| Wire events | Only registered session/room commands accepted; unknown commands rejected/disconnected | No current `chat.send`/report/case/admin event registered; do not call transport auth a moderation pipeline |
| Storage | Identity/social records only in city ownership manifest; no message/report/sanction table | Confidential evidence encryption, immutable audit, privileged access/retention tests |
| UI | Guest/privacy/block/leave and accessible room controls | Report/mute receipts, moderator case UI, appeals and safety emergency controls |
| Rollout | All real worlds/public release OFF; synthetic local cafe opt-in only | Actual coverage, reviewed age/privacy/retention/contact, monitoring and explicit release approval |

Protected assets are account/session authority, context-specific presence, future message audience, reporter identity, evidence, sanction integrity, private dating consent and media rights. Adversaries include abusive guests/registered users, coordinated accounts, malicious clients forging events or markup, compromised staff and operators misconfiguring policy. Display names, staff costumes and world roles never confer authority. No user uploads/DM/voice/video/precise device location are added.

Unlinked guest recreation remains a residual abuse risk; an account/session ban does not establish the real-world identity of a person. Do not add covert device tracking to claim otherwise. Test same-account session/transport/travel bypasses explicitly and use reviewed bounded anti-abuse controls plus human operations for residual cases.

## Context matrix

Rules are defense in depth after authenticated registry admission and declared capabilities. A policy entry does not register a world or enable chat. Missing context means deny. `portal` describes discovery UI, not a registered room/world.

| Context | Harassment/content/privacy threats | Target restriction and escalation |
|---|---|---|
| Portal | Hidden-world enumeration, invite stalking, deceptive occupancy, staff impersonation | Silent discovery; authorized catalog only, no unsolicited DM; identity/privacy incidents to safety lead |
| SDK sandbox | Forged peers, spammed quick actions, testing mistaken for public service | Local canned vocabulary only when a future pipeline is explicitly enabled; no live moderation claim |
| Deadline | Focus disruption, unwanted contact, leaked task/statistics, seat pressure | Silent/no chat; leave/block and future confidential report; focus metadata opt-in |
| Maid | Compelled roleplay/service, discriminatory staff/customer abuse, sexualized requests, role-as-authority | Voluntary roles/no gender restriction, moderated room contact and refusal; escalate coercion/sexual/privacy cases; no photos/uploads |
| Library | Disruptive messages, shared study-note exposure, copied books | Silent default and no public personal notes; owned/public-domain material; any M17 canned exception needs a versioned tested rule change |
| Restaurant | Party/reservation privacy, repeated service pressure, targeted table contact | Scoped party consent and moderated room contact; no payments; staff may refuse service without moderator powers |
| Park | Broad-audience harassment, brigading, friend/activity stalking, repeated invites | Moderated scoped contact, server limits/block filtering, no public dating inference; activity board uses eligible metadata |
| Lounge | Stage harassment, crowd floods, unauthorized recordings/music, performer abuse | Original visuals or no media, no voice/rebroadcast; operator on duty and reviewed restricted rollout; stop event/contact on coverage loss |
| Dating | Underage/unknown admission, coercion, sexual harassment, stalking, involuntary presence or preference disclosure | Reviewed18+ proof and separate opt-in consent, isolated audience, invisible activity, mutual matching and easy leave/block/report; staffed/legal/operator gates; never public by code completion |

Stricter closure remains representable: silent channels and no-media fallback are valid. World flags and staff coverage remain independent gates. Guests have unknown age; self-attestation is not sufficient. No identity documents or sensitive verification data are collected by this slice.

## Categories, severity and decision boundaries

| Category | Initial triage | Signals and containment |
|---|---|---|
| Harassment | Medium | Repeated unwanted contact/targeted insults; deny offending delivery and preserve minimal report reference |
| Hate/discrimination | High | Targeted protected-class abuse; hold/reject delivery, human contextual review |
| Threats | Critical | Credible threat indicators; contain contact and route to trained safety lead |
| Sexual content | High | Unwanted sexual material or roleplay requests; deny delivery; no adult-world exemption to baseline |
| Child safety | Critical | Unknown/underage restricted access or exploitation indicators; deny access/contact and restricted safety review |
| Privacy/doxxing | High | Personal data, location or confidential context disclosure; prevent broadcast and restrict evidence access |
| Impersonation | Medium | Claimed staff/system identity, deceptive service role; authority remains server-issued |
| Spam | Low | Bulk/repeated content or quick-action floods; shared bounded limits, no broadcast before checks |
| Media rights | Medium | Unlicensed material; stop media surface and request owner rights review |
| Staff abuse | High | Unauthorized case access, evidence export or sanction misuse; independent review and remove affected privilege when authorized |
| Consent violation | High | Continued contact after refusal/block, pressured role/date participation; stop interaction and preserve scoped evidence |
| Self-harm concern | Critical | Imminent-risk indicators; minimize audience and route to trained safety lead under approved incident protocol |

These are triage defaults, not user-selected sanction authority or a classifier result. Unverified reports can be mistaken or malicious. Ambiguous language, Vietnamese slang, unaccented text, Unicode/zero-width variants and contextual quotes require false-positive fixtures and human review. A blacklist alone is insufficient. An unreviewed AI classification never automatically bans an account. Reject/hold an unsafe or uncertain message before delivery; do not broadcast and retract later. Rate-denial/transport protection is distinct from a formal account sanction.

## Incident and outage workflow

1. Validate auth, membership/access, schema, size and shared rate/queue budgets before accepting content. Normalize for inspection while retaining only the minimum protected evidence if justified. Filter bilateral blocks and recipient context again before delivery. Unknown policy/decision fails closed.
2. Return truthful accepted/rejected/pending receipts. Rejection, moderation timeout, policy change or capacity loss must not produce a successful broadcast. When moderation is unavailable, use only server-authored approved canned IDs if that context permits them; otherwise deny. A client cannot choose fallback free text, and the server must not silently replace a person's rejected text with a different canned utterance.
3. On report: authenticate reporter, validate subject/context/reference, cap note/reference counts, freeze the minimal necessary evidence privately and issue a random receipt. Never put reporter identity, notes or evidence in room events, target notices, analytics or general logs. Duplicate requests remain idempotent; counters do not establish guilt.
4. Triage into assigned cases. Draft engineering targets: critical15min, high60min, medium24h, low72h. They are not response guarantees: operator/safety/privacy owners are currently unassigned, no on-call exists and public activation remains denied.
5. An assigned moderator reviews context and records category, reason and evidence reference. Critical cases and suspected staff abuse go to an independent safety lead. Contain the specific unsafe surface using an authorized mute/eject/kill switch; preserve essential activity as interrupted, not completed. Coverage loss closes higher-risk contact/event surfaces. No external notifications are automatic; approved incident contacts/process must be supplied before release.
6. Notify the target of the controlled action/reason/expiry and appeal receipt without revealing reporter or private peer context. Preserve access needed to appeal/export appropriate own data. Reviewers do not inspect unassigned evidence out of curiosity.
7. Independent review can uphold, shorten, change or revoke. Reversal does not restore a blocked friendship or previously declined consent. Test expiry, revoke, retry, session reconnect and future travel to prevent bypass. Close the case and run verified retention/deletion jobs once implemented.

## Sanctions, permissions and appeals

Warn → mute → room eject → world ban → platform ban are available policy categories, not an automatic escalation counter. Draft maximums are mute24h, world ban168h, temporary platform ban720h. A permanent ban needs safety-admin authorization plus independent review; no client/body/costume/world staff role grants either permission. Every formal action needs a reason, protected evidence reference, authorizing actor/scope, effective/expiry time and append-only audit entry. State transitions are proposed → authorized active → expired/revoked, with non-destructive history; M08-04 implements and tests them.

Moderators are limited to assigned cases and permitted world scope. Safety administrators may authorize broader action only through audited workflows. Privacy owners handle retention/DSR decisions; infrastructure access is not permission to read case content. Break-glass access needs a recorded purpose and independent after-review. None of these staff identities/permissions are provisioned in this task.

Draft appeal window30days and review target72h need owner/contact/coverage review. An appeal uses a private receipt and an independent reviewer, and may challenge false positives or evidence context. Do not expose an unstaffed public appeal form or promise resolution until the intake, RBAC and operational contact exist.

## Data minimization and retention draft

| Data | Local policy target | Implementation/review status |
|---|---|---|
| Ordinary or rejected raw chat | 0h persisted by default | No raw chat table; M08-02 pipeline is ephemeral; future report evidence is a separate justified exception |
| Report snapshot | At most5 message references and1,000 note characters;30days | Encrypted at rest, assigned-case access, reporter confidentiality and purge job required in M08-03/06 |
| Case metadata | 90days | No runtime store yet; minimize account linkage and free text |
| Audit metadata | 180days | No raw evidence/body in audit; append-only history plus reviewed identity redaction policy required |
| Appeal metadata | 90days | Private receipt and independent review, not a public feed |
| Approved legal/safety hold | Explicit purpose/authorized scope; review at least every30days | No automatic indefinite hold; owner-reviewed process required |

These draft limits align the existing30day evidence target in ANALYTICS. They are not active retention jobs, a legal basis or a public privacy promise. Holds do not silently become permanent retention. Identity deletion must later unlink/redact identities where required while preserving only reviewed necessary safety metadata; do not simply cascade-delete evidence to defeat an investigation, and do not claim the existing identity export already includes unimplemented safety data. Evidence encryption keys, retention/contact review and authorized operator identities are external release gates, not reasons to stop independent local implementation.

## Verification handoff

`SafetyPolicySchema` is strict and versioned. Tests load the actual JSON, require every category/product context and bounded retention/escalation target, and reject fail-open fallback, reporter disclosure, unreviewed classifier sanctions, raw chat storage, missing child-safety coverage, slower critical triage, overlong temporary bans and adult/staff/privacy bypasses. Safe closure/no-media choices remain valid. It validates policy definitions only; separate M08-02 verification covers the gated chat runtime. Report/moderator runtime remains pending.

M08-02 consumes these rules through authenticated server commands and test allowed/denied delivery, expiry/revoke, block projections, flood/quick-chat limits, Vietnamese/Unicode normalization and moderation outage before any broadcast. M08-03..06 add confidential reporting/evidence/RBAC, cross-world sanction/appeal enforcement, moderator controls and retention/false-positive/recovery tests. W1 cannot release without those results.
