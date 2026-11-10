CREATE TABLE engine_progression_appearance (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 outfit text NOT NULL CHECK(outfit IN ('casual','cafe-apron')),
 changed_at timestamptz NOT NULL
);
CREATE TABLE engine_progression_appearance_mutations (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, fingerprint text NOT NULL, created_at timestamptz NOT NULL,
 PRIMARY KEY(account_id,request_id)
);
