-- Enable the free Overpass provider without changing existing source provenance.
-- Legacy source conversion/removal is a separate migration pending the user's
-- decision about google_link/company_search/address_search in this checkout.
ALTER TYPE "GeocodeSource" ADD VALUE IF NOT EXISTS 'overpass';
