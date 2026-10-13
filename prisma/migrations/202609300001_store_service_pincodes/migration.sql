BEGIN;
CREATE TABLE store_service_pincodes (
 store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE,
 pin_code TEXT NOT NULL,
 CONSTRAINT store_service_pincodes_pkey PRIMARY KEY(store_id,pin_code)
);
CREATE INDEX store_service_pincodes_pin_code_idx ON store_service_pincodes(pin_code);
COMMIT;
