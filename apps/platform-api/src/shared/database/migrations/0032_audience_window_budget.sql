-- Preserve rate budget across moderator clear/reopen actions in the same window.
ALTER TABLE engine_event_audience ADD COLUMN accepted_total smallint NOT NULL DEFAULT 0 CHECK(accepted_total BETWEEN 0 AND 20);
UPDATE engine_event_audience SET accepted_total=clap+star+wave;
ALTER TABLE engine_event_audience ADD CHECK(clap+star+wave<=accepted_total);
