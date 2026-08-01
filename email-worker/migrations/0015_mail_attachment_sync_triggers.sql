CREATE TRIGGER attachments_sync_after_insert
AFTER INSERT ON attachments
BEGIN
  INSERT INTO message_sync_events (mailbox_id, message_id, operation, created_at)
  VALUES ((SELECT mailbox_id FROM messages WHERE id = NEW.message_id), NEW.message_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER attachments_sync_after_delete
AFTER DELETE ON attachments
WHEN EXISTS (SELECT 1 FROM messages WHERE id = OLD.message_id)
BEGIN
  INSERT INTO message_sync_events (mailbox_id, message_id, operation, created_at)
  VALUES ((SELECT mailbox_id FROM messages WHERE id = OLD.message_id), OLD.message_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER attachments_sync_after_message_move_old
AFTER UPDATE OF message_id ON attachments
WHEN OLD.message_id <> NEW.message_id
BEGIN
  INSERT INTO message_sync_events (mailbox_id, message_id, operation, created_at)
  VALUES ((SELECT mailbox_id FROM messages WHERE id = OLD.message_id), OLD.message_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER attachments_sync_after_message_move_new
AFTER UPDATE OF message_id ON attachments
WHEN OLD.message_id <> NEW.message_id
BEGIN
  INSERT INTO message_sync_events (mailbox_id, message_id, operation, created_at)
  VALUES ((SELECT mailbox_id FROM messages WHERE id = NEW.message_id), NEW.message_id, 'upsert', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
