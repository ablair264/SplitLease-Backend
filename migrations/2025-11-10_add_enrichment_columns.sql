-- Add missing columns for vehicle enrichment
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS model_year INTEGER,
ADD COLUMN IF NOT EXISTS bik_percentage DECIMAL(5,2);

-- Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_vehicles_model_year ON vehicles(model_year);
CREATE INDEX IF NOT EXISTS idx_vehicles_fuel_type ON vehicles(fuel_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_transmission ON vehicles(transmission);

-- Add comments
COMMENT ON COLUMN vehicles.model_year IS 'Model year of the vehicle (e.g., 2024, 2025)';
COMMENT ON COLUMN vehicles.bik_percentage IS 'Benefit-in-Kind tax percentage based on CO2 emissions';
