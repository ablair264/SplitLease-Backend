const { Pool } = require('pg');

class LeaseAnalysisDB {
  constructor(config = {}) {
    const connectionString = config.connectionString || process.env.DATABASE_URL;
    const useSSL = process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production';
    const poolMax = Number(process.env.DB_POOL_MAX || 10);
    const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000);
    const keepAlive = true;
    const keepAliveDelay = Number(process.env.DB_KEEPALIVE_DELAY_MS || 15000);

    const parsePort = () => {
      const raw = config.port ?? process.env.DB_PORT;
      if (!raw) return 5432;
      const m = String(raw).match(/\d+/);
      const n = m ? Number(m[0]) : NaN;
      return Number.isFinite(n) ? n : 5432;
    };

    if (connectionString) {
      this.pool = new Pool({
        connectionString,
        ssl: useSSL ? { rejectUnauthorized: false } : undefined,
        max: poolMax,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: connectTimeout,
        keepAlive,
        keepAliveInitialDelayMillis: keepAliveDelay,
      });
      try {
        const u = new URL(connectionString)
        console.log('DB: using connection string host=%s port=%s db=%s ssl=%s', u.hostname, u.port || '(default)', (u.pathname || '').replace(/^\//, ''), useSSL)
      } catch (e) {
        console.warn('DB: invalid DATABASE_URL (parse failed): %s', e.message)
      }
    } else {
      this.pool = new Pool({
        user: config.user || process.env.DB_USER || 'postgres',
        host: config.host || process.env.DB_HOST || 'localhost',
        database: config.database || process.env.DB_NAME || 'lease_analysis',
        password: config.password || process.env.DB_PASSWORD || 'password',
        port: parsePort(),
        max: poolMax,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: connectTimeout,
        ssl: useSSL ? { rejectUnauthorized: false } : undefined,
        keepAlive,
        keepAliveInitialDelayMillis: keepAliveDelay,
      });
      console.log(
        'DB: using discrete config host=%s port=%s db=%s ssl=%s',
        process.env.DB_HOST || 'localhost',
        parsePort(),
        process.env.DB_NAME || 'lease_analysis',
        useSSL
      )
    }
  }

  async query(text, params) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  // ===================== BEST DEALS =====================
  async getBestDeals(filters = {}) {
    const {
      manufacturer,
      fuelType,
      maxMonthly,
      minScore,
      bodyStyle,
      limit = 100,
      offset = 0,
    } = filters;

    try {
      const result = await this.query(
        `SELECT * FROM get_best_deals($1, $2, $3, $4, $5, $6, $7)`,
        [manufacturer, fuelType, maxMonthly, minScore, bodyStyle, limit, offset]
      );
      return { success: true, data: result.rows, total: result.rows.length };
    } catch (error) {
      console.error('Error fetching best deals:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  async getBestDealsByTerms(termMonths = 36, annualMileage = 10000, limit = 100) {
    try {
      const result = await this.query(
        `SELECT * FROM get_best_deals_by_terms($1, $2, $3)`,
        [termMonths, annualMileage, limit]
      );
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Error fetching deals by terms:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  async getVehicleOffersComparison(vehicleId) {
    try {
      const result = await this.query(
        `SELECT * FROM get_vehicle_offers_comparison($1)`,
        [vehicleId]
      );
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Error fetching vehicle offers:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  // ===================== DASHBOARD =====================
  async getMarketStats() {
    try {
      const result = await this.query('SELECT * FROM get_market_stats()');
      return { success: true, data: result.rows[0] || {} };
    } catch (error) {
      console.error('Error fetching market stats:', error);
      return { success: false, error: error.message, data: {} };
    }
  }

  async getProviderPerformance() {
    try {
      const result = await this.query('SELECT * FROM get_provider_performance()');
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Error fetching provider performance:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  // ===================== UPLOADS =====================
  async createUploadSession(providerName, filename, fileFormat, totalRows, uploadedBy) {
    try {
      let providerResult = await this.query(
        'SELECT id FROM providers WHERE name = $1',
        [providerName.toLowerCase()]
      );

      let providerId;
      if (providerResult.rows.length === 0) {
        const newProvider = await this.query(
          'INSERT INTO providers (name, display_name) VALUES ($1, $2) RETURNING id',
          [providerName.toLowerCase(), providerName]
        );
        providerId = newProvider.rows[0].id;
      } else {
        providerId = providerResult.rows[0].id;
      }

      const result = await this.query(
        `INSERT INTO upload_sessions (
            provider_id, filename, file_format, total_rows, uploaded_by
         ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [providerId, filename, fileFormat, totalRows, uploadedBy]
      );

      return { success: true, sessionId: result.rows[0].id, providerId };
    } catch (error) {
      console.error('Error creating upload session:', error);
      return { success: false, error: error.message };
    }
  }

  async processVehicleData(sessionId, vehicleData) {
    const client = await this.pool.connect();
    let processedCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      await client.query('BEGIN');

      for (const vehicle of vehicleData) {
        try {
          await client.query('SAVEPOINT sp_row');
          await client.query(
            `SELECT insert_lease_offer(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19, $20, $21, $22
            )`,
            [
              vehicle.provider_name,
              sessionId,
              // Required identifiers (match queries.sql signature)
              vehicle.manufacturer,
              vehicle.model,
              vehicle.monthly_rental,
              vehicle.term_months || 36,
              vehicle.annual_mileage || 10000,
              // Optional identifiers/details
              vehicle.cap_code || null,
              vehicle.variant || null,
              vehicle.p11d_price || null,
              // Vehicle details
              vehicle.fuel_type || null,
              vehicle.mpg || null,
              vehicle.co2_emissions || null,
              vehicle.electric_range || null,
              vehicle.insurance_group || null,
              vehicle.body_style || null,
              vehicle.transmission || null,
              // Lease terms optional
              vehicle.upfront_payment || 0,
              vehicle.maintenance_included || false,
              vehicle.admin_fee || 0,
              vehicle.offer_valid_until || null,
              vehicle.special_conditions || null,
            ]
          );
          await client.query('RELEASE SAVEPOINT sp_row');
          processedCount++;
        } catch (error) {
          errorCount++;
          // Roll back only the current row so we can continue
          try { await client.query('ROLLBACK TO SAVEPOINT sp_row'); } catch (_) {}
          errors.push({
            vehicle: `${vehicle.manufacturer} ${vehicle.model}`,
            error: error.message,
          });
          console.error(
            `Error processing vehicle ${vehicle.manufacturer} ${vehicle.model}:`,
            error
          );
        }
      }

      await client.query(
        `UPDATE upload_sessions 
           SET processed_rows = $1,
               status = $2,
               processing_completed_at = CURRENT_TIMESTAMP,
               error_message = $3
         WHERE id = $4`,
        [
          processedCount,
          'completed',
          errors.length > 0 ? JSON.stringify(errors.slice(0, 10)) : null,
          sessionId,
        ]
      );

      await client.query('COMMIT');
      return {
        success: true,
        processed: processedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 5),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction error:', error);
      return {
        success: false,
        error: error.message,
        processed: processedCount,
        errors: errorCount + 1,
      };
    } finally {
      client.release();
    }
  }

  // Process a chunk of vehicle data without touching upload_sessions status
  async processVehicleDataChunk(sessionId, vehicleData) {
    const client = await this.pool.connect();
    let processedCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      await client.query('BEGIN');

      for (const vehicle of vehicleData) {
        try {
          await client.query('SAVEPOINT sp_row');
          await client.query(
            `SELECT insert_lease_offer(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19, $20, $21, $22
            )`,
            [
              vehicle.provider_name,
              sessionId,
              // Required identifiers
              vehicle.manufacturer,
              vehicle.model,
              vehicle.monthly_rental,
              vehicle.term_months || 36,
              vehicle.annual_mileage || 10000,
              // Optional identifiers/details
              vehicle.cap_code || null,
              vehicle.variant || null,
              vehicle.p11d_price || null,
              // Vehicle details
              vehicle.fuel_type || null,
              vehicle.mpg || null,
              vehicle.co2_emissions || null,
              vehicle.electric_range || null,
              vehicle.insurance_group || null,
              vehicle.body_style || null,
              vehicle.transmission || null,
              // Lease terms optional
              vehicle.upfront_payment || 0,
              vehicle.maintenance_included || false,
              vehicle.admin_fee || 0,
              vehicle.offer_valid_until || null,
              vehicle.special_conditions || null,
            ]
          );
          await client.query('RELEASE SAVEPOINT sp_row');
          processedCount++;
        } catch (error) {
          errorCount++;
          try { await client.query('ROLLBACK TO SAVEPOINT sp_row'); } catch (_) {}
          errors.push({ vehicle: `${vehicle.manufacturer} ${vehicle.model}`, error: error.message });
          console.error(`Error processing vehicle ${vehicle.manufacturer} ${vehicle.model}:`, error);
        }
      }

      await client.query('COMMIT');
      return { success: true, processed: processedCount, errors: errorCount, errorDetails: errors.slice(0, 5) };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Chunk transaction error:', error);
      return { success: false, error: error.message, processed: processedCount, errors: errorCount + 1 };
    } finally {
      client.release();
    }
  }

  async refreshBestDeals() {
    try {
      const result = await this.query('SELECT refresh_all_best_deals()');
      return { success: true, processed: result.rows[0].refresh_all_best_deals };
    } catch (error) {
      console.error('Error refreshing best deals:', error);
      return { success: false, error: error.message };
    }
  }

  // ===================== STATUS =====================
  async getUploadStatus(sessionId) {
    try {
      const q = await this.query(
        `SELECT id, provider_id, filename, file_format, total_rows, processed_rows, status,
                processing_started_at, processing_completed_at, error_message
           FROM upload_sessions
          WHERE id = $1`,
        [sessionId]
      )
      if (q.rows.length === 0) return { success: false, error: 'not_found' }
      return { success: true, data: q.rows[0] }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ===================== MAPPINGS =====================
  async saveMapping(providerName, columnMappings, headerNames) {
    try {
      // Validate and serialize columnMappings
      let columnMappingsJson
      if (typeof columnMappings === 'string') {
        // Validate it's valid JSON
        try {
          JSON.parse(columnMappings)
          columnMappingsJson = columnMappings
        } catch (e) {
          throw new Error(`Invalid JSON in columnMappings: ${e.message}`)
        }
      } else if (typeof columnMappings === 'object') {
        columnMappingsJson = JSON.stringify(columnMappings || {})
      } else {
        columnMappingsJson = '{}'
      }

      // Validate and serialize headerNames
      let headerNamesJson = null
      if (headerNames !== null && headerNames !== undefined) {
        if (typeof headerNames === 'string') {
          // Validate it's valid JSON
          try {
            JSON.parse(headerNames)
            headerNamesJson = headerNames
          } catch (e) {
            throw new Error(`Invalid JSON in headerNames: ${e.message}`)
          }
        } else if (Array.isArray(headerNames)) {
          headerNamesJson = JSON.stringify(headerNames)
        } else {
          throw new Error(`headerNames must be an array or null, got ${typeof headerNames}`)
        }
      }

      const result = await this.query(
        `INSERT INTO provider_mappings (provider_name, column_mappings, header_names)
           VALUES (lower($1), $2::jsonb, $3::jsonb)
           ON CONFLICT (provider_name)
           DO UPDATE SET column_mappings = EXCLUDED.column_mappings,
                         header_names = EXCLUDED.header_names,
                         updated_at = CURRENT_TIMESTAMP
         RETURNING id, provider_name, column_mappings, header_names, updated_at`,
        [providerName, columnMappingsJson, headerNamesJson]
      )
      return { success: true, data: result.rows[0] }
    } catch (e) {
      console.error('Error saving mapping:', e)
      return { success: false, error: e.message }
    }
  }

  async getMappings(limit = 50) {
    try {
      const q = await this.query(
        `SELECT id, provider_name, column_mappings, header_names, updated_at
           FROM provider_mappings
          ORDER BY updated_at DESC
          LIMIT $1`,
        [limit]
      )
      return { success: true, data: q.rows }
    } catch (e) {
      return { success: false, error: e.message, data: [] }
    }
  }

  async getMappingByProvider(providerName) {
    try {
      const q = await this.query(
        `SELECT id, provider_name, column_mappings, header_names, updated_at
           FROM provider_mappings
          WHERE provider_name = lower($1)
          LIMIT 1`,
        [providerName]
      )
      if (q.rows.length === 0) return { success: false, error: 'not_found' }
      return { success: true, data: q.rows[0] }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ===================== UTILITIES =====================
  async getManufacturers() {
    try {
      const result = await this.query(
        `SELECT DISTINCT manufacturer FROM best_deals_cache ORDER BY manufacturer`
      );
      return { success: true, data: result.rows.map((r) => r.manufacturer) };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }

  async getFuelTypes() {
    try {
      const result = await this.query(
        `SELECT DISTINCT fuel_type FROM best_deals_cache WHERE fuel_type IS NOT NULL ORDER BY fuel_type`
      );
      return { success: true, data: result.rows.map((r) => r.fuel_type) };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }

  // ===================== DASHBOARD FEEDS =====================
  async getRecentUploads(limit = 10) {
    try {
      const q = await this.query(
        `SELECT us.id, us.filename, us.status, us.processed_rows, us.total_rows, us.created_at,
                COALESCE(p.display_name, p.name) AS provider_name
           FROM upload_sessions us
           LEFT JOIN providers p ON p.id = us.provider_id
          ORDER BY us.created_at DESC
          LIMIT $1`,
        [limit]
      )
      return { success: true, data: q.rows }
    } catch (e) {
      console.error('Error fetching recent uploads:', e)
      return { success: false, error: e.message, data: [] }
    }
  }

  async getTopOffers(limit = 10) {
    try {
      const q = await this.query(
        `SELECT manufacturer, model, best_monthly_rental, best_provider_name, best_deal_score
           FROM best_deals_cache
          ORDER BY best_deal_score DESC NULLS LAST, best_monthly_rental ASC
          LIMIT $1`,
        [limit]
      )
      return { success: true, data: q.rows }
    } catch (e) {
      console.error('Error fetching top offers:', e)
      return { success: false, error: e.message, data: [] }
    }
  }

  // ===================== SALARY SACRIFICE =====================
  async listSSCustomers({ search = '', sort = 'orders_desc', limit = 100, offset = 0 } = {}) {
    try {
      const where = []
      const params = []
      if (search) {
        params.push(`%${search.toLowerCase()}%`)
        params.push(`%${search.toLowerCase()}%`)
        where.push(`(lower(name) LIKE $${params.length - 1} OR lower(email) LIKE $${params.length})`)
      }
      let order = 'vehicles_ordered DESC'
      if (sort === 'orders_asc') order = 'vehicles_ordered ASC'
      if (sort === 'newest') order = 'created_at DESC'
      if (sort === 'oldest') order = 'created_at ASC'

      params.push(limit); params.push(offset)
      const q = await this.query(
        `SELECT id, name, region, email, phone, vehicles_ordered, created_at
           FROM ss_customers
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY ${order}
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )

      const m = await this.query('SELECT COUNT(*) AS live_customers, COALESCE(SUM(vehicles_ordered),0) AS vehicles_ordered FROM ss_customers')
      const metrics = {
        live_customers: Number(m.rows[0]?.live_customers || 0),
        vehicles_ordered: Number(m.rows[0]?.vehicles_ordered || 0),
        vehicles_delivered: 0,
      }
      return { success: true, data: q.rows, metrics }
    } catch (e) {
      console.error('SS customers list error:', e)
      return { success: false, error: e.message, data: [], metrics: { live_customers: 0, vehicles_ordered: 0, vehicles_delivered: 0 } }
    }
  }

  async listSSEnquiries({ search = '', limit = 100, offset = 0 } = {}) {
    try {
      const params = []
      let where = ''
      if (search) {
        params.push(`%${search.toLowerCase()}%`)
        params.push(`%${search.toLowerCase()}%`)
        params.push(`%${search.toLowerCase()}%`)
        where = `WHERE lower(customer_name) LIKE $1 OR lower(customer_email) LIKE $2 OR lower(customer_phone) LIKE $3`
      }
      params.push(limit); params.push(offset)
      const q = await this.query(
        `SELECT id, customer_name, customer_email AS email, customer_phone AS phone, salesperson, referrer, status, created_at
           FROM ss_enquiries
          ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )
      return { success: true, data: q.rows }
    } catch (e) {
      console.error('SS enquiries list error:', e)
      return { success: false, error: e.message, data: [] }
    }
  }

  async createSSEnquiry(payload) {
    try {
      const r = await this.query(
        `INSERT INTO ss_enquiries (
          customer_id, customer_name, customer_address, customer_phone, customer_email,
          primary_contact_name, primary_contact_phone, primary_contact_email,
          salesperson, referrer, status, notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
        ) RETURNING id`,
        [
          payload.customer_id || null,
          payload.customerName,
          payload.customerAddress || null,
          payload.customerPhone || null,
          payload.customerEmail || null,
          payload.primaryName || null,
          payload.primaryPhone || null,
          payload.primaryEmail || null,
          payload.salesperson || null,
          payload.referrer || null,
          payload.status || 'Draft',
          payload.notes || null,
        ]
      )
      return { success: true, id: r.rows[0].id }
    } catch (e) {
      console.error('SS create enquiry error:', e)
      return { success: false, error: e.message }
    }
  }

  async reportSSEnquiriesBySalesperson(salesperson) {
    try {
      const q = await this.query(
        `SELECT customer_name, salesperson, referrer, status, notes, created_at
           FROM ss_enquiries
          WHERE salesperson = $1
          ORDER BY created_at DESC`,
        [salesperson]
      )
      return { success: true, data: q.rows }
    } catch (e) {
      return { success: false, error: e.message, data: [] }
    }
  }

  async searchVehicles(query, limit = 20) {
    try {
      const result = await this.query(
        `SELECT DISTINCT 
            v.id, v.cap_code, v.manufacturer, v.model, v.variant,
            bdc.best_monthly_rental, bdc.best_provider_name, bdc.best_deal_score
         FROM vehicles v
         LEFT JOIN best_deals_cache bdc ON v.id = bdc.vehicle_id
         WHERE v.search_vector @@ plainto_tsquery('english', $1)
            OR similarity(v.make_model_variant_normalized, lower($1)) > 0.3
         ORDER BY 
            ts_rank(v.search_vector, plainto_tsquery('english', $1)) DESC,
            similarity(v.make_model_variant_normalized, lower($1)) DESC
         LIMIT $2`,
        [query, limit]
      );
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Error searching vehicles:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  // ===================== DRIVALIA AUTOMATION =====================
  async getDrivaliaJobs() {
    try {
      const result = await this.query(
        `SELECT id, action_type, vehicle_count, success_count, failure_count, 
                duration_seconds, error_details, created_at,
                CASE 
                  WHEN failure_count > 0 THEN 'failed'
                  WHEN success_count = vehicle_count THEN 'completed' 
                  WHEN success_count > 0 THEN 'processing'
                  ELSE 'pending'
                END as status
         FROM automation_logs 
         WHERE action_type = 'drivalia_quotes'
         ORDER BY created_at DESC 
         LIMIT 50`
      );
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Error fetching Drivalia jobs:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  async submitDrivaliaJob(payload) {
    try {
      const { vehicles, config } = payload;
      const vehicleCount = vehicles?.length || 0;
      
      if (vehicleCount === 0) {
        return { success: false, error: 'No vehicles provided' };
      }

      // Create automation log entry
      const result = await this.query(
        `INSERT INTO automation_logs (action_type, vehicle_count, success_count, failure_count, duration_seconds, error_details)
         VALUES ('drivalia_quotes', $1, 0, 0, 0, $2)
         RETURNING id`,
        [vehicleCount, JSON.stringify({ config, vehicles: vehicles.slice(0, 5) })] // Store sample for debugging
      );

      const jobId = result.rows[0].id;

      // Here you would typically start the background job
      // For now, we'll return the job ID and let the automation run separately
      this.processDrivaliaJobInBackground(jobId, vehicles, config).catch(console.error);

      return { 
        success: true, 
        data: { 
          jobId,
          vehicleCount,
          status: 'pending',
          message: 'Job submitted successfully'
        }
      };
    } catch (error) {
      console.error('Error submitting Drivalia job:', error);
      return { success: false, error: error.message };
    }
  }

  async processDrivaliaJobInBackground(jobId, vehicles, config) {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    try {
      const { DrivaliaAPI } = require('./drivaliaAPI');
      const drivaliaAPI = new DrivaliaAPI();
      
      console.log(`Starting Drivalia job ${jobId} with ${vehicles.length} vehicles`);
      
      // Login to Drivalia
      await drivaliaAPI.login();
      console.log('Successfully logged into Drivalia API');
      
      // Process vehicles in batch
      const results = await drivaliaAPI.processBatch(vehicles, config);
      
      // Store results and count successes/failures
      for (const result of results) {
        if (result.success && result.quote) {
          try {
            await this.storeDrivaliaQuote(jobId, result.quote);
            successCount++;
          } catch (storeError) {
            console.error('Error storing quote:', storeError);
            failureCount++;
            errors.push({ vehicle: result.quote.vehicle, error: storeError.message });
          }
        } else {
          failureCount++;
          errors.push({ 
            vehicle: result.vehicle, 
            error: result.error || 'Unknown error' 
          });
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`Drivalia job ${jobId} completed: ${successCount} success, ${failureCount} failed in ${duration}s`);

      // Update automation log
      await this.query(
        `UPDATE automation_logs 
         SET success_count = $1, failure_count = $2, duration_seconds = $3, 
             error_details = $4
         WHERE id = $5`,
        [successCount, failureCount, duration, JSON.stringify({ errors: errors.slice(0, 10) }), jobId]
      );

    } catch (error) {
      console.error('Error processing Drivalia job:', error);
      await this.query(
        `UPDATE automation_logs 
         SET failure_count = $1, error_details = $2
         WHERE id = $3`,
        [vehicles.length, JSON.stringify({ error: error.message }), jobId]
      );
    }
  }

  async storeDrivaliaQuote(jobId, quote) {
    try {
      // Find or create vehicle
      const vehicleResult = await this.query(
        `INSERT INTO vehicles (manufacturer, model, variant, cap_code, p11d_price, co2_emissions, fuel_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (manufacturer, model, variant) 
         DO UPDATE SET 
           cap_code = COALESCE(EXCLUDED.cap_code, vehicles.cap_code),
           p11d_price = COALESCE(EXCLUDED.p11d_price, vehicles.p11d_price),
           co2_emissions = COALESCE(EXCLUDED.co2_emissions, vehicles.co2_emissions),
           last_updated = CURRENT_TIMESTAMP
         RETURNING id`,
        [
          quote.vehicle.make,
          quote.vehicle.model, 
          quote.vehicle.variant,
          quote.vehicle.capId ? quote.vehicle.capId.toString() : null,
          quote.vehicleData.p11d,
          quote.vehicleData.co2,
          'Petrol' // Default, could be extracted from Drivalia data
        ]
      );

      const vehicleId = vehicleResult.rows[0].id;

      // Store the quote in lex_quotes table (reusing existing structure)
      await this.query(
        `INSERT INTO lex_quotes (
          vehicle_id, manufacturer, model, variant, term, mileage,
          monthly_rental, initial_rental, total_cost, co2, p11d,
          maintenance, quote_id, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          vehicleId,
          quote.vehicle.make,
          quote.vehicle.model,
          quote.vehicle.variant,
          quote.config.term,
          quote.config.annualMileage,
          quote.monthlyPayment.net,
          quote.monthlyPayment.net * quote.config.term, // Initial rental estimate
          quote.totalCost.net,
          quote.vehicleData.co2,
          quote.vehicleData.p11d,
          quote.config.maintenance,
          `drivalia_job_${jobId}_${Date.now()}`,
          new Date()
        ]
      );

      console.log(`Stored quote for ${quote.vehicle.make} ${quote.vehicle.model} - £${quote.monthlyPayment.net}/month`);
    } catch (error) {
      console.error('Error storing Drivalia quote:', error);
      throw error;
    }
  }

  async getDrivaliaJobResults(jobId) {
    try {
      // For now, return the log entry
      // In the future, this would fetch actual quote results
      const result = await this.query(
        'SELECT * FROM automation_logs WHERE id = $1 AND action_type = $2',
        [jobId, 'drivalia_quotes']
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Job not found' };
      }

      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('Error fetching Drivalia job results:', error);
      return { success: false, error: error.message };
    }
  }

  async exportDrivaliaResults(jobId) {
    try {
      // For now, return a placeholder
      // In the future, this would generate an Excel file with quotes
      return { 
        success: false, 
        error: 'Export functionality not yet implemented' 
      };
    } catch (error) {
      console.error('Error exporting Drivalia results:', error);
      return { success: false, error: error.message };
    }
  }

  async close() {
    await this.pool.end();
  }
}

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
};

const leaseDB = new LeaseAnalysisDB(dbConfig);

module.exports = {
  LeaseAnalysisDB,
  leaseDB,
};
