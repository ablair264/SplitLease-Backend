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

  async refreshBestDeals() {
    try {
      const result = await this.query('SELECT refresh_all_best_deals()');
      return { success: true, processed: result.rows[0].refresh_all_best_deals };
    } catch (error) {
      console.error('Error refreshing best deals:', error);
      return { success: false, error: error.message };
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
