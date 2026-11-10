ALTER TABLE travel_intents ADD COLUMN target_room_id uuid;
ALTER TABLE travel_intents ADD COLUMN target_membership_id uuid;
ALTER TABLE travel_intents ADD CONSTRAINT travel_commit_target CHECK(
  (phase='COMMITTED' AND target_room_id IS NOT NULL AND target_membership_id IS NOT NULL)
  OR (phase<>'COMMITTED' AND target_room_id IS NULL AND target_membership_id IS NULL)
);
