ALTER TABLE engine_progression_ledger ADD CONSTRAINT progression_grant_amount_owner UNIQUE(id,account_id,xp);
CREATE TABLE engine_progression_corrections (
 id uuid PRIMARY KEY, creation_order bigserial UNIQUE NOT NULL,
 ledger_id uuid NOT NULL UNIQUE, account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 revoked_xp integer NOT NULL CHECK(revoked_xp BETWEEN 1 AND 2),
 reason_code text NOT NULL CHECK(reason_code IN ('incorrect-source','policy-error','duplicate-import')),
 operator_key text NOT NULL, fingerprint text NOT NULL, created_at timestamptz NOT NULL,
 FOREIGN KEY(ledger_id,account_id,revoked_xp) REFERENCES engine_progression_ledger(id,account_id,xp) ON DELETE CASCADE
);
CREATE INDEX progression_correction_account ON engine_progression_corrections(account_id,creation_order);
CREATE TRIGGER progression_correction_immutable BEFORE UPDATE OR TRUNCATE ON engine_progression_corrections FOR EACH STATEMENT EXECUTE FUNCTION progression_no_update();
