# ADR0123 — Bounded operator calendar pagination

Status: accepted for local N07-03 implementation, 2026-11-06.

The calendar's first50 result cap prevented reviewing later retained drafts. Add an optional canonical decimal offset bounded to50000 and keep the existing strict drafts/truncated response. Both API and BFF validate the exact bounded query, reject duplicates and preserve fresh operator authority. The UI moves50 entries at a time, resets selection on date changes and retains expected-version guards for every mutation.

Ordering is scheduled start then immutable draft ID. Concurrent insertions or schedule edits can shift offset pages, so the UI requests refresh rather than claiming a snapshot cursor. No extra count query, arbitrary query language, cursor signing secret or new SQL migration is introduced. Existing account, privacy, publication/cancellation and runtime gates remain authoritative.

Qualification includes a real disposable PostgreSQL53-draft fixture, later-page versioned editing/conflict, malformed/duplicate query denial, desktop/mobile browser pagination and a separate restart with interactive operator credentials removed. These are synthetic local fixtures, not live scheduling or native-device evidence. Full task acceptance and actual command outcomes are in N07-03-ACCEPTANCE.json.
