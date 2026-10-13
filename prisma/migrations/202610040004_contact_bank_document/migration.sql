ALTER TABLE consultations ADD COLUMN IF NOT EXISTS alternate_mobile_number TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_document_url TEXT;
INSERT INTO form_fields (id,key,label,type,required,display_order,active)
VALUES ('consultation_alternate_mobile_number','alternate_mobile_number','Alternate Mobile Number','text',false,4,true)
ON CONFLICT (key) DO UPDATE SET active=true, required=false;
