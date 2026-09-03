-- Default command prefix moves from 'c!' to 'a!'.
--
-- Only the column default changes. Rows already present keep whatever prefix
-- their guild configured or inherited: rewriting them would silently change the
-- prefix under servers that never asked for it, and any guild that had
-- deliberately set 'c!' would lose that choice.

ALTER TABLE "guild_configs" ALTER COLUMN "prefix" SET DEFAULT 'a!';
