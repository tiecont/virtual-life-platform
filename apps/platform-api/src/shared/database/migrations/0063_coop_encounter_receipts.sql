-- Keep historical receipts readable; subsequent settlements record their
-- per-participant campaign progression in the existing immutable reward row.
ALTER TABLE coop_settlement_rewards
 ADD COLUMN materials integer NOT NULL DEFAULT 0 CHECK (materials BETWEEN 0 AND 1000000),
 ADD COLUMN first_clear boolean NOT NULL DEFAULT false;
