ALTER TABLE engine_hospitality_mutations DROP CONSTRAINT engine_hospitality_mutations_operation_check;
ALTER TABLE engine_hospitality_mutations ADD CONSTRAINT engine_hospitality_mutations_operation_check CHECK(operation IN ('place','claim','cancel','prepare','ready','serve','complete','refuse','withdraw','pick-up'));
