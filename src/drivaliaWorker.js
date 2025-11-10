/**
 * Drivalia Job Worker
 *
 * Polls Supabase for pending jobs and processes them
 * Fetches quotes from Drivalia API and stores results
 */

const { drivaliaJobsService } = require('./supabase');
const DrivaliaAPI = require('./drivaliaAPI');

require('dotenv').config();

const POLL_INTERVAL = parseInt(process.env.JOB_POLL_INTERVAL_MS) || 5000;
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS) || 3;

class DrivaliaWorker {
  constructor() {
    this.drivaliaAPI = new DrivaliaAPI();
    this.processingJobs = new Set();
    this.isRunning = false;
  }

  /**
   * Start the worker
   */
  async start() {
    console.log('🤖 Drivalia Worker starting...');
    console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
    console.log(`   Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);

    this.isRunning = true;

    // Initial poll
    await this.poll();

    // Set up recurring poll
    this.pollInterval = setInterval(() => {
      this.poll().catch(err => {
        console.error('❌ Poll error:', err);
      });
    }, POLL_INTERVAL);

    console.log('✅ Drivalia Worker started successfully\n');
  }

  /**
   * Stop the worker
   */
  stop() {
    console.log('⏹️  Stopping Drivalia Worker...');
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    console.log('✅ Drivalia Worker stopped');
  }

  /**
   * Poll for pending jobs
   */
  async poll() {
    try {
      // Check if we can accept more jobs
      if (this.processingJobs.size >= MAX_CONCURRENT_JOBS) {
        return;
      }

      // Get pending jobs
      const pendingJobs = await drivaliaJobsService.getPendingJobs();

      if (pendingJobs.length === 0) {
        return;
      }

      console.log(`📋 Found ${pendingJobs.length} pending job(s)`);

      // Process jobs (up to max concurrent)
      const jobsToProcess = pendingJobs.slice(0, MAX_CONCURRENT_JOBS - this.processingJobs.size);

      for (const job of jobsToProcess) {
        this.processJob(job).catch(err => {
          console.error(`❌ Error processing job ${job.id}:`, err);
        });
      }

    } catch (error) {
      console.error('❌ Poll error:', error);
    }
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    const jobId = job.id;
    const startTime = Date.now();

    // Mark as processing
    this.processingJobs.add(jobId);

    console.log(`\n🚀 Processing job #${jobId}...`);
    console.log(`   Vehicles: ${job.vehicle_count}`);
    console.log(`   Config:`, job.config);

    try {
      // Update job status to processing
      await drivaliaJobsService.startProcessingJob(jobId);

      // Parse config
      const config = job.config;
      const terms = config.terms === 'ALL'
        ? [24, 36, 48, 60]
        : [parseInt(config.terms)];

      const mileages = config.mileages === 'ALL'
        ? [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000]
        : [parseInt(config.mileages)];

      // Process each vehicle
      let successCount = 0;
      let failureCount = 0;
      const allQuotes = [];

      for (const vehicle of job.vehicles) {
        console.log(`   📍 Processing: ${vehicle.manufacturer} ${vehicle.model} ${vehicle.variant}`);

        try {
          // Get quotes for all term/mileage combinations
          for (const term of terms) {
            for (const mileage of mileages) {
              try {
                const quoteResult = await this.drivaliaAPI.calculateQuote({
                  make: vehicle.manufacturer,
                  model: vehicle.model,
                  variant: vehicle.variant,
                  term: term,
                  annualMileage: mileage,
                  maintenance: config.maintenance || false,
                  deposit: config.deposit || 0
                });

                if (quoteResult && quoteResult.monthlyPayment) {
                  // Format quote for database
                  const quote = {
                    vehicle_id: vehicle.id,
                    manufacturer: vehicle.manufacturer,
                    model: vehicle.model,
                    variant: vehicle.variant,
                    term: term,
                    mileage: mileage,
                    monthly_rental: quoteResult.monthlyPayment.net,
                    initial_payment: config.deposit || 0,
                    total_cost: quoteResult.totalCost?.net,
                    maintenance_included: config.maintenance || false,
                    supplier_name: 'Drivalia',
                    quote_reference: quoteResult.vehicle?.xrefCode,
                    additional_info: {
                      gross_monthly: quoteResult.monthlyPayment.gross,
                      vat: quoteResult.monthlyPayment.vat,
                      p11d: quoteResult.vehicleData?.p11d,
                      co2: quoteResult.vehicleData?.co2,
                      residual_value: quoteResult.residualValue
                    }
                  };

                  allQuotes.push(quote);
                  successCount++;
                }
              } catch (quoteError) {
                console.error(`      ⚠️  Failed term ${term}m / ${mileage} miles:`, quoteError.message);
                failureCount++;
              }
            }
          }

          console.log(`      ✅ Generated ${allQuotes.length} quotes`);

        } catch (vehicleError) {
          console.error(`      ❌ Failed vehicle:`, vehicleError.message);
          failureCount++;
        }
      }

      // Insert all quotes in bulk
      if (allQuotes.length > 0) {
        console.log(`   💾 Saving ${allQuotes.length} quotes to database...`);
        await drivaliaJobsService.insertQuotes(jobId, allQuotes);
      }

      // Calculate duration
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);

      // Mark job as completed
      await drivaliaJobsService.completeJob(jobId, successCount, failureCount, durationSeconds);

      console.log(`   ✅ Job #${jobId} completed!`);
      console.log(`      Success: ${successCount} quotes`);
      console.log(`      Failures: ${failureCount}`);
      console.log(`      Duration: ${durationSeconds}s\n`);

    } catch (error) {
      console.error(`❌ Job #${jobId} failed:`, error);

      // Mark job as failed
      await drivaliaJobsService.failJob(jobId, {
        error: error.message,
        stack: error.stack
      }, job.vehicle_count);

    } finally {
      // Remove from processing set
      this.processingJobs.delete(jobId);
    }
  }
}

// Start worker if run directly
if (require.main === module) {
  const worker = new DrivaliaWorker();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n📡 Received SIGINT, shutting down gracefully...');
    worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n📡 Received SIGTERM, shutting down gracefully...');
    worker.stop();
    process.exit(0);
  });

  // Start the worker
  worker.start().catch(err => {
    console.error('❌ Failed to start worker:', err);
    process.exit(1);
  });
}

module.exports = DrivaliaWorker;
