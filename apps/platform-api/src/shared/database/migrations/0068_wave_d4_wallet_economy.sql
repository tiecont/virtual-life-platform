-- Wave D4 four-resource wallet and economy policy authority.
-- Coins remain canonically owned by pet_wave_one_players.coins (never duplicated).
-- All economy policy numbers are PostgreSQL-authored and immutable per published version.
CREATE TABLE pet_wallet_accounts (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 premium_diamonds bigint NOT NULL DEFAULT 0 CHECK (premium_diamonds >= 0),
 luminous_stones bigint NOT NULL DEFAULT 0 CHECK (luminous_stones >= 0),
 energy_current integer NOT NULL DEFAULT 0 CHECK (energy_current >= 0),
 energy_updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE pet_economy_policy (
 version bigint PRIMARY KEY CHECK (version BETWEEN 1 AND 9007199254740991),
 energy_max integer NOT NULL CHECK (energy_max BETWEEN 1 AND 10000),
 energy_regen_seconds integer NOT NULL CHECK (energy_regen_seconds BETWEEN 10 AND 86400),
 activity_energy_cost integer NOT NULL CHECK (activity_energy_cost BETWEEN 0 AND 1000),
 diamond_to_luminous_stone_rate integer NOT NULL CHECK (diamond_to_luminous_stone_rate = 1),
 first_clear_luminous_stones integer NOT NULL CHECK (first_clear_luminous_stones BETWEEN 0 AND 1000000),
 boss_first_clear_luminous_stones integer NOT NULL CHECK (boss_first_clear_luminous_stones BETWEEN 0 AND 1000000),
 gacha_single_cost_coins integer NOT NULL CHECK (gacha_single_cost_coins BETWEEN 1 AND 1000000),
 gacha_single_cost_luminous_stones integer NOT NULL CHECK (gacha_single_cost_luminous_stones BETWEEN 1 AND 1000000),
 gacha_disclosure jsonb NOT NULL CHECK (jsonb_typeof(gacha_disclosure) = 'object' AND octet_length(gacha_disclosure::text) BETWEEN 2 AND 16384),
 reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 256 AND reason = btrim(reason)),
 published_by text NOT NULL CHECK (length(published_by) BETWEEN 1 AND 256 AND published_by = btrim(published_by)),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE pet_economy_policy_active (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 version bigint NOT NULL REFERENCES pet_economy_policy(version),
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 256 AND updated_by = btrim(updated_by)),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE pet_economy_policy_audit (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 version bigint NOT NULL REFERENCES pet_economy_policy(version),
 action text NOT NULL CHECK (action IN ('publish','rollback')),
 actor text NOT NULL CHECK (length(actor) BETWEEN 1 AND 256 AND actor = btrim(actor)),
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$') UNIQUE,
 payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
 reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 256 AND reason = btrim(reason)),
 before_version bigint REFERENCES pet_economy_policy(version),
 after_version bigint NOT NULL REFERENCES pet_economy_policy(version),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 32768),
 result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 32768),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 previous_hash text NOT NULL CHECK (previous_hash ~ '^[a-f0-9]{64}$'),
 event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX pet_economy_policy_audit_version ON pet_economy_policy_audit(version, sequence DESC);

CREATE TABLE pet_wallet_ledger (
 id uuid PRIMARY KEY,
 sequence bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK (kind = 'diamond_to_stone_conversion'),
 delta_energy integer NOT NULL,
 delta_premium_diamonds bigint NOT NULL,
 delta_coins bigint NOT NULL,
 delta_luminous_stones bigint NOT NULL,
 balance_after jsonb NOT NULL CHECK (jsonb_typeof(balance_after) = 'object' AND octet_length(balance_after::text) <= 4096),
 receipt jsonb CHECK (receipt IS NULL OR (jsonb_typeof(receipt) = 'object' AND octet_length(receipt::text) <= 8192)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (account_id, request_id)
);
CREATE INDEX pet_wallet_ledger_account ON pet_wallet_ledger(account_id, sequence DESC);

CREATE FUNCTION pet_economy_policy_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Economy policy history and audit entries are immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER pet_economy_policy_immutable BEFORE UPDATE OR DELETE ON pet_economy_policy FOR EACH ROW EXECUTE FUNCTION pet_economy_policy_immutable();
CREATE TRIGGER pet_economy_policy_audit_immutable BEFORE UPDATE OR DELETE ON pet_economy_policy_audit FOR EACH ROW EXECUTE FUNCTION pet_economy_policy_immutable();

CREATE FUNCTION pet_economy_policy_active_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'Active economy policy selection cannot be deleted' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.revision <> 1 THEN
   RAISE EXCEPTION 'Active economy policy must start at revision one' USING ERRCODE = '23514';
  END IF;
 ELSIF NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'Active economy policy revision must advance by one' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pet_economy_policy_active_guard BEFORE INSERT OR UPDATE OR DELETE ON pet_economy_policy_active FOR EACH ROW EXECUTE FUNCTION pet_economy_policy_active_guard();

-- Wallet ledger is append-only; only account deletion cascade (after
-- identity_accounts parent row deletion) is permitted to prune its rows.
CREATE FUNCTION pet_wallet_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  RAISE EXCEPTION 'Wallet ledger entries are immutable' USING ERRCODE = '23514';
 END IF;
 IF EXISTS (SELECT 1 FROM identity_accounts WHERE id = OLD.account_id) THEN
  RAISE EXCEPTION 'Wallet ledger entries are retained for active accounts' USING ERRCODE = '23514';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER pet_wallet_ledger_immutable BEFORE UPDATE OR DELETE ON pet_wallet_ledger FOR EACH ROW EXECUTE FUNCTION pet_wallet_ledger_immutable();

REVOKE ALL ON pet_wallet_accounts,pet_economy_policy,pet_economy_policy_active,pet_economy_policy_audit,pet_wallet_ledger FROM PUBLIC;
REVOKE ALL ON SEQUENCE pet_economy_policy_audit_sequence_seq,pet_wallet_ledger_sequence_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION pet_economy_policy_immutable(),pet_economy_policy_active_guard(),pet_wallet_ledger_immutable() FROM PUBLIC;
