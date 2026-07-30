CREATE TABLE object_deletion_jobs (
  object_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX object_deletion_jobs_created
  ON object_deletion_jobs(created_at);
