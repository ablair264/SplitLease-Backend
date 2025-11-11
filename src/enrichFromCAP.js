require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');
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
 * Normalize vehicle name for fuzzy matching
 */
function normalizeVehicleName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .trim();
}

/**
 * Normalization for fuzzy comparison:
 * - lowercase
 * - strip year-like patterns and all digits
 * - keep letters as tokens (spaces preserved)
 * - collapse extra whitespace
 */
function normalizeForCompare(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    // remove explicit (2023) or (26) style
    .replace(/\((?:19|20)?\d{2}\)/g, ' ')
    // remove standalone 2-4 digit numbers (years, trims)
    .replace(/\b(?:19|20)?\d{2}\b/g, ' ')
    // remove any remaining digits
    .replace(/\d+/g, ' ')
    // keep letters as tokens
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse CSV file and return all rows
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

/**
 * Enrich vehicles table with CAP and Lex data
 */
class VehicleEnricher {
  constructor(csvFilePath, lexCodesDir) {
    this.csvFilePath = csvFilePath;
    this.lexCodesDir = lexCodesDir;
    // Fast lookup structures populated by loadLexCodes()
    this.lexByMake = new Map(); // key: normalized make -> array of entries
    this.lexByMakeModel = new Map(); // key: normalized make + '|' + normalized model -> array of entries
    this.stats = {
      totalInCSV: 0,
      capMatched: 0,
      lexMatched: 0,
      updated: 0,
      notMatched: 0,
      errors: 0
    };
  }

  /**
   * Load all Lex JSON files and build a lookup map
   */
  async loadLexCodes() {
    const lexMap = new Map();

    if (!this.lexCodesDir) {
      return lexMap;
    }

    try {
      const files = await fs.readdir(this.lexCodesDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      console.log(`📖 Loading ${jsonFiles.length} Lex code files...`);

      for (const file of jsonFiles) {
        const filePath = path.join(this.lexCodesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        // Process the hierarchical structure
        for (const make of data.makes || []) {
          if (!make.code || make.code === '0') continue;

          for (const model of make.models || []) {
            if (!model.code || model.code === '0') continue;

            for (const variant of model.variants || []) {
              if (!variant.code) continue;

              // Create a normalized lookup key: manufacturer + model + variant
              const key = normalizeVehicleName(
                `${make.name}${model.name}${variant.name}`
              );

              const entry = {
                makeCode: make.code,
                makeName: make.name,
                modelCode: model.code,
                modelName: model.name,
                variantCode: variant.code,
                variantName: variant.name
              };

              lexMap.set(key, entry);

              // Populate fast lookup indexes
              const makeKey = normalizeVehicleName(make.name);
              const modelKey = normalizeVehicleName(model.name);
              const mmKey = `${makeKey}|${modelKey}`;

              if (!this.lexByMake.has(makeKey)) this.lexByMake.set(makeKey, []);
              this.lexByMake.get(makeKey).push(entry);

              if (!this.lexByMakeModel.has(mmKey)) this.lexByMakeModel.set(mmKey, []);
              this.lexByMakeModel.get(mmKey).push(entry);
            }
          }
        }
      }

      console.log(`✅ Loaded ${lexMap.size} Lex vehicle codes`);
      return lexMap;
    } catch (error) {
      console.warn(`⚠️  Failed to load Lex codes: ${error.message}`);
      return lexMap;
    }
  }

  async run() {
    console.log('📊 Enriching Vehicles Table with CAP and Lex Data');
    console.log('='.repeat(50));
    console.log('');

    try {
      // Parse CSV file
      console.log('📖 Reading CAP CSV file...');
      const capData = await parseCSV(this.csvFilePath);
      this.stats.totalInCSV = capData.length;
      console.log(`✅ Loaded ${capData.length} vehicles from CAP`);
      console.log('');

      // Build a map by normalized CAP_CODE for quick lookup
      console.log('🗺️  Building CAP_CODE lookup map...');
      const capMap = new Map();
      for (const row of capData) {
        const normalizedCode = normalizeCode(row.CAP_CODE);
        if (normalizedCode) {
          capMap.set(normalizedCode, row);
        }
      }
      console.log(`✅ Built map with ${capMap.size} unique CAP codes`);
      console.log('');

      // Load Lex codes
      const lexMap = await this.loadLexCodes();
      console.log('');

      // Fetch all vehicles from Supabase
      console.log('📥 Fetching vehicles from Supabase...');
      const { data: vehicles, error: fetchError } = await supabase
        .from('vehicles')
        .select('id, cap_code, manufacturer, model, variant');

      if (fetchError) {
        throw new Error(`Failed to fetch vehicles: ${fetchError.message}`);
      }

      console.log(`✅ Fetched ${vehicles.length} vehicles from Supabase`);
      console.log('');

      // Match and enrich vehicles
      console.log('🔄 Enriching vehicles with CAP and Lex data...');
      for (const [index, vehicle] of vehicles.entries()) {
        const progress = `[${index + 1}/${vehicles.length}]`;

        try {
          // Build update object
          const updateData = {};

          // Try to match with CAP data by cap_code
          let capRecord = null;
          if (vehicle.cap_code) {
            const normalizedCode = normalizeCode(vehicle.cap_code);
            capRecord = capMap.get(normalizedCode);
            if (capRecord) {
              this.stats.capMatched++;
            }
          }

          // Try to match with Lex data
          // Note: Lex variant names include the full model description
          // e.g. Supabase: model="500 ELECTRIC CABRIO", variant="114kW 42.2kWh 2dr Auto (2023)"
          // but Lex: model="500", variant="500 ELECTRIC CABRIO 114kW 42.2kWh 2dr Auto 26"
          let lexRecord = null;
          if (vehicle.manufacturer && vehicle.model) {
            lexRecord = this.findBestLexMatch(
              vehicle.manufacturer,
              vehicle.model,
              vehicle.variant || ''
            );

            if (lexRecord) this.stats.lexMatched++;
            else if (this.stats.lexMatched < 5) {
              console.log(`   🔍 Lex lookup failed for: ${vehicle.manufacturer} / ${vehicle.model} / ${vehicle.variant || ''}`);
            }
          }

          // If no matches at all, skip
          if (!capRecord && !lexRecord) {
            // Only log first few not matched to avoid spam
            if (this.stats.notMatched < 10) {
              console.log(`${progress} ⚠️  No match for: ${vehicle.manufacturer} ${vehicle.model} ${vehicle.variant}`);
            }
            this.stats.notMatched++;
            continue;
          }

          // Add CAP data if available
          if (capRecord) {
            // CO2 emissions
            if (capRecord.CO2_g_per_km && !isNaN(parseFloat(capRecord.CO2_g_per_km))) {
              updateData.co2_emissions = parseFloat(capRecord.CO2_g_per_km);
            }

            // P11D price
            if (capRecord.P11D && !isNaN(parseFloat(capRecord.P11D))) {
              updateData.p11d_price = parseFloat(capRecord.P11D);
            }

            // Fuel type
            if (capRecord.Fuel_Type) {
              updateData.fuel_type = capRecord.Fuel_Type;
            }

            // Transmission
            if (capRecord.TRANSMISSION) {
              updateData.transmission = capRecord.TRANSMISSION;
            }

            // Body style
            if (capRecord.Body_Style) {
              updateData.body_style = capRecord.Body_Style;
            }

            // Model year
            if (capRecord.Model_Year && !isNaN(parseInt(capRecord.Model_Year))) {
              updateData.model_year = parseInt(capRecord.Model_Year);
            }

            // Euro standard
            if (capRecord.EURO_RATING && !isNaN(parseInt(capRecord.EURO_RATING))) {
              updateData.euro_standard = parseInt(capRecord.EURO_RATING);
            }

            // BIK percentage (from CO2)
            if (updateData.co2_emissions) {
              updateData.bik_percentage = this.calculateBIK(updateData.co2_emissions, capRecord.Fuel_Type);
            }
          }

          // Add Lex codes if available
          if (lexRecord) {
            updateData.lex_make_code = lexRecord.makeCode;
            updateData.lex_model_code = lexRecord.modelCode;
            updateData.lex_variant_code = lexRecord.variantCode;
          }

          // Only update if we have data
          if (Object.keys(updateData).length === 0) {
            continue;
          }

          // Update the vehicle
          const { error: updateError } = await supabase
            .from('vehicles')
            .update(updateData)
            .eq('id', vehicle.id);

          if (updateError) {
            console.error(`${progress} ❌ Error updating vehicle ${vehicle.id}:`, updateError.message);
            this.stats.errors++;
            continue;
          }

          this.stats.updated++;

          // Log progress every 100 vehicles
          if (this.stats.updated % 100 === 0) {
            console.log(`${progress} ✅ Enriched ${this.stats.updated} vehicles...`);
          }

        } catch (error) {
          console.error(`${progress} ❌ Error processing vehicle:`, error.message);
          this.stats.errors++;
        }
      }

      // Print summary
      console.log('');
      console.log('📊 Enrichment Summary');
      console.log('='.repeat(50));
      console.log(`Total vehicles in CAP CSV:  ${this.stats.totalInCSV}`);
      console.log(`Vehicles in Supabase:        ${vehicles.length}`);
      console.log(`Matched to CAP data:         ${this.stats.capMatched}`);
      console.log(`Matched to Lex codes:        ${this.stats.lexMatched}`);
      console.log(`Successfully enriched:       ${this.stats.updated}`);
      console.log(`Not matched:                 ${this.stats.notMatched}`);
      console.log(`Errors:                      ${this.stats.errors}`);
      console.log('');

      const successRate = (this.stats.updated / vehicles.length * 100).toFixed(1);
      const capRate = (this.stats.capMatched / vehicles.length * 100).toFixed(1);
      const lexRate = (this.stats.lexMatched / vehicles.length * 100).toFixed(1);
      console.log(`✅ Overall enrichment rate: ${successRate}%`);
      console.log(`   CAP match rate: ${capRate}%`);
      console.log(`   Lex match rate: ${lexRate}%`);
      console.log('');

    } catch (error) {
      console.error('❌ Enrichment failed:', error.message);
      throw error;
    }
  }

  /**
   * Find best Lex entry matching given make/model/variant from Supabase
   * Strategy:
   *  1) Restrict candidates by make+model (fast index)
   *  2) Compare normalized tokens of (model + variant) vs Lex (modelName + variantName)
   *  3) Use includes() heuristics and Jaccard token overlap; pick the best above threshold
   */
  findBestLexMatch(make, model, variant) {
    const makeKey = normalizeVehicleName(make);
    const modelKey = normalizeVehicleName(model);
    const mmKey = `${makeKey}|${modelKey}`;

    let candidates = this.lexByMakeModel.get(mmKey);

    // Fallback: broaden to all from the same make if no model-level candidates
    if (!candidates || candidates.length === 0) {
      candidates = this.lexByMake.get(makeKey) || [];
    }

    if (!candidates || candidates.length === 0) return null;

    const supaComposite = normalizeForCompare(`${model} ${variant}`);

    // Simple token-based Jaccard
    const tokens = (s) => new Set(s.split(' ').filter(Boolean));
    const jaccard = (a, b) => {
      const setA = tokens(a);
      const setB = tokens(b);
      const intersectionSize = [...setA].filter(x => setB.has(x)).length;
      const unionSize = new Set([...setA, ...setB]).size || 1;
      return intersectionSize / unionSize;
    };

    let best = { entry: null, score: 0, included: false };

    for (const entry of candidates) {
      const lexComposite = normalizeForCompare(`${entry.modelName} ${entry.variantName}`);

      // Heuristic: either side contains the other (post-normalization)
      const includeHit = lexComposite.includes(supaComposite) || supaComposite.includes(lexComposite);

      const score = jaccard(supaComposite, lexComposite);

      const isBetter =
        (includeHit && !best.included) || // prefer include match over non-include
        (includeHit === best.included && score > best.score);

      if (isBetter) {
        best = { entry, score, included: includeHit };
      }
    }

    // Acceptance thresholds:
    // - If includeHit: accept
    // - Else require decent token overlap
    if (best.entry && (best.included || best.score >= 0.45)) {
      return best.entry;
    }

    return null;
  }

  /**
   * Calculate BIK percentage based on CO2 emissions and fuel type
   * Simplified calculation - should be updated with current HMRC rates
   */
  calculateBIK(co2, fuelType) {
    // Electric vehicles
    if (fuelType === 'Electric' || fuelType === 'E' || co2 === 0) {
      return 2; // 2024/25 rate for zero emission
    }

    // Plug-in hybrid electric vehicles (PHEV)
    if (fuelType === 'Plug-in Hybrid Electric' || fuelType === 'PHEV') {
      // Simplified - actual rate depends on electric range
      if (co2 <= 50) return 8;
      return Math.min(37, Math.max(8, Math.floor((co2 - 50) / 5) + 8));
    }

    // Petrol/Diesel vehicles
    if (co2 <= 50) return 15;
    if (co2 >= 170) return 37;

    // Between 51-170 g/km: 15% + 1% per 5g/km
    return Math.min(37, 15 + Math.floor((co2 - 50) / 5));
  }
}

// Run the enricher
const csvFilePath = process.argv[2] || '/Users/alastairblair/Development/SplitWheel/Generic Ratebooks_56786_CHNM_Cap_20251110_000116.csv';
const lexCodesDir = process.argv[3] || '/Users/alastairblair/Development/SplitWheel/Lease Analysis/LexRobot/LexVehicleCodes';

const enricher = new VehicleEnricher(csvFilePath, lexCodesDir);
enricher.run()
  .then(() => {
    console.log('✅ Enrichment completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Enrichment failed:', error);
    process.exit(1);
  });
