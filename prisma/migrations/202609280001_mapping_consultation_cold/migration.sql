BEGIN;
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GeocodeSource" ADD VALUE 'google_link';
ALTER TYPE "GeocodeSource" ADD VALUE 'company_search';
ALTER TYPE "GeocodeSource" ADD VALUE 'address_search';

-- AlterEnum
ALTER TYPE "GeocodeStatus" ADD VALUE 'mapping_issue';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "cannot_locate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "geocode_candidates" JSONB,
ADD COLUMN     "geocode_confidence" TEXT,
ADD COLUMN     "geocode_flagged_at" TIMESTAMP(3),
ADD COLUMN     "geocode_issue_reason" TEXT;

-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "ground_staff_name" TEXT,
ADD COLUMN     "responses" JSONB,
ADD COLUMN     "visiting_card_photos" JSONB;

-- CreateTable
CREATE TABLE "geocode_query_cache" (
    "key" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geocode_query_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "geocode_provider_state" (
    "name" TEXT NOT NULL,
    "last_request_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geocode_provider_state_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "geocode_jobs" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "geocode_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocode_job_items" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "lease_until" TIMESTAMP(3),

    CONSTRAINT "geocode_job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "display_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "max_files" INTEGER,
    "required_when" JSONB,

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_assets" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cold_lead_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "outcome_rule" BOOLEAN NOT NULL DEFAULT true,
    "checklist_rule" BOOLEAN NOT NULL DEFAULT true,
    "low_interest_rule" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cold_lead_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cold_lead_cases" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "flagged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "cold_lead_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "reason" TEXT,
    "callback_date" DATE,
    "next_follow_up_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "rep_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geocode_job_items_status_lease_until_idx" ON "geocode_job_items"("status", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "geocode_job_items_job_id_lead_id_key" ON "geocode_job_items"("job_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_key_key" ON "form_fields"("key");

-- CreateIndex
CREATE UNIQUE INDEX "photo_assets_filename_key" ON "photo_assets"("filename");

-- CreateIndex
CREATE UNIQUE INDEX "cold_lead_cases_lead_id_key" ON "cold_lead_cases"("lead_id");

-- CreateIndex
CREATE INDEX "cold_lead_cases_resolved_at_flagged_at_idx" ON "cold_lead_cases"("resolved_at", "flagged_at");

-- CreateIndex
CREATE INDEX "call_logs_lead_id_created_at_idx" ON "call_logs"("lead_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_lead_id_key" ON "follow_ups"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_notifications_dedupe_key_key" ON "workflow_notifications"("dedupe_key");

-- AddForeignKey
ALTER TABLE "geocode_jobs" ADD CONSTRAINT "geocode_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geocode_job_items" ADD CONSTRAINT "geocode_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "geocode_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geocode_job_items" ADD CONSTRAINT "geocode_job_items_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_assets" ADD CONSTRAINT "photo_assets_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_assets" ADD CONSTRAINT "photo_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cold_lead_cases" ADD CONSTRAINT "cold_lead_cases_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_notifications" ADD CONSTRAINT "workflow_notifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exact consultation field definitions; existing consultations remain intact.
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-decision_maker_name','decision_maker_name','Decision Maker Name','text',true,NULL,1,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-company_name','company_name','Company name','text',true,NULL,2,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-decision_maker_phone','decision_maker_phone','Mobile Number','text',true,NULL,3,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-designation','designation','Designation','text',true,NULL,4,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-lead_type','lead_type','Lead Type','select',true,'["Architect","Interior Designer","Builder","Contractor","Other"]'::jsonb,5,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-email','email','Email','text',false,NULL,6,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-interest_level','interest_level','Interest Level','select',true,'["High","Medium","Low"]'::jsonb,7,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-current_lead_status','current_lead_status','Current Lead Status','select',true,'["Fresh Lead - After Pre-qualification","2nd Visit after Nurturing","Already Having partnership with other Companies"]'::jsonb,8,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-outcome','outcome','Lead Outcome','select',true,'["On-boarding Done","Visit scheduled","Nurturing required","Dont want commission","Lost Lead - (does not do tiles business)","Wrong Location/Office closed"]'::jsonb,9,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-visit_date','visit_date','Shop Visit date','date',true,NULL,10,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-primary_pain_point','primary_pain_point','Primary Pain Point Observed','select',false,'["Delivery delay","High price","Limited designs","Poor service","No credit support","Already Partner with other companies (Add company name in notes)","Other"]'::jsonb,11,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-competitor_involved','competitor_involved','Competitor Involved','select',false,'["Kajaria","Mytiles","Material Depot","Somany","Nitco","Johnson","Others"]'::jsonb,12,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-site_photos','site_photos','Site Photo','photo',true,NULL,13,true,5,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-ground_staff_name','ground_staff_name','Name of Ground Staff','select',true,'["Sumesh","Indranil","Shinoy","Vineet","Navjot"]'::jsonb,14,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-checklist','checklist','CheckList','multi_select',true,'["Florzy Pitched","Florzy USP''s Pitched","Partnership Benefits Pitched","Shared Catelogue on their WA","Shared On boarding Form on their WA","Given our Florzy Visiting Card","Taken Physical Visiting Card","Referral Contact Received from Prospect","SKU requirement asked/recieved by the client on spot","Removed from office/Not interested"]'::jsonb,15,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-notes','notes','Notes','long_text',false,NULL,16,true,NULL,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-visiting_card_photos','visiting_card_photos','Visiting Card Photo','photo',false,NULL,17,true,2,NULL) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO form_fields(id,key,label,type,required,options,display_order,active,max_files,required_when) VALUES ('consultation-next_follow_up_date','next_follow_up_date','Next Follow-up Date','date',false,NULL,18,true,NULL,'{"field":"outcome","values":["Visit scheduled","Nurturing required"]}'::jsonb) ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,type=EXCLUDED.type,required=EXCLUDED.required,options=EXCLUDED.options,display_order=EXCLUDED.display_order,active=true,max_files=EXCLUDED.max_files,required_when=EXCLUDED.required_when;
INSERT INTO cold_lead_config(id,updated_at) VALUES ('default',CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

COMMIT;
