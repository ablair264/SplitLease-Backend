/**
 * Drivalia Hybrid Worker
 *
 * Uses browser to login and get session cookies,
 * then uses the /calculate/ API directly (bypasses UI complexity)
 *
 * This is the BEST approach because:
 * - Browser login works (no WAF issues)
 * - API calls work once we have valid session cookies
 * - Faster than full UI automation
 * - More reliable than scraping
 */

require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = require('node-fetch');
const { drivaliaJobsService } = require('./supabase');

puppeteer.use(StealthPlugin());

const POLL_INTERVAL = parseInt(process.env.JOB_POLL_INTERVAL_MS) || 5000;
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS) || 1;
const DRIVALIA_BASE_URL = 'https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html';
const DRIVALIA_LOGIN_URL = 'https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html#/login';
const DRIVALIA_API_URL = 'https://www.caafgenus3.co.uk/WebApp/api';

class DrivaliaHybridWorker {
  constructor() {
    this.processingJobs = new Set();
    this.browser = null;
    this.page = null;
    this.cookies = null;
    this.sessionData = null;
  }

  async initBrowser() {
    if (this.browser) return;

    console.log('🌐 Initializing browser...');

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await this.page.setViewport({ width: 1920, height: 1080 });

    console.log('✅ Browser initialized');
  }

  async ensureLoggedIn() {
    const username = process.env.DRIVALIA_USERNAME;
    const password = process.env.DRIVALIA_PASSWORD;

    if (!username || !password) {
      throw new Error('Missing DRIVALIA_USERNAME/DRIVALIA_PASSWORD env vars');
    }

    // Check if we already have valid cookies
    if (this.cookies) {
      try {
        const sessionTest = await this.apiCall('/user/data/session', 'GET');
        if (sessionTest && sessionTest.userName) {
          console.log('✅ Already logged in');
          return;
        }
      } catch (e) {
        // Session expired, need to re-login
        this.cookies = null;
      }
    }

    console.log('🔑 Logging in via browser...');

    // Navigate directly to login page
    await this.page.goto(DRIVALIA_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for login form
    try {
      await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });

      // Fill credentials
      await this.page.type('input[name="username"]', username, { delay: 100 });
      await this.page.type('input[name="password"]', password, { delay: 100 });

      // Click login button
      const loginButton = await this.page.$('button[data-hook="login.submit"]');
      if (loginButton) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          loginButton.click()
        ]);
      }
    } catch (e) {
      // Might already be logged in
    }

    // Wait a bit for session to establish
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract cookies from browser
    const pageCookies = await this.page.cookies();
    this.cookies = pageCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');

    // Test session
    const session = await this.apiCall('/user/data/session', 'GET');
    if (!session || !session.userName) {
      throw new Error('Login failed - no valid session');
    }

    this.sessionData = session;
    console.log(`✅ Logged in as: ${session.userName}`);
  }

  async apiCall(endpoint, method = 'GET', body = null) {
    const url = `${DRIVALIA_API_URL}${endpoint}`;

    const options = {
      method,
      headers: {
        'Cookie': this.cookies || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Origin': 'https://www.caafgenus3.co.uk',
        'Referer': 'https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html'
      }
    };

    if (body && method !== 'GET') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async findVariant(make, model, variant) {
    console.log(`🔍 Looking up: ${make} ${model} ${variant}`);

    // Get makes
    const makes = await this.apiCall('/asset/new/makes/104', 'GET'); // 104 = cars category
    const makeObj = makes.find(m =>
      m.name.toLowerCase().includes(make.toLowerCase())
    );

    if (!makeObj) throw new Error(`Make not found: ${make}`);
    console.log(`   Found make: ${makeObj.name} (ID: ${makeObj.id})`);

    // Get models
    const modelsBody = {
      category: "104",
      type: "N",
      assetSearchFilters: {
        makeId: makeObj.id,
        technicalDetailFilters: {},
        priceFrom: null,
        priceTo: null,
        showAdvancedFilters: false,
        makeDrivenByYear: false
      }
    };

    const models = await this.apiCall('/asset/models', 'POST', modelsBody);
    const modelObj = models.find(m =>
      m.name.toLowerCase().includes(model.toLowerCase())
    );

    if (!modelObj) throw new Error(`Model not found: ${model}`);
    console.log(`   Found model: ${modelObj.name} (ID: ${modelObj.id})`);

    // Search variants
    const searchBody = {
      category: "104",
      type: "N",
      assetSearchFilters: {
        makeId: makeObj.id,
        modelId: modelObj.id,
        technicalDetailFilters: {},
        priceFrom: null,
        priceTo: null,
        showAdvancedFilters: false,
        makeDrivenByYear: false
      }
    };

    const variants = await this.apiCall('/asset/search', 'POST', searchBody);
    const variantObj = variants.find(v =>
      v.variant.toLowerCase().includes(variant.toLowerCase()) ||
      v.fullName.toLowerCase().includes(variant.toLowerCase())
    );

    if (!variantObj) {
      console.log('   Available variants:', variants.slice(0, 5).map(v => v.variant));
      throw new Error(`Variant not found: ${variant}`);
    }

    console.log(`   Found variant: ${variantObj.variant} (ID: ${variantObj.variantId})`);

    return {
      makeId: makeObj.id,
      make: makeObj.name,
      modelId: modelObj.id,
      model: modelObj.name,
      variantId: variantObj.variantId,
      variant: variantObj.variant,
      salePrice: variantObj.salePrice,
      modelYear: variantObj.modelYear
    };
  }

  async calculateQuote(vehicle, term, annualMileage, maintenance = false, deposit = 0) {
    console.log(`💰 Calculating quote: ${term}m, ${annualMileage} miles`);

    const calculateBody = {
      customerType: "C",
      assets: [{
        type: "N",
        active: true,
        displayAssetInactive: false,
        variant: vehicle.variantId,
        selectedVariant: {
          makeId: vehicle.makeId,
          make: vehicle.make,
          modelId: vehicle.modelId,
          model: vehicle.model,
          modelYear: vehicle.modelYear,
          variantId: vehicle.variantId,
          variant: vehicle.variant
        },
        priceType: "gross",
        priceSetByUser: false,
        quantity: 1,
        assetCategory: "104",
        salePrice: vehicle.salePrice,
        overrideDepreciation: false
      }],
      fleetQuoteDetails: [{
        term: term,
        annualMileage: annualMileage,
        maintenanceIncluded: maintenance
      }],
      product: {
        id: 2104, // Contract Hire
        name: "Contract Hire",
        type: "LEASE"
      },
      calculation: {
        parameters: {
          term: term,
          assetMeterUsage: {
            type: "MI",
            multiplier: 1000,
            multiplicandMeterUsage: annualMileage / 1000,
            meterUsage: annualMileage
          },
          initialCapitalReduction: deposit || 0,
          maintenanceTerms: maintenance ? term : 0
        }
      }
    };

    const result = await this.apiCall('/calculate/', 'POST', calculateBody);

    if (!result || !result.groupedPaymentBreakdown) {
      throw new Error('Calculate API returned no results');
    }

    // Extract monthly rental from response
    const vehiclePayment = result.groupedPaymentBreakdown.find(item =>
      item.id === 0 && item.name && item.name.includes('Vehicle')
    );

    if (!vehiclePayment || !vehiclePayment.regularAmt) {
      throw new Error('Could not find vehicle payment in response');
    }

    return {
      monthlyRental: vehiclePayment.regularAmt.net,
      monthlyRentalGross: vehiclePayment.regularAmt.gross,
      totalCost: result.totalPayment?.net || null,
      totalCostGross: result.totalPayment?.gross || null,
      initialPayment: result.payment?.inAdvance?.net || deposit,
      fullResponse: result
    };
  }

  async processJob(job) {
    const jobId = job.id;
    const startTime = Date.now();

    this.processingJobs.add(jobId);

    console.log(`\n🚀 Processing job #${jobId}...`);
    console.log(`   Vehicles: ${job.vehicle_count}`);
    console.log(`   Config:`, job.config);

    try {
      await drivaliaJobsService.startProcessingJob(jobId);

      const config = job.config;
      const terms = config.terms === 'ALL'
        ? [24, 36, 48, 60]
        : [parseInt(config.terms)];

      const mileages = config.mileages === 'ALL'
        ? [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000]
        : [parseInt(config.mileages)];

      let successCount = 0;
      let failureCount = 0;
      const allQuotes = [];

      // Ensure logged in
      await this.ensureLoggedIn();

      for (const vehicle of job.vehicles) {
        console.log(`   📍 Processing: ${vehicle.manufacturer} ${vehicle.model}`);

        try {
          // Look up vehicle
          const drivaliaVehicle = await this.findVariant(
            vehicle.manufacturer,
            vehicle.model,
            vehicle.variant
          );

          // Get quotes for all combinations
          for (const term of terms) {
            for (const mileage of mileages) {
              try {
                const quoteResult = await this.calculateQuote(
                  drivaliaVehicle,
                  term,
                  mileage,
                  config.maintenance || false,
                  config.deposit || 0
                );

                const quote = {
                  vehicle_id: vehicle.id,
                  manufacturer: vehicle.manufacturer,
                  model: vehicle.model,
                  variant: vehicle.variant,
                  term: term,
                  mileage: mileage,
                  monthly_rental: quoteResult.monthlyRental,
                  initial_payment: quoteResult.initialPayment,
                  total_cost: quoteResult.totalCost,
                  maintenance_included: config.maintenance || false,
                  supplier_name: 'Drivalia',
                  quote_reference: null,
                  additional_info: {
                    gross_monthly: quoteResult.monthlyRentalGross,
                    gross_total: quoteResult.totalCostGross
                  }
                };

                allQuotes.push(quote);
                successCount++;
                console.log(`      ✅ ${term}m / ${mileage}mi: £${quoteResult.monthlyRental.toFixed(2)}/month`);

                // Rate limit
                await new Promise(r => setTimeout(r, 500));

              } catch (quoteError) {
                console.error(`      ❌ ${term}m / ${mileage}mi: ${quoteError.message}`);
                failureCount++;
              }
            }
          }

        } catch (vehicleError) {
          console.error(`      ❌ Vehicle lookup failed: ${vehicleError.message}`);
          failureCount++;
        }
      }

      // Save quotes
      if (allQuotes.length > 0) {
        console.log(`   💾 Saving ${allQuotes.length} quotes...`);
        await drivaliaJobsService.insertQuotes(jobId, allQuotes);
      }

      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      await drivaliaJobsService.completeJob(jobId, successCount, failureCount, durationSeconds);

      console.log(`   ✅ Job #${jobId} completed!`);
      console.log(`      Success: ${successCount} quotes`);
      console.log(`      Failures: ${failureCount}`);
      console.log(`      Duration: ${durationSeconds}s\n`);

    } catch (error) {
      console.error(`❌ Job #${jobId} failed:`, error);
      await drivaliaJobsService.failJob(jobId, {
        error: error.message,
        stack: error.stack
      }, job.vehicle_count);

    } finally {
      this.processingJobs.delete(jobId);
    }
  }

  async poll() {
    try {
      if (this.processingJobs.size >= MAX_CONCURRENT_JOBS) return;

      const pendingJobs = await drivaliaJobsService.getPendingJobs();
      if (pendingJobs.length === 0) return;

      console.log(`📋 Found ${pendingJobs.length} pending job(s)`);

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

  async start() {
    console.log('🤖 Drivalia Hybrid Worker starting...');
    console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
    console.log(`   Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);

    await this.initBrowser();
    await this.ensureLoggedIn();

    // Initial poll
    await this.poll();

    // Recurring poll
    this.pollInterval = setInterval(() => {
      this.poll().catch(err => console.error('Poll error:', err));
    }, POLL_INTERVAL);

    console.log('✅ Drivalia Hybrid Worker started\n');
  }

  async stop() {
    console.log('⏹️  Stopping...');
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.browser) await this.browser.close();
    console.log('✅ Stopped');
  }
}

if (require.main === module) {
  const worker = new DrivaliaHybridWorker();

  process.on('SIGINT', async () => {
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  });
}

module.exports = DrivaliaHybridWorker;
