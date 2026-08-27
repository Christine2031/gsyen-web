ALTER TABLE messages
  ADD COLUMN raw_sha256 TEXT
    CHECK (
      raw_sha256 IS NULL
      OR (
        length(raw_sha256) = 64
        AND raw_sha256 NOT GLOB '*[^0-9a-f]*'
      )
    );

ALTER TABLE attachments
  ADD COLUMN sha256 TEXT
    CHECK (
      sha256 IS NULL
      OR (
        length(sha256) = 64
        AND sha256 NOT GLOB '*[^0-9a-f]*'
      )
    );

ALTER TABLE stalwart_mirror_outbox
  ADD COLUMN delivery_id TEXT
    CHECK (
      delivery_id IS NULL
      OR (
        length(delivery_id) = 64
        AND delivery_id NOT GLOB '*[^0-9a-f]*'
      )
    );

CREATE INDEX messages_inbound_raw_sha256
  ON messages(raw_sha256)
  WHERE direction = 'inbound' AND raw_sha256 IS NOT NULL;

CREATE INDEX attachments_sha256
  ON attachments(sha256)
  WHERE sha256 IS NOT NULL;

CREATE UNIQUE INDEX stalwart_mirror_outbox_delivery_id
  ON stalwart_mirror_outbox(delivery_id)
  WHERE delivery_id IS NOT NULL;
