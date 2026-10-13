UPDATE form_fields SET active = false WHERE key IN ('email','current_lead_status','checklist');
UPDATE form_fields SET options = '["Visit scheduled","Nurturing required","Dont want commission","Lost Lead - (does not do tiles business)","Wrong Location/Office closed"]'::jsonb WHERE key = 'outcome';
UPDATE form_fields SET required = false, required_when = '{"field":"outcome","values":["Visit scheduled"]}'::jsonb WHERE key = 'next_follow_up_date';
