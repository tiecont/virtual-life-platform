ALTER TABLE engine_hospitality_mutations DROP CONSTRAINT engine_hospitality_mutations_operation_check;
ALTER TABLE engine_hospitality_mutations ADD CHECK(operation IN ('place','claim','cancel','prepare','ready','serve','complete'));
CREATE TABLE engine_hospitality_completions (
 id uuid PRIMARY KEY, order_id uuid UNIQUE NOT NULL REFERENCES engine_hospitality_orders(id) ON DELETE CASCADE,
 completed_at timestamptz NOT NULL
);
CREATE TABLE engine_hospitality_outbox (
 event_id uuid PRIMARY KEY REFERENCES engine_hospitality_completions(id) ON DELETE CASCADE,
 creation_order bigserial UNIQUE NOT NULL
);
CREATE TABLE engine_hospitality_deliveries (
 event_id uuid NOT NULL REFERENCES engine_hospitality_outbox(event_id) ON DELETE CASCADE,
 consumer_key text NOT NULL CHECK(consumer_key ~ '^[a-z][a-z0-9-]{0,63}$'),
 delivered_at timestamptz NOT NULL, PRIMARY KEY(event_id,consumer_key)
);
CREATE TABLE engine_hospitality_delivery_retries (
 event_id uuid NOT NULL REFERENCES engine_hospitality_outbox(event_id) ON DELETE CASCADE,
 consumer_key text NOT NULL CHECK(consumer_key ~ '^[a-z][a-z0-9-]{0,63}$'),
 attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 30), next_at timestamptz NOT NULL,
 PRIMARY KEY(event_id,consumer_key)
);
