/**
 * Drivalia Browser Worker (Puppeteer-based)
 *
 * Uses browser automation instead of direct API calls to avoid WAF blocking.
 * Logs into the Drivalia web portal, navigates the UI, and scrapes quotes.
 */

require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { drivaliaJobsService } = require('./supabase');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const POLL_INTERVAL = parseInt(process.env.JOB_POLL_INTERVAL_MS) || 5000;
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS) || 1;
const DRIVALIA_BASE_URL = process.env.DRIVALIA_BASE_URL || 'https://www.caafgenus3.co.uk/WebApp/';
const DRIVALIA_LOGIN_URL = `${DRIVALIA_BASE_URL}#/login`;

class DrivaliaBrowserWorker {
  constructor() {
    this.processingJobs = new Set();
    this.browser = null;
    this.page = null;
  }

  async initBrowser() {
    if (this.browser) return;

    console.log('🌐 Initializing browser...');

    // Enhanced browser configuration for anti-bot evasion
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
        '--start-maximized'
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    this.page = await this.browser.newPage();

    // Set realistic user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Set realistic viewport
    await this.page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    });

    // Set realistic headers
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-GB,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    });

    // Hide webdriver and add realistic Chrome properties
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };

      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin"
          }
        ],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-GB', 'en', 'en-US'],
      });
    });

    this.page.setDefaultTimeout(90000);
    console.log('✅ Browser initialized');
  }

  async ensureLoggedIn() {
    const username = process.env.DRIVALIA_USERNAME;
    const password = process.env.DRIVALIA_PASSWORD;

    if (!username || !password) {
      throw new Error('Missing DRIVALIA_USERNAME/DRIVALIA_PASSWORD env vars');
    }

    console.log('🔐 Checking login status...');

    // Navigate to the app
    await this.page.goto(DRIVALIA_BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Check if already logged in
    const isLoggedIn = await this.page.evaluate(() => {
      // Check for dashboard or any logged-in indicator
      return !!(
        document.querySelector('[ng-click*="logout"]') ||
        document.querySelector('.user-menu') ||
        window.location.hash.includes('dashboard')
      );
    }).catch(() => false);

    if (isLoggedIn) {
      console.log('✅ Already logged in');
      return;
    }

    console.log('🔑 Logging in...');

    // Navigate to login page
    await this.page.goto(DRIVALIA_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for login form (Angular Material inputs)
    await this.page.waitForSelector('input[name="username"]', { timeout: 30000 });
    await this.page.waitForSelector('input[name="password"]', { timeout: 30000 });

    // Fill in credentials (with delay for Angular Material)
    await this.page.type('input[name="username"]', username, { delay: 100 });
    await this.page.type('input[name="password"]', password, { delay: 100 });

    // Submit form using the data-hook attribute
    const loginButton = await this.page.$('button[data-hook="login.submit"]');

    if (loginButton) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        loginButton.click()
      ]);
    } else {
      // Fallback: try generic submit button
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        this.page.click('button[type="submit"]')
      ]);
    }

    // Verify login succeeded
    const loginSucceeded = await this.page.evaluate(() => {
      return !window.location.hash.includes('login');
    });

    if (!loginSucceeded) {
      throw new Error('Login failed - still on login page');
    }

    console.log('✅ Login successful');
  }

  async navigateToQuotePage() {
    console.log('📄 Navigating to quote page...');

    // Look for the quote/calculator page in the menu
    // This will vary depending on Drivalia's UI structure
    const quoteMenuSelector = 'a[href*="quote"], a[href*="calculator"], a[href*="rental"]';

    try {
      await this.page.waitForSelector(quoteMenuSelector, { timeout: 10000 });
      await this.page.click(quoteMenuSelector);
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
      // If we can't find the menu item, try direct navigation
      await this.page.goto(`${DRIVALIA_BASE_URL}#/quote`, { waitUntil: 'networkidle2' });
    }

    console.log('✅ On quote page');
  }

  async searchVehicle(make, model, variant) {
    console.log(`🔍 Searching for: ${make} ${model} ${variant}`);

    // This is where you'll need to customize based on Drivalia's actual UI
    // The selectors below are examples and need to be updated

    // Select manufacturer
    await this.page.waitForSelector('select[name="make"], input[placeholder*="manufacturer"]', { timeout: 10000 });

    // Try dropdown first
    const makeSelector = await this.page.$('select[name="make"]');
    if (makeSelector) {
      await this.page.select('select[name="make"]', make);
    } else {
      // Try autocomplete input
      await this.page.type('input[placeholder*="manufacturer"]', make);
      await this.page.waitForSelector('.autocomplete-item, .dropdown-item', { timeout: 5000 });
      await this.page.click('.autocomplete-item, .dropdown-item');
    }

    // Wait for models to load
    await this.page.waitForTimeout(1000);

    // Select model
    const modelSelector = await this.page.$('select[name="model"]');
    if (modelSelector) {
      await this.page.select('select[name="model"]', model);
    } else {
      await this.page.type('input[placeholder*="model"]', model);
      await this.page.waitForSelector('.autocomplete-item, .dropdown-item', { timeout: 5000 });
      await this.page.click('.autocomplete-item, .dropdown-item');
    }

    // Wait for variants to load
    await this.page.waitForTimeout(1000);

    // Select variant
    const variantSelector = await this.page.$('select[name="variant"]');
    if (variantSelector) {
      await this.page.select('select[name="variant"]', variant);
    } else {
      await this.page.type('input[placeholder*="variant"]', variant);
      await this.page.waitForSelector('.autocomplete-item, .dropdown-item', { timeout: 5000 });
      await this.page.click('.autocomplete-item, .dropdown-item');
    }

    console.log('✅ Vehicle selected');
  }

  async setQuoteParameters(term, mileage, maintenance, deposit) {
    console.log(`⚙️  Setting parameters: ${term}m, ${mileage} miles, maintenance: ${maintenance}`);

    // Set term (contract length)
    const termSelector = 'select[name="term"], input[name="term"]';
    await this.page.waitForSelector(termSelector, { timeout: 10000 });

    const termElement = await this.page.$(termSelector);
    const termTagName = await termElement.evaluate(el => el.tagName);

    if (termTagName === 'SELECT') {
      await this.page.select(termSelector, String(term));
    } else {
      await this.page.evaluate((selector, value) => {
        document.querySelector(selector).value = value;
      }, termSelector, term);
    }

    // Set mileage
    const mileageSelector = 'select[name="mileage"], input[name="mileage"], input[name="annualMileage"]';
    await this.page.waitForSelector(mileageSelector, { timeout: 10000 });

    const mileageElement = await this.page.$(mileageSelector);
    const mileageTagName = await mileageElement.evaluate(el => el.tagName);

    if (mileageTagName === 'SELECT') {
      await this.page.select(mileageSelector, String(mileage));
    } else {
      await this.page.evaluate((selector, value) => {
        document.querySelector(selector).value = value;
      }, mileageSelector, mileage);
    }

    // Set deposit if there's a field
    try {
      const depositSelector = 'input[name="deposit"], input[name="initialPayment"]';
      await this.page.waitForSelector(depositSelector, { timeout: 5000 });
      await this.page.evaluate((selector, value) => {
        document.querySelector(selector).value = value;
      }, depositSelector, deposit || 0);
    } catch (e) {
      // Deposit field might not exist
    }

    // Set maintenance checkbox
    try {
      const maintenanceSelector = 'input[type="checkbox"][name*="maintenance"]';
      const maintenanceCheckbox = await this.page.$(maintenanceSelector);

      if (maintenanceCheckbox) {
        const isChecked = await maintenanceCheckbox.evaluate(el => el.checked);
        if (maintenance && !isChecked) {
          await maintenanceCheckbox.click();
        } else if (!maintenance && isChecked) {
          await maintenanceCheckbox.click();
        }
      }
    } catch (e) {
      // Maintenance checkbox might not exist
    }

    console.log('✅ Parameters set');
  }

  async getQuote() {
    console.log('💰 Getting quote...');

    // Click calculate/get quote button
    const calculateButton = await this.page.$(
      'button[ng-click*="calculate"], button.calculate-btn, button:contains("Calculate"), button:contains("Get Quote")'
    );

    if (calculateButton) {
      await calculateButton.click();
    } else {
      // Try finding by text
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const calcButton = buttons.find(btn =>
          btn.textContent.toLowerCase().includes('calculate') ||
          btn.textContent.toLowerCase().includes('quote')
        );
        if (calcButton) calcButton.click();
      });
    }

    // Wait for results to load
    await this.page.waitForSelector('.quote-result, .rental-amount, [ng-if*="quote"]', { timeout: 30000 });
    await this.page.waitForTimeout(2000); // Extra wait for animations

    // Extract quote data
    const quoteData = await this.page.evaluate(() => {
      // This needs to be customized based on Drivalia's actual HTML structure
      // Look for the monthly rental amount
      const monthlyRental = document.querySelector('.monthly-rental, .rental-amount, [ng-bind*="monthly"]');
      const totalCost = document.querySelector('.total-cost, [ng-bind*="total"]');
      const initialPayment = document.querySelector('.initial-payment, [ng-bind*="initial"]');

      return {
        monthlyRental: monthlyRental ? parseFloat(monthlyRental.textContent.replace(/[^0-9.]/g, '')) : null,
        totalCost: totalCost ? parseFloat(totalCost.textContent.replace(/[^0-9.]/g, '')) : null,
        initialPayment: initialPayment ? parseFloat(initialPayment.textContent.replace(/[^0-9.]/g, '')) : null,
      };
    });

    console.log('✅ Quote retrieved:', quoteData);
    return quoteData;
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

      // Parse config
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

      // Ensure logged in before processing
      await this.ensureLoggedIn();

      for (const vehicle of job.vehicles) {
        console.log(`   📍 Processing: ${vehicle.manufacturer} ${vehicle.model}`);

        for (const term of terms) {
          for (const mileage of mileages) {
            try {
              // Navigate to quote page (resets form)
              await this.navigateToQuotePage();

              // Search for vehicle
              await this.searchVehicle(
                vehicle.manufacturer,
                vehicle.model,
                vehicle.variant
              );

              // Set parameters
              await this.setQuoteParameters(
                term,
                mileage,
                config.maintenance || false,
                config.deposit || 0
              );

              // Get quote
              const quoteResult = await this.getQuote();

              if (quoteResult && quoteResult.monthlyRental) {
                const quote = {
                  vehicle_id: vehicle.id,
                  manufacturer: vehicle.manufacturer,
                  model: vehicle.model,
                  variant: vehicle.variant,
                  term: term,
                  mileage: mileage,
                  monthly_rental: quoteResult.monthlyRental,
                  initial_payment: quoteResult.initialPayment || config.deposit || 0,
                  total_cost: quoteResult.totalCost,
                  maintenance_included: config.maintenance || false,
                  supplier_name: 'Drivalia',
                  quote_reference: null,
                  additional_info: quoteResult
                };

                allQuotes.push(quote);
                successCount++;
                console.log(`      ✅ Quote: £${quoteResult.monthlyRental}/month`);
              } else {
                failureCount++;
                console.log(`      ❌ No quote returned`);
              }

              // Rate limiting
              await this.page.waitForTimeout(2000);

            } catch (quoteError) {
              console.error(`      ⚠️  Failed ${term}m / ${mileage} miles:`, quoteError.message);
              failureCount++;
            }
          }
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
      if (this.processingJobs.size >= MAX_CONCURRENT_JOBS) {
        return;
      }

      const pendingJobs = await drivaliaJobsService.getPendingJobs();

      if (pendingJobs.length === 0) {
        return;
      }

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
    console.log('🤖 Drivalia Browser Worker starting...');
    console.log(`   Poll interval: ${POLL_INTERVAL}ms`);
    console.log(`   Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);

    await this.initBrowser();
    await this.ensureLoggedIn();

    // Initial poll
    await this.poll();

    // Set up recurring poll
    this.pollInterval = setInterval(() => {
      this.poll().catch(err => {
        console.error('❌ Poll error:', err);
      });
    }, POLL_INTERVAL);

    console.log('✅ Drivalia Browser Worker started\n');
  }

  async stop() {
    console.log('⏹️  Stopping Drivalia Browser Worker...');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    if (this.browser) {
      await this.browser.close();
    }

    console.log('✅ Drivalia Browser Worker stopped');
  }
}

// Start worker if run directly
if (require.main === module) {
  const worker = new DrivaliaBrowserWorker();

  process.on('SIGINT', async () => {
    console.log('\n📡 Received SIGINT, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n📡 Received SIGTERM, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch(err => {
    console.error('❌ Failed to start worker:', err);
    process.exit(1);
  });
}

module.exports = DrivaliaBrowserWorker;
