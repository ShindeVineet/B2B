BEGIN;
-- Preserve the best available baseline for existing records; earlier overwritten values cannot be reconstructed.
ALTER TABLE leads ADD COLUMN original_data JSONB NOT NULL DEFAULT '{}', ADD COLUMN owner_name TEXT, ADD COLUMN intake_team TEXT NOT NULL DEFAULT 'ground';
UPDATE leads SET original_data = jsonb_build_object('company_name', company_name, 'phone_no', phone_no, 'owner_name', NULL, 'address', address, 'pin_code', pin_code, 'lead_source', lead_source, 'category', category, 'website', website, 'google_map_link', google_map_link, 'baseline', 'migration'), intake_team = CASE WHEN lead_source IN ('CDT','Phone','LinkedIn') THEN 'caller' WHEN lead_source = 'Walk-in' THEN 'store' WHEN lead_source IN ('Manual','Manual Entry') THEN 'head' ELSE 'ground' END;
CREATE FUNCTION preserve_lead_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.original_data := jsonb_build_object('company_name', NEW.company_name, 'phone_no', NEW.phone_no, 'owner_name', NEW.owner_name, 'address', NEW.address, 'pin_code', NEW.pin_code, 'lead_source', NEW.lead_source, 'category', NEW.category, 'website', NEW.website, 'google_map_link', NEW.google_map_link, 'baseline', 'intake');
 ELSE
  IF NEW.original_data IS DISTINCT FROM OLD.original_data OR NEW.id IS DISTINCT FROM OLD.id OR NEW.lead_code IS DISTINCT FROM OLD.lead_code OR NEW.lead_source IS DISTINCT FROM OLD.lead_source THEN
   RAISE EXCEPTION 'Original lead data, source and identifiers are immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lead_origin_guard BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION preserve_lead_origin();
ALTER TABLE partners ADD COLUMN referred_by_partner_id TEXT REFERENCES partners(id) ON DELETE RESTRICT, ADD COLUMN whatsapp_group_created BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE partners ADD CONSTRAINT partner_no_self_referral CHECK (referred_by_partner_id IS DISTINCT FROM id);
CREATE TABLE store_visits (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
 store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
 consultation_id TEXT NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE RESTRICT,
 scheduled_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX store_visits_status_scheduled_at_idx ON store_visits(status, scheduled_at);

COMMIT;
