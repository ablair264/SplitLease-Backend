-- Add fuel_type enum values from CAP data
DO $$
BEGIN
    -- Add fuel_type values if they don't exist
    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Petrol';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Diesel';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Electric';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Hybrid';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Petrol/PlugIn Elec Hybrid';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Diesel/PlugIn Elec Hybrid';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Petrol Hybrid';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Diesel Hybrid';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'LPG';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'CNG';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE fuel_type ADD VALUE IF NOT EXISTS 'Hydrogen';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;
