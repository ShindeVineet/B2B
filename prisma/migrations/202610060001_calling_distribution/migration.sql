BEGIN;
ALTER TABLE "leads" ADD COLUMN "calling_associate_id" TEXT, ADD COLUMN "linkedin_lead_id" TEXT, ADD COLUMN "linkedin_data" JSONB;
ALTER TABLE "leads" ADD CONSTRAINT "leads_calling_associate_id_fkey" FOREIGN KEY ("calling_associate_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "leads_calling_associate_id_idx" ON "leads"("calling_associate_id");
CREATE UNIQUE INDEX "leads_linkedin_lead_id_key" ON "leads"("linkedin_lead_id");
CREATE TABLE "calling_rotation" ("key" TEXT PRIMARY KEY, "last_user_id" TEXT);
COMMIT;
