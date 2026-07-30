-- Gmail-like mailbox normalization:
-- 1) 同一用户名去点等价（a.b == ab）只允许单一邮箱名
-- 2) 兼容历史数据：补齐 canonical_local_part 并建立唯一约束

ALTER TABLE mailboxes
  ADD COLUMN canonical_local_part TEXT COLLATE NOCASE;

ALTER TABLE mailbox_addresses
  ADD COLUMN canonical_local_part TEXT COLLATE NOCASE;

UPDATE mailboxes
  SET canonical_local_part = REPLACE(LOWER(local_part), '.', '');

UPDATE mailbox_addresses
  SET canonical_local_part = REPLACE(LOWER(local_part), '.', '');

CREATE UNIQUE INDEX IF NOT EXISTS mailboxes_canonical_local_part
  ON mailboxes(canonical_local_part);

CREATE UNIQUE INDEX IF NOT EXISTS mailbox_addresses_canonical_local_part
  ON mailbox_addresses(canonical_local_part);
