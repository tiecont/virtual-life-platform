ALTER TABLE engine_hospitality_mutations DROP CONSTRAINT engine_hospitality_mutations_operation_check;
ALTER TABLE engine_hospitality_mutations ADD CHECK(operation IN ('place','claim','cancel','prepare','ready','serve','complete','refuse','withdraw'));
ALTER TABLE engine_hospitality_shifts DROP CONSTRAINT engine_hospitality_shifts_reason_check;
ALTER TABLE engine_hospitality_shifts ADD CHECK(reason IN ('voluntary','disconnected','visit-ended','restart','expired','restricted'));
ALTER TABLE engine_hospitality_orders ADD COLUMN checked_order bigint NOT NULL DEFAULT 0;
CREATE TABLE engine_hospitality_refusals (
 order_id uuid NOT NULL REFERENCES engine_hospitality_orders(id) ON DELETE CASCADE,
 staff_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL, PRIMARY KEY(order_id,staff_id)
);
