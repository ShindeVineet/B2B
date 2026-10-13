ALTER TABLE "partners" ADD COLUMN "additional_contacts" JSONB NOT NULL DEFAULT '[]'::jsonb;
