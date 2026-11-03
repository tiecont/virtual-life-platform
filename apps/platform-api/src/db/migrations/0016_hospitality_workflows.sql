ALTER TABLE engine_hospitality_orders ADD COLUMN workflow jsonb,
 ADD COLUMN course_index integer NOT NULL DEFAULT 0,
 ADD COLUMN ready_at timestamptz;
ALTER TABLE engine_hospitality_orders ADD CONSTRAINT hospitality_workflow_state CHECK(
 (workflow IS NULL AND course_index=0 AND ready_at IS NULL) OR
 (workflow IS NOT NULL AND jsonb_typeof(workflow)='object' AND workflow->>'kind'='timed-courses'
 AND jsonb_typeof(workflow->'courses')='array' AND jsonb_array_length(workflow->'courses') BETWEEN 1 AND 5
 AND course_index>=0 AND course_index<jsonb_array_length(workflow->'courses')
 AND ((phase IN ('PREPARING','READY') AND ready_at IS NOT NULL) OR (phase NOT IN ('PREPARING','READY') AND ready_at IS NULL)))
);
ALTER TABLE engine_hospitality_mutations DROP CONSTRAINT engine_hospitality_mutations_operation_check;
ALTER TABLE engine_hospitality_mutations ADD CHECK(operation IN ('place','claim','cancel','prepare','ready','serve'));
CREATE TABLE engine_hospitality_courses (
 order_id uuid NOT NULL REFERENCES engine_hospitality_orders(id) ON DELETE CASCADE,
 course_index integer NOT NULL CHECK(course_index BETWEEN 0 AND 4), course_key text NOT NULL,
 served_at timestamptz NOT NULL, order_version integer NOT NULL CHECK(order_version>0),
 PRIMARY KEY(order_id,course_index)
);
