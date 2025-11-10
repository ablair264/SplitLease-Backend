# Drivalia Job Worker

This document explains how to run the Drivalia job worker that processes vehicle quote requests from Supabase.

## Overview

The Drivalia Worker is a background service that:
1. Polls Supabase for pending jobs in the `drivalia_jobs` table
2. Fetches quotes from the Drivalia API for each vehicle
3. Stores results in the `drivalia_quotes` table
4. Updates job status in real-time

## Prerequisites

- Node.js >= 18
- Supabase project with `drivalia_jobs` and `drivalia_quotes` tables
- Supabase service role key (bypasses RLS)
- Drivalia API credentials

## Environment Variables

Add these to your `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Job Processing
JOB_POLL_INTERVAL_MS=5000  # Poll every 5 seconds
MAX_CONCURRENT_JOBS=3      # Process up to 3 jobs simultaneously
```

## Running the Worker

### Development Mode

Run the worker in development (logs to console):

```bash
npm run dev:worker
```

### Production Mode

Run the worker as a background service:

```bash
npm run worker
```

Or use a process manager like PM2:

```bash
# Install PM2
npm install -g pm2

# Start worker with PM2
pm2 start src/drivaliaWorker.js --name drivalia-worker

# View logs
pm2 logs drivalia-worker

# Stop worker
pm2 stop drivalia-worker

# Restart worker
pm2 restart drivalia-worker
```

## How It Works

### Job Flow

1. **User submits job** via frontend
   - Job is inserted into `drivalia_jobs` with status `pending`

2. **Worker polls for pending jobs**
   - Every 5 seconds (configurable via `JOB_POLL_INTERVAL_MS`)
   - Picks up to `MAX_CONCURRENT_JOBS` at a time

3. **Worker processes job**
   - Updates status to `processing`
   - Logs in to Drivalia API
   - For each vehicle:
     - Fetches quotes for all term/mileage combinations
     - Stores results in `drivalia_quotes` table
   - Updates status to `completed` or `failed`

4. **Frontend shows results**
   - Real-time updates via Supabase Realtime
   - User can view/download results

### Quote Processing

For each vehicle, the worker generates quotes for:
- **Terms**: 24, 36, 48, 60 months (or user-selected)
- **Mileages**: 5K, 8K, 10K, 12K, 15K, 20K, 25K, 30K miles (or user-selected)
- **Maintenance**: Included or not (user-selected)
- **Deposit**: Custom amount (user-selected)

## Monitoring

### Console Output

The worker provides detailed logs:

```bash
🤖 Drivalia Worker starting...
   Poll interval: 5000ms
   Max concurrent jobs: 3
✅ Drivalia Worker started successfully

📋 Found 2 pending job(s)

🚀 Processing job #123...
   Vehicles: 3
   Config: { terms: 'ALL', mileages: 'ALL', maintenance: false, deposit: 0 }
   📍 Processing: BMW 3 Series 320i M Sport
      ✅ Generated 32 quotes
   ✅ Job #123 completed!
      Success: 96 quotes
      Failures: 0
      Duration: 45s
```

### Error Handling

- **API Errors**: Retried automatically by Drivalia API client
- **Network Errors**: Job marked as failed with error details
- **Invalid Vehicles**: Skipped, other vehicles continue processing
- **Partial Failures**: Job still completes with success/failure counts

## Deployment

### Railway / Heroku

Add the worker as a separate service:

1. Create a new service/dyno
2. Set build command: `npm install`
3. Set start command: `npm run worker`
4. Add environment variables
5. Deploy!

### Docker

```dockerfile
# Dockerfile.worker
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/

CMD ["npm", "run", "worker"]
```

Build and run:

```bash
docker build -f Dockerfile.worker -t drivalia-worker .
docker run -d --env-file .env drivalia-worker
```

### Systemd (Linux)

Create `/etc/systemd/system/drivalia-worker.service`:

```ini
[Unit]
Description=Drivalia Job Worker
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/var/www/lease-analyzer-backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run worker
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable drivalia-worker
sudo systemctl start drivalia-worker
sudo systemctl status drivalia-worker
```

## Scaling

### Horizontal Scaling

Run multiple worker instances:
- Each worker polls independently
- Supabase handles locking (first worker to update wins)
- Safe for concurrent processing

### Vertical Scaling

Increase `MAX_CONCURRENT_JOBS`:
- More jobs processed simultaneously
- Requires more CPU/memory
- Limited by Drivalia API rate limits

## Troubleshooting

### Worker not picking up jobs

1. Check job status in Supabase:
   ```sql
   SELECT * FROM drivalia_jobs WHERE status = 'pending';
   ```

2. Verify environment variables:
   ```bash
   echo $SUPABASE_URL
   echo $SUPABASE_SERVICE_KEY
   ```

3. Check worker logs for errors

### Jobs stuck in processing

1. Find stuck jobs:
   ```sql
   SELECT * FROM drivalia_jobs
   WHERE status = 'processing'
   AND started_at < NOW() - INTERVAL '10 minutes';
   ```

2. Reset manually:
   ```sql
   UPDATE drivalia_jobs
   SET status = 'pending'
   WHERE id = <job_id>;
   ```

### Rate limiting issues

Drivalia API has rate limits (2 req/sec built-in):
- Reduce `MAX_CONCURRENT_JOBS`
- Increase delays in `drivaliaAPI.js`
- Monitor for 429 errors

## Development

### Testing locally

1. Create a test job in Supabase:
   ```sql
   INSERT INTO drivalia_jobs (user_id, vehicles, config, vehicle_count, status)
   VALUES (
     null,
     '[{"id": 1, "manufacturer": "BMW", "model": "3 Series", "variant": "320i"}]'::jsonb,
     '{"terms": "36", "mileages": "10000", "maintenance": false, "deposit": 0}'::jsonb,
     1,
     'pending'
   );
   ```

2. Start worker:
   ```bash
   npm run dev:worker
   ```

3. Watch console output for processing

### Modifying quote logic

Edit `src/drivaliaWorker.js`:
- Change term/mileage options
- Add custom calculations
- Modify quote formatting
- Add additional fields

## API Reference

### DrivaliaJobsService

Located in `src/supabase.js`:

```javascript
const { drivaliaJobsService } = require('./supabase');

// Get pending jobs
await drivaliaJobsService.getPendingJobs();

// Update job status
await drivaliaJobsService.updateJobStatus(jobId, 'processing');

// Insert quotes
await drivaliaJobsService.insertQuotes(jobId, quotes);

// Complete job
await drivaliaJobsService.completeJob(jobId, successCount, failureCount, duration);
```

### DrivaliaWorker

Located in `src/drivaliaWorker.js`:

```javascript
const DrivaliaWorker = require('./drivaliaWorker');

const worker = new DrivaliaWorker();
await worker.start();  // Start polling
worker.stop();         // Stop gracefully
```

## Support

For issues or questions:
1. Check logs for error messages
2. Verify Supabase connection
3. Test Drivalia API credentials
4. Review job records in database
