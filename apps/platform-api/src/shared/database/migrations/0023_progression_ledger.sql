CREATE TABLE engine_progression_ledger (
 id uuid PRIMARY KEY, creation_order bigserial UNIQUE NOT NULL,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 source_kind text NOT NULL CHECK(source_kind IN ('focus-completed','hospitality-completed')),
 source_id uuid NOT NULL, world_slug text NOT NULL,
 xp integer NOT NULL CHECK(xp BETWEEN 1 AND 2),
 completed_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL CHECK(recorded_at>=completed_at),
 policy_version text NOT NULL, UNIQUE(account_id,source_kind,source_id)
);
CREATE INDEX progression_account_day ON engine_progression_ledger(account_id,completed_at);
CREATE TABLE engine_progression_partners (
 ledger_id uuid PRIMARY KEY REFERENCES engine_progression_ledger(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 partner_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 completed_at timestamptz NOT NULL, CHECK(account_id<>partner_id)
);
CREATE INDEX progression_partner_day ON engine_progression_partners(account_id,partner_id,completed_at);
CREATE TABLE engine_progression_entitlements (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 cosmetic_key text NOT NULL CHECK(cosmetic_key IN ('casual','cafe-apron')),
 granted_at timestamptz NOT NULL, PRIMARY KEY(account_id,cosmetic_key)
);
CREATE FUNCTION progression_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Progression history is append only' USING ERRCODE='55000'; END;
$$;
CREATE TRIGGER progression_immutable BEFORE UPDATE OR TRUNCATE ON engine_progression_ledger FOR EACH STATEMENT EXECUTE FUNCTION progression_no_update();
