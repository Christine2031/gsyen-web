ALTER TABLE dead_letter_events ADD COLUMN replay_claimed_at TEXT;

CREATE INDEX dead_letter_events_replay_claim
  ON dead_letter_events(status, replay_claimed_at);
