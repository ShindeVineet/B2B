BEGIN;
CREATE SEQUENCE lead_code_sequence;
CREATE SEQUENCE partner_code_sequence;
CREATE FUNCTION next_lead_code() RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT 'LD-' || CASE WHEN length(n::text) < 6 THEN lpad(n::text, 6, '0') ELSE n::text END FROM nextval('lead_code_sequence') n;
$$;
-- CreateEnum
CREATE TYPE "LeadPhoneLabel" AS ENUM ('primary', 'alternate', 'whatsapp');

-- CreateEnum
CREATE TYPE "LeadPhoneSource" AS ENUM ('import', 'manual', 'rep_added');

-- CreateEnum
CREATE TYPE "ProfessionalType" AS ENUM ('architect', 'interior_designer', 'builder', 'contractor', 'other');

-- CreateEnum
CREATE TYPE "OnboardedFrom" AS ENUM ('ground_visit', 'referral', 'website', 'walk_in', 'other');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('pending_review', 'active', 'rejected');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "lead_code" TEXT NOT NULL DEFAULT next_lead_code();

-- CreateTable
CREATE TABLE "lead_phones" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "label" "LeadPhoneLabel" NOT NULL DEFAULT 'alternate',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source" "LeadPhoneSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "partner_code" TEXT NOT NULL,
    "source_lead_id" TEXT,
    "source_lead_code" TEXT,
    "onboarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "form_submitter_email" TEXT,
    "company_firm_name" TEXT NOT NULL,
    "contact_person_name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "business_email_id" TEXT,
    "office_address" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "type_of_professional" "ProfessionalType" NOT NULL,
    "years_operating" INTEGER NOT NULL,
    "specialized_in" TEXT NOT NULL,
    "expected_monthly_order_value" DECIMAL(18,2) NOT NULL,
    "gst_registered" BOOLEAN NOT NULL,
    "gst_no" TEXT,
    "gst_certificate_url" TEXT,
    "pan_no" TEXT NOT NULL,
    "pan_card_url" TEXT,
    "bank_account_name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "account_no" TEXT NOT NULL,
    "ifsc_code" TEXT NOT NULL,
    "onboarded_from" "OnboardedFrom" NOT NULL,
    "partner_status" "PartnerStatus" NOT NULL DEFAULT 'pending_review',
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_by" TEXT NOT NULL,
    "region_override" TEXT,
    "is_migrated_historical" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_documents" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_activity_log" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_notifications" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_city_regions" (
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,

    CONSTRAINT "partner_city_regions_pkey" PRIMARY KEY ("city")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_phones_lead_id_phone_number_key" ON "lead_phones"("lead_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "partners_partner_code_key" ON "partners"("partner_code");

-- CreateIndex
CREATE INDEX "partners_mobile_number_idx" ON "partners"("mobile_number");

-- CreateIndex
CREATE INDEX "partners_gst_no_idx" ON "partners"("gst_no");

-- CreateIndex
CREATE INDEX "partners_source_lead_id_idx" ON "partners"("source_lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_documents_filename_key" ON "partner_documents"("filename");

-- CreateIndex
CREATE INDEX "partner_activity_log_partner_id_created_at_idx" ON "partner_activity_log"("partner_id", "created_at");

-- CreateIndex
CREATE INDEX "partner_notifications_user_id_read_at_idx" ON "partner_notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_lead_code_key" ON "leads"("lead_code");

-- AddForeignKey
ALTER TABLE "lead_phones" ADD CONSTRAINT "lead_phones_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_source_lead_id_fkey" FOREIGN KEY ("source_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_documents" ADD CONSTRAINT "partner_documents_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_documents" ADD CONSTRAINT "partner_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_activity_log" ADD CONSTRAINT "partner_activity_log_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_activity_log" ADD CONSTRAINT "partner_activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_notifications" ADD CONSTRAINT "partner_notifications_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_notifications" ADD CONSTRAINT "partner_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing legacy phone values remain unchanged; rows without a number have no phone row.
INSERT INTO lead_phones(id, lead_id, phone_number, label, is_primary, source)
 SELECT 'legacy-' || id, id, phone_no, 'primary', true, 'import'
 FROM leads WHERE phone_no IS NOT NULL AND btrim(phone_no) <> '';
CREATE UNIQUE INDEX lead_phones_one_primary ON lead_phones(lead_id) WHERE is_primary;
CREATE FUNCTION immutable_lead_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.lead_code IS DISTINCT FROM OLD.lead_code THEN RAISE EXCEPTION 'Lead code is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER leads_immutable_code BEFORE UPDATE OF lead_code ON leads FOR EACH ROW EXECUTE FUNCTION immutable_lead_code();
-- Maintain backward compatibility for old create/update code paths.
CREATE FUNCTION sync_legacy_lead_phone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 IF NEW.phone_no IS NULL OR btrim(NEW.phone_no) = '' THEN
   UPDATE lead_phones SET is_primary=false WHERE lead_id=NEW.id AND is_primary;
 ELSE
   UPDATE lead_phones SET is_primary=false WHERE lead_id=NEW.id AND is_primary;
   INSERT INTO lead_phones(id, lead_id, phone_number, label, is_primary, source)
   VALUES ('primary-' || md5(NEW.id || NEW.phone_no), NEW.id, NEW.phone_no, 'primary', true, 'manual')
   ON CONFLICT (lead_id, phone_number) DO UPDATE SET is_primary=true;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER leads_sync_phone AFTER INSERT OR UPDATE OF phone_no ON leads FOR EACH ROW EXECUTE FUNCTION sync_legacy_lead_phone();
CREATE FUNCTION sync_primary_lead_phone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.is_primary AND pg_trigger_depth() = 1 THEN
   UPDATE leads SET phone_no=NEW.phone_number WHERE id=NEW.lead_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lead_phones_sync_primary AFTER INSERT OR UPDATE ON lead_phones FOR EACH ROW EXECUTE FUNCTION sync_primary_lead_phone();
CREATE TABLE partner_phones (
 id TEXT PRIMARY KEY, partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
 phone_number TEXT NOT NULL, CONSTRAINT partner_phones_partner_id_phone_number_key UNIQUE(partner_id,phone_number)
);
COMMIT;
