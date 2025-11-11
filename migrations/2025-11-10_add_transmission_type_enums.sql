-- Add transmission_type enum values (the enum is called transmission_type not transmission)
DO $$
BEGIN
    -- Add transmission_type values if they don't exist
    BEGIN
        ALTER TYPE transmission_type ADD VALUE IF NOT EXISTS 'M';  -- Manual
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE transmission_type ADD VALUE IF NOT EXISTS 'A';  -- Automatic
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE transmission_type ADD VALUE IF NOT EXISTS 'S';  -- Semi-automatic
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;
