require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { Readable } = require('stream');
const { leaseDB } = require('./db');

const app = express();

// CORS: allow all by default; set CORS_ORIGIN to restrict (comma-separated, supports * wildcards)
const corsEnv = process.env.CORS_ORIGIN || '*'
const allowList = corsEnv.split(',').map((s) => s.trim()).filter(Boolean)
const wildcardToRegex = (pattern) =>
  new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
const allowRegexes = allowList.map((p) => wildcardToRegex(p))
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true) // same-origin or curl
      if (allowList.includes('*')) return cb(null, true)
      const ok = allowRegexes.some((rx) => rx.test(origin))
      return cb(ok ? null : new Error('CORS not allowed'), ok)
    },
  })
)
app.use(express.json());

// Use in-memory uploads for platform portability (Railway, Cloud Run, etc.)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Basic request logger
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url} ` +
      `(ct=${req.headers['content-type'] || '-'} len=${req.headers['content-length'] || '-'})`
  )
  next()
})

// Root + Health
app.get('/', (req, res) => {
  res.status(200).send('OK')
})
app.get('/health', async (req, res) => {
  const debug = req.query && (req.query.debug === '1' || req.query.debug === 'true')
  try {
    await leaseDB.query('SELECT 1')
    const resp = { ok: true }
    if (debug) {
      const info = { usingConnectionString: !!process.env.DATABASE_URL }
      try {
        if (process.env.DATABASE_URL) {
          const u = new URL(process.env.DATABASE_URL)
          info.connectionHost = u.hostname
          info.connectionPort = u.port
          info.connectionDatabase = (u.pathname || '').replace(/^\//, '')
          info.connectionUser = u.username ? `${u.username.substring(0, 4)}***` : undefined
        } else {
          info.host = process.env.DB_HOST
          info.port = process.env.DB_PORT
          info.database = process.env.DB_NAME
          info.user = process.env.DB_USER ? `${process.env.DB_USER.substring(0, 4)}***` : undefined
          info.pgsslmode = process.env.PGSSLMODE
        }
      } catch (e) {
        info.parseError = e.message
      }
      resp.info = info
    }
    res.json(resp)
  } catch (e) {
    const errorResp = { ok: false, error: e.message }
    if (debug) errorResp.stack = e.stack
    res.status(500).json(errorResp)
  }
})

// =============================================
// BEST DEALS
// =============================================
app.get('/api/best-deals', async (req, res) => {
  try {
    const filters = {
      manufacturer: req.query.manufacturer || null,
      fuelType: req.query.fuelType || null,
      maxMonthly: req.query.maxMonthly ? parseFloat(req.query.maxMonthly) : null,
      minScore: req.query.minScore ? parseFloat(req.query.minScore) : null,
      bodyStyle: req.query.bodyStyle || null,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
    };
    const result = await leaseDB.getBestDeals(filters);
    if (!result.success) return res.status(500).json(result);
    res.json({ success: true, data: result.data, filters, count: result.data.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/best-deals/terms/:term/:mileage', async (req, res) => {
  try {
    const termMonths = parseInt(req.params.term);
    const annualMileage = parseInt(req.params.mileage);
    const limit = parseInt(req.query.limit) || 100;
    const result = await leaseDB.getBestDealsByTerms(termMonths, annualMileage, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/vehicle/:id/offers', async (req, res) => {
  try {
    const vehicleId = parseInt(req.params.id);
    const result = await leaseDB.getVehicleOffersComparison(vehicleId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// DASHBOARD
// =============================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const stats = await leaseDB.getMarketStats();
    const providers = await leaseDB.getProviderPerformance();
    res.json({ success: true, marketStats: stats.data, providerStats: providers.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/filters', async (req, res) => {
  try {
    const [manufacturers, fuelTypes] = await Promise.all([
      leaseDB.getManufacturers(),
      leaseDB.getFuelTypes(),
    ]);
    res.json({
      success: true,
      manufacturers: manufacturers.data,
      fuelTypes: fuelTypes.data,
      bodyStyles: ['hatchback', 'saloon', 'estate', 'suv', 'coupe', 'convertible', 'mpv', 'other'],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 20;
    if (!query || query.length < 2) {
      return res.json({ success: false, error: 'Query must be at least 2 characters' });
    }
    const result = await leaseDB.searchVehicles(query, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// UPLOADS
// =============================================
// Pre-handler to log before multer processes
app.post('/api/upload', (req, res, next) => {
  console.log('Starting upload handler...')
  next()
}, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const providerName = req.body.providerName;
    const fieldMappings = JSON.parse(req.body.fieldMappings || '{}');
    let headerNames = [];
    try {
      headerNames = JSON.parse(req.body.headerNames || '[]')
    } catch (e) {
      headerNames = []
    }

    if (!file || !providerName) {
      return res.status(400).json({ success: false, error: 'File and provider name are required' });
    }

    console.log('Upload received:', {
      providerName,
      fileName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    })

    const session = await leaseDB.createUploadSession(
      providerName,
      file.originalname,
      (file.mimetype || '').includes('excel') || file.originalname.endsWith('.xlsx') ? 'xlsx' : 'csv',
      0,
      req.body.uploadedBy || 'unknown'
    );
    if (!session.success) return res.status(500).json(session);

    let vehicleData = [];

    if ((file.mimetype || '').includes('excel') || file.originalname.endsWith('.xlsx')) {
      // Excel buffer parse
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const headers = jsonData[0];
      const dataRows = jsonData.slice(1);

      vehicleData = dataRows.map((row) => {
        const vehicle = { provider_name: providerName };
        Object.entries(fieldMappings).forEach(([field, index]) => {
          if (index !== undefined && row[index] !== undefined) {
            vehicle[field] = row[index];
          }
        });
        return vehicle;
      });
    } else {
      // CSV buffer parse with stable header order; prefer client-provided headerNames
      vehicleData = await new Promise((resolve, reject) => {
        const results = [];
        const readable = new Readable();
        readable.push(file.buffer);
        readable.push(null);
        let headerOrder = null;
        readable
          .pipe(csv())
          .on('headers', (headers) => {
            headerOrder = headers;
          })
          .on('data', (row) => {
            const vehicle = { provider_name: providerName };
            Object.entries(fieldMappings).forEach(([field, index]) => {
              const i = typeof index === 'string' ? parseInt(index) : index;
              const headerName = Array.isArray(headerNames) && headerNames.length > 0
                ? headerNames[i]
                : (Array.isArray(headerOrder) && i >= 0 ? headerOrder[i] : null);
              if (headerName && row[headerName] !== undefined) {
                vehicle[field] = row[headerName];
              }
            });
            results.push(vehicle);
          })
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    }

    await processAndRespond();

    async function processAndRespond() {
      // Normalize and coerce values before filtering
      const parseNumber = (val) => {
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return val;
        const s = String(val).replace(/[^0-9.+-]/g, '');
        if (!s) return null;
        const num = s.includes('.') ? parseFloat(s) : parseInt(s, 10);
        return isNaN(num) ? null : num;
      };
      const toBool = (val) => {
        if (typeof val === 'boolean') return val;
        if (val === null || val === undefined) return false;
        const s = String(val).trim().toLowerCase();
        return s === 'true' || s === 'yes' || s === 'y' || s === '1';
      };

      const normalized = vehicleData.map((v) => ({
        provider_name: providerName,
        cap_code: v.cap_code ?? v.capCode ?? null,
        manufacturer: v.manufacturer,
        model: v.model,
        variant: v.variant ?? null,
        p11d_price: parseNumber(v.p11d_price ?? v.p11d),
        fuel_type: v.fuel_type ?? v.fuelType ?? null,
        mpg: parseNumber(v.mpg),
        co2_emissions: parseNumber(v.co2_emissions ?? v.co2),
        electric_range: parseNumber(v.electric_range),
        insurance_group: parseNumber(v.insurance_group),
        body_style: v.body_style ?? null,
        transmission: v.transmission ?? null,
        monthly_rental: parseNumber(v.monthly_rental),
        upfront_payment: parseNumber(v.upfront_payment ?? v.upfront) || 0,
        term_months: parseNumber(v.term_months ?? v.term) || 36,
        annual_mileage: parseNumber(v.annual_mileage ?? v.mileage) || 10000,
        maintenance_included: toBool(v.maintenance_included ?? v.maintenance),
        admin_fee: parseNumber(v.admin_fee) || 0,
        offer_valid_until: v.offer_valid_until ?? null,
        special_conditions: v.special_conditions ?? null,
      }));

      const validVehicles = normalized.filter((v) => v.manufacturer && v.model && v.monthly_rental);
      const result = await leaseDB.processVehicleData(session.sessionId, validVehicles);

      // Update session total rows
      try {
        await leaseDB.query('UPDATE upload_sessions SET total_rows = $1 WHERE id = $2', [vehicleData.length, session.sessionId])
      } catch (e) {
        console.warn('Could not update total_rows for session', session.sessionId, e.message)
      }

      // Refresh best deals cache in background
      leaseDB.refreshBestDeals().catch(console.error);

      res.json({
        success: true,
        sessionId: session.sessionId,
        totalRows: vehicleData.length,
        validRows: validVehicles.length,
        processed: result.processed,
        errors: result.errors,
        errorDetails: result.errorDetails,
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/refresh-cache', async (req, res) => {
  try {
    const result = await leaseDB.refreshBestDeals();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err)
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File too large' })
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Lease Analysis API server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing server');
  leaseDB.close().then(() => process.exit(0)).catch(() => process.exit(0));
});

module.exports = app;
