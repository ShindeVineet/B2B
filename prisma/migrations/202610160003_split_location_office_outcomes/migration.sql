UPDATE form_fields
SET options = '["Visit scheduled","Nurturing required","Dont want commission","Lost Lead - (does not do tiles business)","Wrong location","Office closed"]'::jsonb
WHERE key = 'outcome';
