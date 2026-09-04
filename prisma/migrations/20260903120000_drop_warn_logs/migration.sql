-- Drops warn_logs.
--
-- The WarnLog model was declared in the schema and never used: no code path
-- writes a row and none reads one. Warnings are recorded in mod_logs like every
-- other sanction, which is where /case and the threshold counter look for them.
--
-- Dropping an empty table is safe here, but the IF EXISTS guard means this is
-- also a no-op on a database where it was already removed by hand.

DROP TABLE IF EXISTS "warn_logs";
