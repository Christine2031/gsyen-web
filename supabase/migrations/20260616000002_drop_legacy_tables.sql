-- SAFETY QUARANTINE: these are active HalfSphere/shared-control-plane tables.
--
-- The original migration used DROP TABLE ... CASCADE after checking only the
-- gsyen-web source tree. HalfSphere still reads and writes these tables, while
-- SGSYEN still reads public.subscriptions. A fresh deployment must therefore
-- preserve them. Keep this migration version as an intentional no-op so that
-- existing migration ordering remains stable.
--
-- No shared table may be retired until both business owners have approved a
-- table-by-table export, reference audit, restore test, and rollback plan.

DO $migration$
BEGIN
  RAISE NOTICE '20260616000002 quarantined: preserving HalfSphere/shared tables';
END
$migration$;
