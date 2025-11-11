/**
 * Lex Job Worker (Puppeteer-based)
 *
 * Polls Supabase for pending lex_jobs and processes them by
 * launching a headless browser, logging into Lex, injecting the
 * in-page automation script, and executing quotes by codes.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { lexJobsService } = require('./supabase');

const POLL_INTERVAL = parseInt(process.env.JOB_POLL_INTERVAL_MS) || 7000;
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS) || 1;
const LEX_BASE_URL = process.env.LEX_BASE_URL || 'https://associate.lexautolease.co.uk/';

class LexWorker {
  constructor() {
    this.processingJobs = new Set();
    this.browser = null;
    this.page = null;
  }

  async initBrowser() {
    if (this.browser) return;
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(60000);
  }

  async ensureLoggedIn() {
    await this.page.goto(LEX_BASE_URL, { waitUntil: 'networkidle2' });
    const isLoggedIn = await this.page.evaluate(() => {
      return !!(window && (window.profile || document.querySelector('#selManufacturers')));
    }).catch(() => false);

    if (isLoggedIn) return;

    const username = process.env.LEX_USERNAME;
    const password = process.env.LEX_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing LEX_USERNAME/LEX_PASSWORD env vars');
    }

    // Heuristic login: attempt to find username/password inputs and submit
    // This might need adjusting if Lex changes markup.
    try {
      // Common selectors; adjust as needed
      const userSel = 'input[type="text"], input[name="username"], #username';
      const passSel = 'input[type="password"], #password';
      await this.page.waitForSelector(userSel, { timeout: 15000 });
      const userInput = await this.page.$(userSel);
      const passInput = await this.page.$(passSel);
      if (!userInput || !passInput) throw new Error('Login form not found');
      await userInput.click({ clickCount: 3 });
      await userInput.type(username, { delay: 20 });
      await passInput.type(password, { delay: 20 });
      // Try submit by pressing Enter
      await passInput.press('Enter');
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
      throw new Error(`Lex login failed: ${e.message}`);
    }
  }

  async injectAutomationScript() {
    // Load the front-end automation script and inject into page context
    const scriptPath = path.resolve(__dirname, '../../LexRobot/lex-autolease-api-automation.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    await this.page.addScriptTag({ content: scriptContent });
    const ok = await this.page.evaluate(() => !!window.LexAutoQuoteAutomation);
    if (!ok) throw new Error('Failed to inject LexAutoQuoteAutomation');
  }

  async run() {
    await this.initBrowser();
    await this.ensureLoggedIn();
    await this.injectAutomationScript();

    // Initial poll
    await this.poll();
    // Recurring poll
    this.timer = setInterval(() => this.poll().catch(console.error), POLL_INTERVAL);
    console.log('✅ Lex Worker started');
  }

  async poll() {
    if (this.processingJobs.size >= MAX_CONCURRENT_JOBS) return;
    const pending = await lexJobsService.getPendingJobs();
    if (!pending.length) return;
    const schedulable = pending.slice(0, MAX_CONCURRENT_JOBS - this.processingJobs.size);
    for (const job of schedulable) {
      this.processJob(job).catch((e) => console.error('Job error', e));
    }
  }

  async processJob(job) {
    const jobId = job.id;
    this.processingJobs.add(jobId);
    const start = Date.now();
    try {
      await lexJobsService.startProcessingJob(jobId);
      const config = job.config || {};
      const terms = config.terms === 'ALL' ? [24, 36, 48, 60] : [parseInt(config.terms || 36)];
      const mileages = config.mileages === 'ALL'
        ? [5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000]
        : [parseInt(config.mileages || 10000)];

      let successCount = 0;
      let failureCount = 0;
      const allQuotes = [];

      // Re-ensure session for each job
      await this.ensureLoggedIn();
      await this.injectAutomationScript();

      for (const v of job.vehicles || []) {
        // we require lex codes to run quotes
        if (!v.lex_make_code || !v.lex_model_code || !v.lex_variant_code) {
          failureCount++;
          continue;
        }
        for (const term of terms) {
          for (const mileage of mileages) {
            try {
              const result = await this.page.evaluate(async (args) => {
                const automation = new window.LexAutoQuoteAutomation();
                const r = await automation.runQuote({
                  makeId: String(args.makeCode),
                  modelId: String(args.modelCode),
                  variantId: String(args.variantCode),
                  term: String(args.term),
                  mileage: String(args.mileage),
                  discountType: args.discountType || 'system',
                  discountPercent: args.discountPercent || null,
                  maintenance: !!args.maintenance
                });
                if (r && r.success && r.quoteDetails && r.lineNumbers && r.lineNumbers.length) {
                  const pricing = automation.extractPricing(r.quoteDetails, r.lineNumbers[0]);
                  return { ok: true, pricing, r };
                }
                return { ok: false, error: r && r.error ? r.error : 'Unknown error' };
              }, {
                makeCode: v.lex_make_code,
                modelCode: v.lex_model_code,
                variantCode: v.lex_variant_code,
                term,
                mileage,
                discountType: config.discountType || 'system',
                discountPercent: config.discountPercent || null,
                maintenance: !!config.maintenance
              });

              if (result && result.ok && result.pricing) {
                const p = result.pricing;
                allQuotes.push({
                  vehicle_id: v.id,
                  manufacturer: v.manufacturer,
                  model: v.model,
                  variant: v.variant,
                  term,
                  mileage,
                  monthly_rental: p.monthlyRental ?? null,
                  initial_rental: p.initialRental ?? null,
                  total_cost: p.totalCost ?? null,
                  co2: p.co2 ?? null,
                  fuel_type: p.fuelType ?? null,
                  p11d: p.p11d ?? null,
                  vat: p.vat ?? null,
                  maintenance: !!config.maintenance,
                  discount_type: config.discountType || 'system',
                  discount_percent: config.discountPercent || null,
                  quote_id: result.r && result.r.quoteId ? String(result.r.quoteId) : null,
                  lex_line_number: p.lineNumber ?? null
                });
                successCount++;
              } else {
                failureCount++;
              }

              // rate limit
              await new Promise((r) => setTimeout(r, 1500));
            } catch (e) {
              failureCount++;
            }
          }
        }
      }

      if (allQuotes.length) {
        await lexJobsService.insertQuotes(jobId, allQuotes);
      }
      const durationSeconds = Math.round((Date.now() - start) / 1000);
      await lexJobsService.completeJob(jobId, { successCount, failureCount, durationSeconds });
    } catch (e) {
      await lexJobsService.failJob(jobId, { error: e.message });
    } finally {
      this.processingJobs.delete(jobId);
    }
  }
}

if (require.main === module) {
  (async () => {
    const worker = new LexWorker();
    process.on('SIGINT', async () => {
      clearInterval(worker.timer);
      if (worker.browser) await worker.browser.close().catch(() => {});
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      clearInterval(worker.timer);
      if (worker.browser) await worker.browser.close().catch(() => {});
      process.exit(0);
    });
    try {
      await worker.run();
    } catch (e) {
      console.error('Failed to start Lex worker:', e);
      process.exit(1);
    }
  })();
}

module.exports = LexWorker;


