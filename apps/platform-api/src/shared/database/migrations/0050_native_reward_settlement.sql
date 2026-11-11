-- Platform-owned settlement results. The native command role only appends proposals.
ALTER TABLE game_native_outbox ADD COLUMN delivery_outcome text
 CHECK (delivery_outcome IS NULL OR (delivered_at IS NOT NULL AND delivery_outcome IN ('granted','declined')));

CREATE TABLE platform_native_reward_inbox (
 settlement_id uuid PRIMARY KEY,
 event_id uuid NOT NULL UNIQUE,
 outcome text NOT NULL CHECK (outcome IN ('granted','declined')),
 processed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE platform_native_reward_ledger (
 settlement_id uuid PRIMARY KEY REFERENCES platform_native_reward_inbox(settlement_id),
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 reward_key text NOT NULL CHECK (reward_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_native_reward_account ON platform_native_reward_ledger(account_id);
CREATE TRIGGER platform_native_reward_immutable BEFORE UPDATE OR TRUNCATE ON platform_native_reward_ledger
 FOR EACH STATEMENT EXECUTE FUNCTION progression_no_update();
