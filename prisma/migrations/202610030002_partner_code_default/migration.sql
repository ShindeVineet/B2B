-- Preserve existing codes and the existing sequence; only add database generation.
CREATE OR REPLACE FUNCTION next_partner_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE candidate text;
BEGIN
  PERFORM pg_advisory_xact_lock(707007);
  LOOP
    candidate := 'FLZ-P-' || (SELECT lpad(n, greatest(4, length(n)), '0') FROM (SELECT nextval('partner_code_sequence')::text AS n) seq);
    IF NOT EXISTS (SELECT 1 FROM partners WHERE partner_code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;
ALTER TABLE partners ALTER COLUMN partner_code SET DEFAULT next_partner_code();
