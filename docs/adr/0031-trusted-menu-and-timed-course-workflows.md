# ADR0031: Trusted menus and timed course workflows

Status: Accepted local implementation. Date:2026-11-03.

M11-04 adds strict MenuPolicy and OrderWorkflowStrategy contracts to explicit hospitality policies. Item keys match the allowlist;each item resolves one unique registered workflow. The supported strategy is timed-courses with1..5 unique courses and server preparation duration1..300seconds each. Labels are bounded/control-character-free. No prices,inventory,payments,client recipes or evaluated minigame scores exist. Actual Maid minigames remain M16.

Store a validated workflow snapshot with each new menu order. In-flight orders keep course meaning across source edits/restart;commands still require the current trusted policy version and live origin context. Existing core orders without workflow remain privately readable/claimable/cancellable but cannot run fabricated service steps. Future workflow kinds extend the versioned schema and engine strategy;no duplicated world tables are needed.

POST orders/menu returns authorized visit-local catalog metadata. Assigned,current on-shift staff use prepare/ready/serve with strict source/expectedVersion/idempotency. prepare starts a trusted deadline;ready cannot occur early;serve writes one durable course ledger row and increments order version in the same transaction as its receipt. Intermediate courses return the same order to ASSIGNED;final course reaches SERVED. Completion/progression/outbox remain M11-05. Caller clocks,course indexes,scores,readyAt and workflow definitions reject.

Every new staff action checks the customer's original current membership,owned seat,attached unexpired/unrevoked session and world safety,plus bilateral block/current staff permission. Account locks serialize relationship/deletion races;room owner serializes seat/travel/withdrawal/safety activity. A private historical retry may observe state but cannot repeat a course or reactivate assignment. Course ledger primary keys prevent duplicate service. Receipt failure rolls back course insertion and phase/version changes.

Requeue clears readyAt but preserves course_index/completed course ledger. Replacement staff prepares only the unfinished course;old staff receipts cannot authorize more actions. Backward trusted time rejects mutations. No ticks,automatic readiness or final completion are written. Snapshot/export projects course progress without raw participant IDs or preparation recipes.

Migration0016 adds workflow/progress/ledger and updates allowed operations. Rollback preserves data and disables affected adapters. Three synthetic coffee,dining,mocktail fixtures verify one shared engine,not real world integrations. Evidence m11-workflows-checks.json distinguishes initial schema-red tests from working endpoints. M11-06 owns immediate refusal/safety reassignment and stranded-customer expiry/withdrawal. No public flag or legacy mutation occurred.
