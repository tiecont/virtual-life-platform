# Game UX specification — shared Lodge shell

**Not a rendered mockup; wireframes and interaction states for implementation/playtest.** Art direction: cozy, original 2D Lantern Lodge, warm glowing lanterns, wood/cloth geometry, readable glyphs and restrained nonblocking animation. Owner 2026-11-06 requires landscape gameplay and modular animal characters, shared across Virtual Life; see [animal/landscape integration](08-ANIMAL-LANDSCAPE-ART.md). Do not reuse Party Animals characters/board assets. Existing avatar renderer/asset provenance apply until the new shared composer is verified.

## Player journey (minimize friction)

City map → Lodge → occupied/available tables → choose mode/table → explicit Ready → table scene → result (Rematch / Return to Lodge / Leave World). Invite does not force start or travel. A returning player to interrupted match sees Resume / Recovering / Aborted truthfully. A new player must see capacity and rules before ready.

### Desktop shell (schematic)

```text
┌────────────────────────── Lantern Lodge ───────────────────────────┐
│ Back to City | Friends | Quick Invite | My Avatar | Accessibility │
├────────────────────────────────────────────────────────────────────┤
│  TABLES        │               Current table                       │
│ Color 3/6      │  [Players + ready/turn indicators]                 │
│ Mask 5/6       │  ┌───────────── PUBLIC BOARD ─────────────┐       │
│ Routes 4/8     │  │ discard/pile OR map OR face-down cards │       │
│               │  └────────────────────────────────────────┘       │
│ Choose/Join    │  [YOUR HAND / YOUR ROLE / YOUR LEGAL ACTIONS]     │
│ Rules | Report │  [Confirm] [Leave] [Network state]                 │
└────────────────────────────────────────────────────────────────────┘
```

### Android landscape shell — primary gameplay

```text
┌──────────────────── Lantern Lodge / Your turn ──────────────────────┐
│ City / Safety     animal avatars + ready/turn state       Network  │
│                  PUBLIC BOARD / MAP / TABLE                         │
│                  clear selection / legal action                     │
│ Rules       YOUR HAND / YOUR ROLE       Cancel   Confirm     Leave │
└────────────────────────────────────────────────────────────────────┘
```

Use contextual drawers, safe-area insets and readable touch controls; the table remains visible. Both landscape directions, cutouts, keyboard and resize require real layout QA. Orientation does not reset a match or send a duplicate action.

### Android portrait fallback — accessible recovery and narrow windows

```text
┌──────────────────────┐
│← Lodge     Turn 00:24│
│ [avatars & counts]   │
│                      │
│   PUBLIC BOARD       │
│  scroll/pan/zoom     │
│                      │
│  YOUR CARDS/TILES    │
│ [‹] 1 2 3 4 [›]     │
│ [ACTION]  [CONFIRM]  │
│ Rule?   Leave  Report│
└──────────────────────┘
```

## Action policies

- Tap selects a card/tile, highlights eligible action and explains its effect. Confirm is explicit; no drag-only interaction. `Cancel` clears a local selection, never creates a server command.
- Show server-owned current turn, authoritative remaining time, current network status. Client timer is presentation only and resyncs after sleep/resume.
- Disconnected: freeze mutation controls; show `Trying to reconnect`; never reveal hidden state from another login. Reconnected: fetch authorized latest snapshot and reconcile pending request by requestId.
- Lobby full: explain available seats/next opening; world-level queue, table waitlist and room seat are not the same resource; MVP table may have no waitlist, so do not invent position.
- Timeout: announce server auto action; animations are idempotent and cancellable. Result: show winners/ties and public reason, but no hidden role if rules restrict post-match reveal.
- Report/block/leave controls remain accessible from every mode, including during animation or phase change. Do not display raw internal SQL/version/HTTP error in player UI.

## Accessibility / social safety

Use real DOM button semantics and labelled groups for hands, card colors with extra shapes/icons, adequate contrast, keyboard navigation, 44px touch targets where feasible, reduced motion and optional muted SFX. Screen reader should announce turn change, action result, score and deadline. Spectator mode OFF globally for MVP; future permitted spectators cannot interact with active turns. Quick emotes are server-filtered, not a bypass for blocked contacts.

## UX acceptance evidence

Minimum deliverables per game: desktop + Android screenshots of 8 states (lobby, ready, your turn, opponent turn, invalid selection, network recovering, match result, safety/leave); keyboard path; TalkBack spot check on physical Android; reduced motion; colorblind mode glyphs; 2–5 person moderated prototype session documenting what players misunderstood. A visual snapshot test cannot substitute actual playtesting.
