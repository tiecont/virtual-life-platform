ALTER TABLE engine_hospitality_shifts ADD COLUMN role_key text NOT NULL DEFAULT 'staff' CHECK(role_key ~ '^[a-z][a-z0-9-]{0,63}$');
CREATE TABLE engine_hospitality_consent (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0)
);
ALTER TABLE engine_hospitality_shift_mutations DROP CONSTRAINT engine_hospitality_shift_mutations_operation_check;
ALTER TABLE engine_hospitality_shift_mutations ADD CONSTRAINT engine_hospitality_shift_mutations_operation_check CHECK(operation IN ('start','end','role'));
