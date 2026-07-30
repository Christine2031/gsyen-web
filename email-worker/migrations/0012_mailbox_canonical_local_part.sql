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

-- Preflight report for operators. The unique indexes below remain the hard stop:
-- if any rows are returned here, remediate the listed collisions before retrying.
SELECT 'mailboxes_duplicate_canonical_local_part' AS issue,
       canonical_local_part,
       GROUP_CONCAT(id) AS conflicting_ids,
       COUNT(*) AS conflict_count
  FROM mailboxes
 WHERE canonical_local_part IS NOT NULL
 GROUP BY canonical_local_part
HAVING COUNT(*) > 1;

SELECT 'mailbox_addresses_duplicate_canonical_local_part' AS issue,
       canonical_local_part,
       GROUP_CONCAT(address) AS conflicting_addresses,
       COUNT(*) AS conflict_count
  FROM mailbox_addresses
 WHERE canonical_local_part IS NOT NULL
 GROUP BY canonical_local_part
HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS mailboxes_canonical_local_part
  ON mailboxes(canonical_local_part);

CREATE UNIQUE INDEX IF NOT EXISTS mailbox_addresses_canonical_local_part
  ON mailbox_addresses(canonical_local_part);
