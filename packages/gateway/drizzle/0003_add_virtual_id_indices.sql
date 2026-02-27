-- Add critical indices for virtual_id_mappings table
-- These indices are REQUIRED for:
-- 1. Performance: Prevent full table scans on lookups
-- 2. Race condition prevention: UNIQUE constraints ensure no duplicates
-- 3. Data integrity: Enforce one virtual ID per real ID combination

-- Index for reverse email lookup (createVirtualEmailId)
-- UNIQUE constraint prevents race condition when multiple threads try to create same mapping
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_reverse
  ON virtual_id_mappings(type, real_account_id, provider_entity_id)
  WHERE type = 'email' AND provider_entity_id IS NOT NULL;

-- Index for reverse account lookup (createVirtualAccountId)
-- UNIQUE constraint ensures one virtual account ID per real account
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_reverse
  ON virtual_id_mappings(type, real_account_id)
  WHERE type = 'account';

-- Index for forward lookups (resolveVirtualEmailId, resolveVirtualAccountId)
-- Composite index on (virtual_id, type) for fast resolution
CREATE INDEX IF NOT EXISTS idx_virtual_type
  ON virtual_id_mappings(virtual_id, type);
