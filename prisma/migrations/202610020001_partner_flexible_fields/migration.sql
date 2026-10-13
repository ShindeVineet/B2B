-- Record the user-approved flexible fields already present in the local database.
-- Preserve existing values; do not drop columns, tables or the old enum type.
ALTER TABLE "partners"
  ALTER COLUMN "type_of_professional" TYPE TEXT USING "type_of_professional"::text,
  ALTER COLUMN "years_operating" TYPE TEXT USING "years_operating"::text,
  ALTER COLUMN "onboarded_from" DROP NOT NULL;
