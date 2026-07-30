CREATE TABLE dead_letter_events (
  id TEXT PRIMARY KEY,
  source_queue TEXT NOT NULL,
  job_kind TEXT NOT NULL CHECK (job_kind IN ('send', 'reconcile', 'invalid')),
  message_id TEXT,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'replayed', 'resolved')),
  replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  resolution_code TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_replayed_at TEXT,
  resolved_at TEXT
);

CREATE INDEX dead_letter_events_status_seen
  ON dead_letter_events(status, last_seen_at DESC);

CREATE TABLE mail_operational_incidents (
  kind TEXT PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX mail_operational_incidents_status_seen
  ON mail_operational_incidents(status, last_seen_at DESC);
