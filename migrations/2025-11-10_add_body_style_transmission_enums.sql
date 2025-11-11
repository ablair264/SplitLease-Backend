-- Add body_style enum values from CAP data
-- First check existing enum values
DO $$
BEGIN
    -- Add body_style values if they don't exist
    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Saloon';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Hatchback';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Estate';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Coupe';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Convertible';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'MPV';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Van';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Pick-up';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Double Cab Pick-up';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Station Wagon';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE body_style ADD VALUE IF NOT EXISTS 'Crew Cab Pick-up';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;

-- Add transmission enum values
-- Assuming transmission is also an enum. If it's text, skip this part
DO $$
BEGIN
    -- Try to add common transmission values
    BEGIN
        ALTER TYPE transmission ADD VALUE IF NOT EXISTS 'M';  -- Manual
    EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;  -- If transmission is not an enum
    END;

    BEGIN
        ALTER TYPE transmission ADD VALUE IF NOT EXISTS 'A';  -- Automatic
    EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE transmission ADD VALUE IF NOT EXISTS 'S';  -- Semi-automatic
    EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
    END;
END $$;
