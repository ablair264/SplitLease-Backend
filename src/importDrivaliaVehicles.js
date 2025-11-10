/**
 * Drivalia Vehicle Catalog Import Script
 *
 * Fetches all vehicles from Drivalia API and stores them in Supabase
 * This ensures we only show vehicles that Drivalia actually has,
 * and we use the correct codes when requesting quotes.
 */

const { DrivaliaAPI } = require('./drivaliaAPI');
const { supabase } = require('./supabase');
require('dotenv').config();

class DrivaliaVehicleImporter {
  constructor() {
    this.drivaliaAPI = new DrivaliaAPI();
    this.stats = {
      makes: 0,
      models: 0,
      variants: 0,
      inserted: 0,
      updated: 0,
      errors: 0
    };
  }

  async run() {
    console.log('🚗 Drivalia Vehicle Catalog Import');
    console.log('=====================================\n');

    try {
      // Step 1: Login to Drivalia
      console.log('🔐 Logging in to Drivalia...');
      await this.drivaliaAPI.login();
      console.log('✅ Logged in successfully\n');

      // Step 2: Fetch all makes
      console.log('📋 Fetching manufacturers...');
      const makes = await this.drivaliaAPI.getMakes();
      this.stats.makes = makes.length;
      console.log(`✅ Found ${makes.length} manufacturers\n`);

      // Step 3: For each make, fetch models and variants
      for (let i = 0; i < makes.length; i++) {
        const make = makes[i];
        console.log(`[${i + 1}/${makes.length}] Processing: ${make.name} (code: ${make.code})`);

        try {
          // Fetch models for this make
          const models = await this.drivaliaAPI.getModels(make.code);
          this.stats.models += models.length;
          console.log(`   📦 Found ${models.length} models`);

          for (const model of models) {
            try {
              // Fetch variants for this model
              const variants = await this.drivaliaAPI.getVariants(make.code, model.code);
              this.stats.variants += variants.length;

              // Insert variants into Supabase
              for (const variant of variants) {
                await this.insertVehicle(make, model, variant);
              }

              console.log(`      ✓ ${model.name}: ${variants.length} variants`);

            } catch (error) {
              console.error(`      ✗ Error fetching variants for ${model.name}:`, error.message);
              this.stats.errors++;
            }

            // Rate limiting - don't hammer the API
            await this.sleep(100);
          }

        } catch (error) {
          console.error(`   ✗ Error fetching models for ${make.name}:`, error.message);
          this.stats.errors++;
        }

        console.log(''); // Blank line between makes
      }

      // Print summary
      console.log('\n=====================================');
      console.log('📊 Import Summary:');
      console.log('=====================================');
      console.log(`Makes:         ${this.stats.makes}`);
      console.log(`Models:        ${this.stats.models}`);
      console.log(`Variants:      ${this.stats.variants}`);
      console.log(`Inserted:      ${this.stats.inserted}`);
      console.log(`Updated:       ${this.stats.updated}`);
      console.log(`Errors:        ${this.stats.errors}`);
      console.log('\n✅ Import complete!\n');

    } catch (error) {
      console.error('\n❌ Import failed:', error);
      process.exit(1);
    }
  }

  async insertVehicle(make, model, variant) {
    try {
      // Check if vehicle already exists
      const { data: existing } = await supabase
        .from('vehicles')
        .select('id')
        .eq('manufacturer', make.name)
        .eq('model', model.name)
        .eq('variant', variant.name)
        .single();

      const vehicleData = {
        manufacturer: make.name,
        model: model.name,
        variant: variant.name,
        // Store Drivalia codes for quote requests
        drivalia_make_code: make.code,
        drivalia_model_code: model.code,
        drivalia_variant_code: variant.code,
        drivalia_xref_code: variant.xrefCode,
        // Vehicle specs from Drivalia
        p11d_price: variant.p11d || null,
        co2_emissions: variant.co2 || null,
        fuel_type: this.mapFuelType(variant.fuelType),
        // Normalized search field
        make_model_variant_normalized: `${make.name} ${model.name} ${variant.name}`.toLowerCase()
      };

      if (existing) {
        // Update existing vehicle with Drivalia codes
        await supabase
          .from('vehicles')
          .update(vehicleData)
          .eq('id', existing.id);

        this.stats.updated++;
      } else {
        // Insert new vehicle
        await supabase
          .from('vehicles')
          .insert(vehicleData);

        this.stats.inserted++;
      }

    } catch (error) {
      console.error(`      ⚠️  Error saving vehicle:`, error.message);
      this.stats.errors++;
    }
  }

  mapFuelType(drivaliaFuelType) {
    const mapping = {
      'Petrol': 'petrol',
      'Diesel': 'diesel',
      'Electric': 'electric',
      'Hybrid': 'hybrid',
      'Plug-in Hybrid': 'plugin_hybrid',
      'Mild Hybrid': 'mild_hybrid'
    };
    return mapping[drivaliaFuelType] || 'other';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the importer
if (require.main === module) {
  const importer = new DrivaliaVehicleImporter();

  importer.run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = DrivaliaVehicleImporter;
