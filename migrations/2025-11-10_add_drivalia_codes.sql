-- Add Drivalia-specific columns to vehicles table
-- This allows us to store Drivalia's internal codes for accurate quote requests

ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS drivalia_make_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS drivalia_model_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS drivalia_variant_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS drivalia_xref_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS drivalia_last_synced TIMESTAMP WITH TIME ZONE;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_drivalia_codes
ON vehicles(drivalia_make_code, drivalia_model_code, drivalia_variant_code);

CREATE INDEX IF NOT EXISTS idx_vehicles_drivalia_xref
ON vehicles(drivalia_xref_code);

-- Add comment explaining these columns
COMMENT ON COLUMN vehicles.drivalia_make_code IS 'Drivalia API make code for quote requests';
COMMENT ON COLUMN vehicles.drivalia_model_code IS 'Drivalia API model code for quote requests';
COMMENT ON COLUMN vehicles.drivalia_variant_code IS 'Drivalia API variant code for quote requests';
COMMENT ON COLUMN vehicles.drivalia_xref_code IS 'Drivalia cross-reference code (unique identifier)';
COMMENT ON COLUMN vehicles.drivalia_last_synced IS 'Last time vehicle data was synced from Drivalia';
