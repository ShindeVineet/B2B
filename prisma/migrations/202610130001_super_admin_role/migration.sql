-- Add super_admin as a new enum value to the Role type
-- This must be done before any existing enum values to preserve enum ordering.
-- We use a safe additive ALTER TYPE approach.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'super_admin';
