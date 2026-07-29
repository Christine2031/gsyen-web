ALTER TABLE messages ADD COLUMN client_request_id TEXT;

CREATE UNIQUE INDEX messages_outbound_idempotency
  ON messages(mailbox_id, client_request_id)
  WHERE direction = 'outbound' AND client_request_id IS NOT NULL;
