CREATE TABLE restricted_dating_profiles (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0), active boolean NOT NULL DEFAULT false,
 key_id text, iv bytea, tag bytea, ciphertext bytea,
 changed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>changed_at),
 CHECK((active AND key_id IS NOT NULL AND octet_length(iv)=12 AND octet_length(tag)=16 AND octet_length(ciphertext) BETWEEN 1 AND 2048)
 OR (NOT active AND key_id IS NULL AND iv IS NULL AND tag IS NULL AND ciphertext IS NULL))
);
CREATE INDEX dating_profiles_expiry ON restricted_dating_profiles(expires_at,account_id);
CREATE TABLE restricted_dating_profile_mutations (
 account_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('save','withdraw')), fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL, PRIMARY KEY(account_id,request_id)
);
CREATE INDEX dating_profile_mutation_expiry ON restricted_dating_profile_mutations(created_at,account_id,request_id);
-- Guarded disposable-test proof metadata only. No provider/issuer endpoint or
-- real verification is installed. Production cannot enable this reader.
CREATE TABLE restricted_dating_test_eligibility (
 account_id uuid PRIMARY KEY REFERENCES identity_accounts(id) ON DELETE CASCADE,
 verified_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>verified_at AND expires_at<=verified_at+interval '24 hours'),
 revoked boolean NOT NULL DEFAULT false
);
