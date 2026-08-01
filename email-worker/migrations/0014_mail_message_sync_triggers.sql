CREATE TRIGGER messages_sync_after_insert
AFTER INSERT ON messages
BEGIN
  INSERT INTO message_sync_events(mailbox_id, message_id, operation, created_at)
  VALUES (
    NEW.mailbox_id,
    NEW.id,
    'upsert',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER messages_sync_after_update
AFTER UPDATE OF
  folder, provider_message_id, internet_message_id, from_address,
  envelope_from_address, to_json, cc_json, subject, text_body, in_reply_to,
  references_json, status, error_code, received_at, sent_at, is_read,
  is_starred, is_important, archived_at, snoozed_until, spam_at, trashed_at,
  category
ON messages
BEGIN
  INSERT INTO message_sync_events(mailbox_id, message_id, operation, created_at)
  VALUES (
    NEW.mailbox_id,
    NEW.id,
    'upsert',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;

CREATE TRIGGER messages_sync_after_delete
AFTER DELETE ON messages
BEGIN
  INSERT INTO message_sync_events(mailbox_id, message_id, operation, created_at)
  VALUES (
    OLD.mailbox_id,
    OLD.id,
    'delete',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
END;
