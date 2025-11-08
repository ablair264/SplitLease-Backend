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
  try {
    await leaseDB.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

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
      // CSV buffer parse
      vehicleData = await new Promise((resolve, reject) => {
        const results = [];
        const readable = new Readable();
        readable.push(file.buffer);
        readable.push(null);
        readable
          .pipe(csv())
          .on('data', (row) => {
            const vehicle = { provider_name: providerName };
            Object.entries(fieldMappings).forEach(([field, index]) => {
              const header = Object.keys(row)[index];
              if (header && row[header] !== undefined) {
                vehicle[field] = row[header];
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
      const validVehicles = vehicleData.filter((v) => v.manufacturer && v.model && v.monthly_rental);
      const result = await leaseDB.processVehicleData(session.sessionId, validVehicles);

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
