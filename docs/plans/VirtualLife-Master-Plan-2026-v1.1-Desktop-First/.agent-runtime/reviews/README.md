# Independent Reviews

Agent 2 writes a review after reading the committed source and published handoff.
Required JSON fields: `taskId`, `reviewer: "agent2"`, `sourceRevision` (the handoff
commit), `handoffSha256`, `decision` (`APPROVED` or `CHANGES_REQUESTED`),
`reviewedAt` (UTC), and `findings` (empty only when no unresolved findings remain).
Include commands and actual outcomes when available. Do not edit live-state.
Agent 1 ingests an approved review with the scheduler after checking its provenance.
