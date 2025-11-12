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
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { lexJobsService } = require('./supabase');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const POLL_INTERVAL = parseInt(process.env.JOB_POLL_INTERVAL_MS) || 7000;
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS) || 1;
const LEX_BASE_URL = process.env.LEX_BASE_URL || 'https://associate.lexautolease.co.uk/';
const LEX_LOGIN_URL = process.env.LEX_LOGIN_URL || `${LEX_BASE_URL.replace(/\/$/, '')}/Login.aspx`;

class LexWorker {
  constructor() {
    this.processingJobs = new Set();
    this.browser = null;
    this.page = null;
  }

  async initBrowser() {
    if (this.browser) return;

    // Enhanced browser configuration for Railway and anti-bot evasion
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled', // Hide automation
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1366,900',
        '--start-maximized'
      ],
      ignoreDefaultArgs: ['--enable-automation'], // Don't show "Chrome is being controlled by automated software"
    });

    this.page = await this.browser.newPage();

    // Set realistic user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Set realistic viewport
    await this.page.setViewport({
      width: 1366,
      height: 900,
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
      'Upgrade-Insecure-Requests': '1'
    });

    // Hide webdriver property and add realistic Chrome properties
    await this.page.evaluateOnNewDocument(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Add Chrome runtime
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };

      // Override plugins to make it look real
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

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-GB', 'en', 'en-US'],
      });

      // Add realistic permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Increased timeout for Railway's network latency
    this.page.setDefaultTimeout(90000); // 90 seconds instead of 60
  }

  async ensureLoggedIn() {
    // Always start from the explicit login URL
    await this.page.goto(LEX_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Quick cookie banner dismissal (best-effort)
    try {
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a')).filter(b => {
          const t = (b.textContent || '').toLowerCase();
          const id = (b.id || '').toLowerCase();
          return t.includes('accept') || t.includes('agree') || id.includes('accept') || id.includes('consent');
        });
        if (btns[0]) btns[0].click();
      });
    } catch {}

    // If already logged in, return
    const isLoggedIn = await this.page.evaluate(() => {
      return !!(window && (window.profile || document.querySelector('#selManufacturers') || document.querySelector('#selModels')));
    }).catch(() => false);
    if (isLoggedIn) return;

    const username = process.env.LEX_USERNAME;
    const password = process.env.LEX_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing LEX_USERNAME/LEX_PASSWORD env vars');
    }

    try {
      // Wait for the WebForms login form
      await this.page.waitForSelector('#frmLogon, form[name="frmLogon"]', { timeout: 30000 });

      // Fill and submit via JS to avoid overlay/clickability issues
      await this.page.evaluate((creds) => {
        // Dismiss simple overlays if any
        try {
          const anti = document.getElementById('antiClickjack');
          if (anti && anti.parentNode) anti.parentNode.removeChild(anti);
        } catch {}
        try {
          const pm = document.getElementById('Privacy Manager');
          if (pm && pm.parentNode) pm.parentNode.removeChild(pm);
        } catch {}

        const form = document.getElementById('frmLogon') || document.forms['frmLogon'] || document.querySelector('form#frmLogon, form[name="frmLogon"]');
        if (!form) throw new Error('frmLogon not found');

        // Find username/password fields by common ids/names on Lex
        const userCandidates = [
          () => form.txtUserName,
          () => form.querySelector('#txtUserName'),
          () => form.querySelector('input[name="txtUserName"]'),
          () => form.querySelector('input[id*="UserName"]'),
          () => form.querySelector('input[type="text"]'),
          () => form.querySelector('input[type="email"]')
        ];
        const passCandidates = [
          () => form.txtPassword,
          () => form.querySelector('#txtPassword'),
          () => form.querySelector('input[name="txtPassword"]'),
          () => form.querySelector('input[id*=\"Password\"]'),
          () => form.querySelector('input[type=\"password\"]')
        ];
        let userEl = null;
        for (const fn of userCandidates) { try { userEl = fn(); if (userEl) break; } catch {} }
        let passEl = null;
        for (const fn of passCandidates) { try { passEl = fn(); if (passEl) break; } catch {} }
        if (!userEl || !passEl) throw new Error('username/password inputs not found');

        userEl.focus();
        userEl.value = creds.username;
        passEl.value = creds.password;

        // Prefer clicking default submit within the form
        let submitEl =
          form.querySelector('#btnLogon') ||
          form.querySelector('input[id*=\"btnLogon\"]') ||
          form.querySelector('button[id*=\"btnLogon\"]') ||
          form.querySelector('input[type=\"submit\"]') ||
          form.querySelector('button[type=\"submit\"]');

        if (submitEl) {
          submitEl.click();
        } else if (typeof window.__doPostBack === 'function') {
          try { window.__doPostBack('btnLogon', ''); } catch { form.submit(); }
        } else {
          form.submit();
        }
      }, { username, password });

      // Wait for redirect away from Login.aspx (increased timeout for Railway)
      await this.page.waitForFunction(() => !/Login\.aspx/i.test(location.href), { timeout: 60000 });
      // Then wait for a sign of authenticated session
      await this.page.waitForFunction(() => {
        return !!(window && (window.profile)) ||
               document.querySelector('#selManufacturers') ||
               document.querySelector('#selModels');
      }, { timeout: 60000 });
    } catch (e) {
      // Dump a quick HTML snapshot to help diagnose (truncated)
      try {
        const html = await this.page.content();
        console.error('Login page snapshot (first 2k):', (html || '').slice(0, 2000));
      } catch {}
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


