require('dotenv').config();
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

/**
 * Normalize code by removing all whitespace for matching
 */
function normalizeCode(code) {
  return code ? code.replace(/\s+/g, '') : '';
}

/**
 * Import Drivalia vehicle codes from exported API calls JSON
 */
class DrivaliaJSONImporter {
  constructor(jsonFilePath) {
    this.jsonFilePath = jsonFilePath;
    this.stats = {
      totalVehicles: 0,
      matched: 0,
      updated: 0,
      inserted: 0,
      errors: 0
    };
  }

  async run() {
    console.log('🚗 Importing Drivalia Vehicle Codes from JSON');
    console.log('='.repeat(50));
    console.log('');

    try {
      // Read and parse JSON file
      console.log('📖 Reading JSON file...');
      const jsonContent = await fs.readFile(this.jsonFilePath, 'utf-8');
      const apiCalls = JSON.parse(jsonContent);
      console.log(`✅ Loaded ${apiCalls.length} API calls`);
      console.log('');

      // Extract all vehicles from asset/search responses
      console.log('🔍 Extracting vehicles from asset/search responses...');
      const vehicles = this.extractVehicles(apiCalls);
      this.stats.totalVehicles = vehicles.length;
      console.log(`✅ Found ${vehicles.length} vehicles`);
      console.log('');

      // Match and update vehicles in Supabase
      console.log('🔄 Matching and updating vehicles in Supabase...');
      await this.matchAndUpdateVehicles(vehicles);

      // Print summary
      console.log('');
      console.log('📊 Import Summary');
      console.log('='.repeat(50));
      console.log(`Total vehicles in JSON: ${this.stats.totalVehicles}`);
      console.log(`Matched & updated:      ${this.stats.updated}`);
      console.log(`Newly inserted:         ${this.stats.inserted}`);
      console.log(`Errors:                 ${this.stats.errors}`);
      console.log('');

      const successRate = ((this.stats.updated + this.stats.inserted) / this.stats.totalVehicles * 100).toFixed(1);
      console.log(`✅ Success rate: ${successRate}%`);
      console.log('');

    } catch (error) {
      console.error('❌ Import failed:', error.message);
      throw error;
    }
  }

  /**
   * Extract all vehicles from asset/search API calls
   */
  extractVehicles(apiCalls) {
    const vehicles = [];
    const seen = new Set(); // Track unique vehicles by xrefCode

    for (const call of apiCalls) {
      // Only process asset/search calls
      if (call.url === '/WebApp/api/asset/search' && Array.isArray(call.response)) {
        for (const vehicle of call.response) {
          // Skip if we've already seen this vehicle
          if (seen.has(vehicle.xrefCode)) {
            continue;
          }

          seen.add(vehicle.xrefCode);
          vehicles.push({
            makeId: vehicle.makeId,
            make: vehicle.make,
            modelId: vehicle.modelId,
            model: vehicle.model,
            variantId: vehicle.modelVariantId,
            variant: vehicle.variant,
            xrefCode: vehicle.xrefCode,
            priceNet: vehicle.priceNet
          });
        }
      }
    }

    return vehicles;
  }

  /**
   * Match vehicles by cap_code and update with Drivalia codes
   */
  async matchAndUpdateVehicles(drivaliaVehicles) {
    for (const [index, drivaliaVehicle] of drivaliaVehicles.entries()) {
      const progress = `[${index + 1}/${drivaliaVehicles.length}]`;

      try {
        // Normalize xrefCode for matching
        const normalizedXrefCode = normalizeCode(drivaliaVehicle.xrefCode);

        // Find matching vehicle in Supabase by cap_code
        // We need to fetch all vehicles and match in-memory since we can't use REPLACE in Supabase query
        const { data: supabaseVehicles, error: fetchError } = await supabase
          .from('vehicles')
          .select('id, cap_code, manufacturer, model, variant')
          .eq('manufacturer', drivaliaVehicle.make);

        if (fetchError) {
          console.error(`${progress} ❌ Error fetching vehicles for ${drivaliaVehicle.make}:`, fetchError.message);
          this.stats.errors++;
          continue;
        }

        // Find matching vehicle by normalized cap_code
        const matchedVehicle = supabaseVehicles?.find(v =>
          normalizeCode(v.cap_code) === normalizedXrefCode
        );

        if (!matchedVehicle) {
          // Vehicle doesn't exist - insert it
          const { error: insertError } = await supabase
            .from('vehicles')
            .insert({
              manufacturer: drivaliaVehicle.make,
              model: drivaliaVehicle.model,
              variant: drivaliaVehicle.variant,
              cap_code: drivaliaVehicle.xrefCode,
              p11d_price: drivaliaVehicle.priceNet,
              drivalia_make_code: drivaliaVehicle.makeId?.toString(),
              drivalia_model_code: drivaliaVehicle.modelId?.toString(),
              drivalia_variant_code: drivaliaVehicle.variantId?.toString(),
              drivalia_xref_code: drivaliaVehicle.xrefCode,
              drivalia_last_synced: new Date().toISOString()
            });

          if (insertError) {
            console.error(`${progress} ❌ Error inserting vehicle:`, insertError.message);
            this.stats.errors++;
            continue;
          }

          this.stats.inserted++;

          // Log progress every 100 vehicles
          if ((this.stats.inserted + this.stats.updated) % 100 === 0) {
            console.log(`${progress} ✅ Processed ${this.stats.inserted + this.stats.updated} vehicles (${this.stats.updated} updated, ${this.stats.inserted} inserted)...`);
          }

          continue;
        }

        this.stats.matched++;

        // Update the vehicle with Drivalia codes
        const { error: updateError } = await supabase
          .from('vehicles')
          .update({
            drivalia_make_code: drivaliaVehicle.makeId?.toString(),
            drivalia_model_code: drivaliaVehicle.modelId?.toString(),
            drivalia_variant_code: drivaliaVehicle.variantId?.toString(),
            drivalia_xref_code: drivaliaVehicle.xrefCode,
            drivalia_last_synced: new Date().toISOString()
          })
          .eq('id', matchedVehicle.id);

        if (updateError) {
          console.error(`${progress} ❌ Error updating vehicle ${matchedVehicle.id}:`, updateError.message);
          this.stats.errors++;
          continue;
        }

        this.stats.updated++;

        // Log progress every 100 vehicles
        if ((this.stats.inserted + this.stats.updated) % 100 === 0) {
          console.log(`${progress} ✅ Processed ${this.stats.inserted + this.stats.updated} vehicles (${this.stats.updated} updated, ${this.stats.inserted} inserted)...`);
        }

      } catch (error) {
        console.error(`${progress} ❌ Error processing vehicle:`, error.message);
        this.stats.errors++;
      }
    }
  }
}

// Run the importer
const jsonFilePath = process.argv[2] || '/Users/alastairblair/Development/SplitWheel/Lease Analysis/drivalia-api-calls-full-1762817401326.json';

const importer = new DrivaliaJSONImporter(jsonFilePath);
importer.run()
  .then(() => {
    console.log('✅ Import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Import failed:', error);
    process.exit(1);
  });
