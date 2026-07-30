ALTER TABLE object_deletion_jobs
  ADD COLUMN next_attempt_at TEXT NOT NULL
  DEFAULT '1970-01-01T00:00:00.000Z';

DROP INDEX object_deletion_jobs_created;

CREATE INDEX object_deletion_jobs_due
  ON object_deletion_jobs(next_attempt_at, created_at);
