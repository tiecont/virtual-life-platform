# Local progression correction procedure

No public correction endpoint or real operator is configured. The implemented operation is `ProgressionService.correct(operatorLabel,input)` for a reviewed trusted process. Operator labels never authenticate a client. Trusted composition registers at most8stable labels after operational authorization; default is empty, independently of reward enablement.

1. Establish the affected account and its own immutable progression grant ID from authorized private records. Confirm the source was incorrect. Refusal, reporting, blocking or sanction alone is not a reason to deduct legitimate XP.
2. Review the concrete account/grant target. Record one fresh UUID request ID and reason incorrect-source, policy-error or duplicate-import. There is no amount field.
3. In the authorized process call correct with schemaVersion1,accountId,grantId,requestId,reason. Preserve the exact ID/input for retries, including an ambiguous COMMIT response. Another key for an already corrected grant conflicts.
4. Confirm one receipt, unchanged positive grant, effective private balance and entitlement. Own export includes the correction. Saved apron selection can remain while fresh snapshots render casual; room refresh may take15seconds plus transport/queue delays.
5. Resolve transaction failures before retrying the same reviewed command. Never manually edit the ledger, deduct again or free a source/day budget. Removing operator registration fails correction calls closed while private reads remain available.

Migration0025 is additive. Keep history on feature rollback and use authorized account erasure for deletion. No undo/restore operator UI, public reward administration, automatic sanction deduction, real staff provisioning or production approval is supplied by this runbook. Tests use registered synthetic operators and disposable PostgreSQL.
