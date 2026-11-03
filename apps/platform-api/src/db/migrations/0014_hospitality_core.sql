CREATE TABLE engine_hospitality_orders (
 id uuid PRIMARY KEY, creation_order bigserial UNIQUE NOT NULL,
 customer_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE,
 assignee_id uuid REFERENCES identity_accounts(id) ON DELETE CASCADE,
 world_slug text NOT NULL, room_id uuid NOT NULL, customer_epoch uuid NOT NULL, customer_membership_id uuid NOT NULL,
 item_key text NOT NULL, policy_version text NOT NULL,
 phase text NOT NULL CHECK(phase IN ('PENDING','ASSIGNED','PREPARING','READY','SERVED','COMPLETED','CANCELLED')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
 CHECK(assignee_id IS NULL OR assignee_id<>customer_id),
 CHECK((phase IN ('PENDING','CANCELLED') AND assignee_id IS NULL) OR (phase IN ('ASSIGNED','PREPARING','READY','SERVED','COMPLETED') AND assignee_id IS NOT NULL))
);
CREATE UNIQUE INDEX hospitality_one_active_customer ON engine_hospitality_orders(customer_id) WHERE phase NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX hospitality_room_queue ON engine_hospitality_orders(room_id,creation_order) WHERE phase NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX hospitality_assignee ON engine_hospitality_orders(assignee_id) WHERE phase IN ('ASSIGNED','PREPARING','READY');
CREATE TABLE engine_hospitality_mutations (
 actor_id uuid NOT NULL REFERENCES identity_accounts(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES engine_hospitality_orders(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('place','claim','cancel')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
