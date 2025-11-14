/**
 * Drivalia Simple Browser Worker
 *
 * Pure browser automation - no API calls, just UI interaction
 * Based on the actual recording of how the UI works
 */

require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { drivaliaJobsService } = require('./supabase');

puppeteer.use(StealthPlugin());

const POLL_INTERVAL = parseInt(process.env.JOB_POLL_INTERVAL_MS) || 5000;
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS) || 1;
const DRIVALIA_BASE_URL = 'https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html';
const DRIVALIA_QUOTE_URL = 'https://www.caafgenus3.co.uk/WebApp/fmoportal/index.html#/quoting/new';

class DrivaliaSimpleBrowserWorker {
  constructor() {
    this.processingJobs = new Set();
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  async initBrowser() {
    if (this.browser) return;

    console.log('🌐 Initializing browser...');

    this.browser = await puppeteer.launch({
      headless: false, // Keep visible for now to debug
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });

    this.page = await this.browser.newPage();
    console.log('✅ Browser initialized');
  }

  async ensureLoggedIn() {
    if (this.isLoggedIn) {
      console.log('✅ Already logged in');
      return;
    }

    const username = process.env.DRIVALIA_USERNAME;
    const password = process.env.DRIVALIA_PASSWORD;

    if (!username || !password) {
      throw new Error('Missing DRIVALIA_USERNAME/DRIVALIA_PASSWORD');
    }

    console.log('🔑 Logging in...');

    await this.page.goto(`${DRIVALIA_BASE_URL}#/login`, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // Wait for and fill login form
    await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await this.page.type('input[name="username"]', username, { delay: 50 });
    await this.page.type('input[name="password"]', password, { delay: 50 });

    // Click login and wait for navigation
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      this.page.click('button[data-hook="login.submit"]')
    ]);

    // Wait for dashboard to load
    await this.page.waitForSelector('[data-hook="banner.smartsearch"]', { timeout: 10000 });

    this.isLoggedIn = true;
    console.log('✅ Logged in successfully');
  }

  async navigateToQuotePage() {
    console.log('📄 Navigating to quote page...');

    await this.page.goto(DRIVALIA_QUOTE_URL, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // Wait for the quote page to load
    await this.page.waitForSelector('[data-hook="quoting.asset.change"]', { timeout: 10000 });
    console.log('✅ On quote page');
  }

  async selectVehicle(make, model, variant) {
    console.log(`🚗 Selecting vehicle: ${make} ${model} ${variant}`);

    // Click "Change" button to open vehicle selector
    await this.page.click('[data-hook="quoting.asset.change"]');

    // Wait for the vehicle search modal to appear
    await new Promise(resolve => setTimeout(resolve, 2000));

    // The recording shows Angular Material dropdowns
    // Strategy: Type into the search/filter inputs to narrow down options, then click

    try {
      // Step 1: Select Make
      console.log(`   Finding make: ${make}`);

      // Look for make dropdown/input - try multiple selectors
      const makeSelectors = [
        'mat-select[ng-model*="make"]',
        'input[ng-model*="make"]',
        '[placeholder*="Make"]',
        'mat-select:first-of-type'
      ];

      let makeFound = false;
      for (const selector of makeSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 3000 });
          await this.page.click(selector);
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Type to filter
          await this.page.keyboard.type(make, { delay: 100 });
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Click the matching option in the dropdown
          const optionClicked = await this.page.evaluate((makeText) => {
            const options = Array.from(document.querySelectorAll('mat-option'));
            const match = options.find(opt =>
              opt.textContent.toLowerCase().includes(makeText.toLowerCase())
            );
            if (match) {
              match.click();
              return true;
            }
            return false;
          }, make);

          if (optionClicked) {
            makeFound = true;
            console.log(`   ✓ Make selected: ${make}`);
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!makeFound) {
        throw new Error(`Could not find make selector or option for: ${make}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Select Model
      console.log(`   Finding model: ${model}`);

      const modelSelectors = [
        'mat-select[ng-model*="model"]',
        'input[ng-model*="model"]',
        '[placeholder*="Model"]'
      ];

      let modelFound = false;
      for (const selector of modelSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 3000 });
          await this.page.click(selector);
          await new Promise(resolve => setTimeout(resolve, 1000));

          await this.page.keyboard.type(model, { delay: 100 });
          await new Promise(resolve => setTimeout(resolve, 1000));

          const optionClicked = await this.page.evaluate((modelText) => {
            const options = Array.from(document.querySelectorAll('mat-option'));
            const match = options.find(opt =>
              opt.textContent.toLowerCase().includes(modelText.toLowerCase())
            );
            if (match) {
              match.click();
              return true;
            }
            return false;
          }, model);

          if (optionClicked) {
            modelFound = true;
            console.log(`   ✓ Model selected: ${model}`);
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!modelFound) {
        throw new Error(`Could not find model selector or option for: ${model}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Select Variant
      console.log(`   Finding variant: ${variant}`);

      // Variant might be in a list/table of results after selecting make+model
      // Try clicking directly on variant text or button
      const variantClicked = await this.page.evaluate((variantText) => {
        // Look for variant in various possible locations
        const allElements = Array.from(document.querySelectorAll('*'));
        const match = allElements.find(el => {
          const text = el.textContent || '';
          return text.includes(variantText) &&
                 (el.tagName === 'BUTTON' || el.classList.contains('variant') ||
                  el.classList.contains('asset') || el.onclick);
        });

        if (match) {
          match.click();
          return true;
        }

        // Alternative: look for mat-option with variant
        const options = Array.from(document.querySelectorAll('mat-option, [role="option"]'));
        const optMatch = options.find(opt =>
          opt.textContent.toLowerCase().includes(variantText.toLowerCase())
        );
        if (optMatch) {
          optMatch.click();
          return true;
        }

        return false;
      }, variant);

      if (!variantClicked) {
        // Try opening a variant dropdown if exists
        try {
          const variantSelectors = [
            'mat-select[ng-model*="variant"]',
            'input[ng-model*="variant"]',
            '[placeholder*="Variant"]'
          ];

          for (const selector of variantSelectors) {
            try {
              await this.page.waitForSelector(selector, { timeout: 2000 });
              await this.page.click(selector);
              await new Promise(resolve => setTimeout(resolve, 500));

              const clicked = await this.page.evaluate((variantText) => {
                const options = Array.from(document.querySelectorAll('mat-option'));
                const match = options.find(opt =>
                  opt.textContent.toLowerCase().includes(variantText.toLowerCase())
                );
                if (match) {
                  match.click();
                  return true;
                }
                return false;
              }, variant);

              if (clicked) {
                console.log(`   ✓ Variant selected: ${variant}`);
                break;
              }
            } catch (e) {
              // Try next selector
            }
          }
        } catch (e) {
          throw new Error(`Could not find or click variant: ${variant}`);
        }
      } else {
        console.log(`   ✓ Variant selected: ${variant}`);
      }

      // Wait for vehicle to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Look for confirmation/select button
      const confirmButton = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const selectBtn = buttons.find(btn =>
          btn.textContent.toLowerCase().includes('select') ||
          btn.textContent.toLowerCase().includes('add') ||
          btn.textContent.toLowerCase().includes('ok')
        );
        if (selectBtn) {
          selectBtn.click();
          return true;
        }
        return false;
      });

      if (confirmButton) {
        console.log(`   ✓ Vehicle confirmed`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`✅ Vehicle selection complete`);

    } catch (error) {
      console.error(`   ❌ Vehicle selection failed:`, error.message);

      // Take screenshot for debugging
      try {
        await this.page.screenshot({
          path: `vehicle-selection-error-${Date.now()}.png`,
          fullPage: true
        });
        console.log(`   📸 Screenshot saved for debugging`);
      } catch (e) {
        // Ignore screenshot errors
      }

      throw new Error(`Vehicle selection failed: ${error.message}`);
    }
  }

  async setQuoteParameters(term, mileage, upfrontMonths, maintenance) {
    console.log(`⚙️  Setting parameters: ${term}m, ${mileage} miles, ${upfrontMonths} months upfront`);

    // Wait for quote form fields
    await this.page.waitForSelector('[data-hook="quoting.finance.term"]', { timeout: 10000 });

    // Set term
    await this.page.click('[data-hook="quoting.finance.term"]', { clickCount: 3 });
    await this.page.type('[data-hook="quoting.finance.term"]', String(term));

    // Set mileage
    await this.page.click('[data-hook="quoting.finance.annualmileage"]', { clickCount: 3 });
    await this.page.type('[data-hook="quoting.finance.annualmileage"]', String(mileage / 1000)); // Drivalia uses thousands

    // Set upfront payment (numberInAdvance)
    await this.page.click('[data-hook="quoting.finance.config.noinadvancefinancier"]', { clickCount: 3 });
    await this.page.type('[data-hook="quoting.finance.config.noinadvancefinancier"]', String(upfrontMonths));

    console.log('✅ Parameters set');
  }

  async clickRecalculate() {
    console.log('🔄 Clicking Recalculate...');

    await this.page.click('[data-hook="quoting.finance.recalculate"]');

    // Wait for calculation to complete
    await this.page.waitForTimeout(3000);

    console.log('✅ Recalculated');
  }

  async extractQuote() {
    console.log('💰 Extracting quote...');

    const quote = await this.page.evaluate(() => {
      // From the recording, monthly payment is in .cui-payment-schedule__value
      const paymentElements = document.querySelectorAll('.cui-payment-schedule__value');

      if (paymentElements.length < 2) {
        return null;
      }

      // The pattern from recording: first element is upfront, second is monthly
      const upfrontText = paymentElements[0]?.textContent?.trim();
      const monthlyText = paymentElements[1]?.textContent?.trim();

      const parsePrice = (text) => {
        if (!text) return null;
        const match = text.match(/£([\d,]+\.?\d*)/);
        return match ? parseFloat(match[1].replace(/,/g, '')) : null;
      };

      return {
        upfrontPayment: parsePrice(upfrontText),
        monthlyRental: parsePrice(monthlyText)
      };
    });

    if (!quote || !quote.monthlyRental) {
      throw new Error('Could not extract quote from page');
    }

    console.log(`   ✅ Quote: £${quote.monthlyRental.toFixed(2)}/month`);
    return quote;
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

        // Navigate to quote page for each vehicle
        await this.navigateToQuotePage();

        try {
          // Select vehicle
          await this.selectVehicle(
            vehicle.manufacturer,
            vehicle.model,
            vehicle.variant
          );

          // Get quotes for all combinations
          for (const term of terms) {
            for (const mileage of mileages) {
              try {
                // Set parameters
                await this.setQuoteParameters(
                  term,
                  mileage,
                  config.upfrontPayment || 1,
                  config.maintenance || false
                );

                // Recalculate
                await this.clickRecalculate();

                // Extract quote
                const quoteResult = await this.extractQuote();

                const quote = {
                  vehicle_id: vehicle.id,
                  manufacturer: vehicle.manufacturer,
                  model: vehicle.model,
                  variant: vehicle.variant,
                  term: term,
                  mileage: mileage,
                  monthly_rental: quoteResult.monthlyRental,
                  initial_payment: quoteResult.upfrontPayment,
                  total_cost: null,
                  maintenance_included: config.maintenance || false,
                  supplier_name: 'Drivalia',
                  quote_reference: null,
                  additional_info: quoteResult
                };

                allQuotes.push(quote);
                successCount++;
                console.log(`      ✅ ${term}m / ${mileage}mi: £${quoteResult.monthlyRental.toFixed(2)}/month`);

              } catch (quoteError) {
                console.error(`      ❌ ${term}m / ${mileage}mi: ${quoteError.message}`);
                failureCount++;
              }
            }
          }

        } catch (vehicleError) {
          console.error(`      ❌ Vehicle selection failed: ${vehicleError.message}`);
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
    console.log('🤖 Drivalia Simple Browser Worker starting...');
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

    console.log('✅ Drivalia Simple Browser Worker started\n');
  }

  async stop() {
    console.log('⏹️  Stopping...');
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.browser) await this.browser.close();
    console.log('✅ Stopped');
  }
}

if (require.main === module) {
  const worker = new DrivaliaSimpleBrowserWorker();

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

module.exports = DrivaliaSimpleBrowserWorker;
