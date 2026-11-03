# Content and social safety contract

No sexual content, harassment, threats, doxxing, impersonation, discrimination, spam or compelled roleplay. Customer/Maid roles are voluntary and not moderator authority. Players can leave, refuse service, mute, block and report. World rules may be stricter: Deadline/Library silent; Lounge text/visual-only if media rights absent; adult dating isolated and never public by default.

Pipeline required before public social release: authenticate → schema/rate/membership/access checks → policy/moderation → allowed recipient filtering → broadcast. Unsafe text must not broadcast before checks. Use normalization, allowlists where appropriate, human escalation and appeal; a regex blacklist alone is insufficient. No raw public chat logs by default. Reports preserve minimum necessary evidence in a restricted queue; actions need scoped RBAC and append-only audit. Confidential reporter identity is never a room event.

Only original, owned, public-domain or explicitly licensed assets/media/materials. Each shipped asset needs source, creator, rights, dimensions/frame metadata and attribution. No anime/game sprites copied from third parties. No user photo/audio/video/DM/upload surface in baseline. Library ships no copyrighted books without permission. Lounge has no unlicensed soundtrack/rebroadcast.

Dating release checklist: effective reviewed 18+ pathway; separate opt-in profile/consent; invisible-to-friends presence; mutual match; leave/block/report; staffed moderation and appeal; legal/operator review; flag OFF until all gates and explicit approval. Self-attestation alone is insufficient.

Public release signoff: named operator and coverage, approved age/privacy/retention/contact, asset rights, security/a11y checks, backup restore, monitoring/incident drill, rollout/rollback owner, explicit authorization. All currently pending. Legal compliance is not certified by this plan.

The detailed [M08 threat model and escalation contract](SAFETY-THREAT-MODEL.md) maps current enforcement to required runtime work. `config/safety-policy.json` is a strict versioned draft, not an activation switch or evidence that moderation is operating. M08-02 now supplies a default-OFF development/test-only [ephemeral chat backend](../architecture/CHAT-SAFETY.md), including pre-broadcast validation/moderation and fresh block filtering. Reports, formal mute/sanctions, appeals and moderator workflows remain M08-03..06. Public chat/release and coverage/retention approvals remain false.
