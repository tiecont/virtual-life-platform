CREATE INDEX focus_account_completed ON engine_focus_sessions(account_id,changed_at) WHERE phase='completed';
