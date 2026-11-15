ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "onboarded_partner_code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "leads_onboarded_partner_code_key"
  ON "leads"("onboarded_partner_code")
  WHERE "onboarded_partner_code" IS NOT NULL;
ALTER TABLE "follow_ups" ADD COLUMN IF NOT EXISTS "due_time" TEXT;
