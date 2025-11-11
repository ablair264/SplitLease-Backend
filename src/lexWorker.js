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
const LEX_LOGIN_URL = process.env.LEX_LOGIN_URL || `${LEX_BASE_URL.replace(/\/$/, '')}/Login.aspx`;

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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
    await this.page.setViewport({ width: 1366, height: 900 });
    await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });
    // Basic anti-bot evasions
    await this.page.evaluateOnNewDocument(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = window.chrome || { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      } catch {}
    });
    this.page.setDefaultTimeout(60000);
  }

  async ensureLoggedIn() {
    // Check if already logged in FIRST (before clearing anything)
    console.log('🔍 Checking if already logged in...');
    const currentUrl = this.page.url();
    const isOnLoginPage = /Login\.aspx/i.test(currentUrl);

    if (!isOnLoginPage) {
      // Not on login page, check for logged-in indicators
      const isLoggedIn = await this.page.evaluate(() => {
        return !!(window && (window.profile || document.querySelector('#selManufacturers') || document.querySelector('#selModels')));
      }).catch(() => false);

      if (isLoggedIn) {
        console.log('✅ Already logged in, skipping login process');
        return;
      }
    }

    console.log('🔐 Not logged in, starting login process...');

    // Clear cookies to avoid session conflicts
    console.log('🧹 Clearing cookies to start fresh session...');
    const client = await this.page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    // Visit logout URL first to end any previous session
    console.log('🚪 Visiting logout URL to end any previous sessions...');
    try {
      await this.page.goto(`${LEX_BASE_URL.replace(/\/$/, '')}/Logout.aspx`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      }).catch(() => {});
    } catch (e) {
      console.log('Logout attempt completed (may have errored if no session)');
    }

    // Always start from the explicit login URL
    console.log('🔗 Navigating to login page...');
    await this.page.goto(LEX_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

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

    const username = process.env.LEX_USERNAME;
    const password = process.env.LEX_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing LEX_USERNAME/LEX_PASSWORD env vars');
    }

    try {
      // Wait for the WebForms login form
      await this.page.waitForSelector('#frmLogon, form[name="frmLogon"]', { timeout: 30000 });
      console.log('✓ Login form found');

      // Get URL before submission
      const urlBefore = this.page.url();
      console.log('📍 URL before login:', urlBefore);

      // Try using Puppeteer's native form filling instead of JS
      console.log('🔤 Attempting native Puppeteer form fill...');

      // Find the username and password fields
      const userSelector = '#txtUserName, input[name="txtUserName"]';
      const passSelector = '#txtPassword, input[name="txtPassword"]';

      try {
        await this.page.waitForSelector(userSelector, { timeout: 5000 });
        await this.page.waitForSelector(passSelector, { timeout: 5000 });

        // Clear and type with Puppeteer
        await this.page.click(userSelector, { clickCount: 3 }); // Select all
        await this.page.type(userSelector, username, { delay: 50 });
        console.log('✓ Username filled');

        await this.page.click(passSelector, { clickCount: 3 }); // Select all
        await this.page.type(passSelector, password, { delay: 50 });
        console.log('✓ Password filled');

        // Find and click submit button
        const submitSelector = '#btnLogon, input[id*="btnLogon"], button[id*="btnLogon"]';
        await this.page.waitForSelector(submitSelector, { timeout: 5000 });

        console.log('🖱️  Clicking login button with Puppeteer...');

        // Click and wait for navigation with a race condition
        const navigationPromise = this.page.waitForNavigation({
          waitUntil: 'domcontentloaded',
          timeout: 15000
        }).catch(e => {
          console.log('⚠️  Navigation wait ended:', e.message);
          return null;
        });

        await this.page.click(submitSelector);
        console.log('✓ Submit button clicked');

        // Wait up to 15 seconds for navigation
        console.log('⏳ Waiting for navigation (15s timeout)...');
        await navigationPromise;

        // Wait an additional 2 seconds for any post-navigation JS
        await new Promise(r => setTimeout(r, 2000));

        console.log('✓ Navigation wait complete, checking result...');

      } catch (nativeError) {
        console.warn('Native form fill failed:', nativeError.message);
        console.log('Falling back to JavaScript form submission...');

      // Fill and submit via JS to avoid overlay/clickability issues
      const loginResult = await this.page.evaluate((creds) => {
        const result = { success: false, message: '', method: '' };

        // Dismiss simple overlays if any
        try {
          const anti = document.getElementById('antiClickjack');
          if (anti && anti.parentNode) {
            anti.parentNode.removeChild(anti);
            result.message += 'Removed antiClickjack. ';
          }
        } catch {}
        try {
          const pm = document.getElementById('Privacy Manager');
          if (pm && pm.parentNode) {
            pm.parentNode.removeChild(pm);
            result.message += 'Removed Privacy Manager. ';
          }
        } catch {}

        // Stop any aggressive anti-clickjacking intervals
        try {
          // Clear all intervals (the anti-clickjacking code sets one every 1ms)
          const highestId = window.setInterval(() => {}, 0);
          for (let i = 0; i < highestId; i++) {
            window.clearInterval(i);
          }
          result.message += 'Cleared intervals. ';
        } catch {}

        const form = document.getElementById('frmLogon') || document.forms['frmLogon'] || document.querySelector('form#frmLogon, form[name="frmLogon"]');
        if (!form) {
          result.message = 'frmLogon not found';
          return result;
        }
        result.message += 'Form found. ';

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

        if (!userEl || !passEl) {
          result.message += `Missing fields: user=${!!userEl}, pass=${!!passEl}`;
          return result;
        }
        result.message += 'Fields found. ';

        userEl.focus();
        userEl.value = creds.username;
        userEl.dispatchEvent(new Event('input', { bubbles: true }));
        userEl.dispatchEvent(new Event('change', { bubbles: true }));

        passEl.focus();
        passEl.value = creds.password;
        passEl.dispatchEvent(new Event('input', { bubbles: true }));
        passEl.dispatchEvent(new Event('change', { bubbles: true }));

        result.message += 'Credentials filled with events. ';

        // Prefer clicking default submit within the form
        let submitEl =
          form.querySelector('#btnLogon') ||
          form.querySelector('input[id*=\"btnLogon\"]') ||
          form.querySelector('button[id*=\"btnLogon\"]') ||
          form.querySelector('input[type=\"submit\"]') ||
          form.querySelector('button[type=\"submit\"]');

        if (submitEl) {
          result.method = 'click';
          submitEl.click();
          result.success = true;
        } else if (typeof window.__doPostBack === 'function') {
          result.method = '__doPostBack';
          try { window.__doPostBack('btnLogon', ''); result.success = true; } catch { form.submit(); result.method = 'form.submit (fallback)'; result.success = true; }
        } else {
          result.method = 'form.submit';
          form.submit();
          result.success = true;
        }
        result.message += `Submitted via ${result.method}`;

        return result;
      }, { username, password });

        console.log('🔐 Login attempt:', loginResult);

        // Wait for either navigation or timeout
        console.log('⏸️  Waiting for navigation or 5 seconds...');
        await Promise.race([
          this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null),
          new Promise(r => setTimeout(r, 5000))
        ]);
        console.log('⏸️  Wait complete, checking page state...');
      } // End of fallback try block

      // Check current URL first (simple operation)
      let currentUrl;
      try {
        currentUrl = this.page.url();
        console.log('📍 Current URL:', currentUrl);
      } catch (e) {
        console.error('Failed to get URL:', e.message);
        throw new Error('Page became unresponsive after login attempt');
      }

      // If we've already redirected away from Login.aspx, we're good!
      if (!/Login\.aspx/i.test(currentUrl)) {
        console.log('✅ Already redirected away from Login.aspx!');
        // Skip validation checks and jump to profile setup
      } else {
        console.log('⚠️  Still on Login.aspx, checking for errors...');

        // Check for error messages on the page with timeout
        let errorCheck;
        try {
          errorCheck = await Promise.race([
            this.page.evaluate(() => {
              const url = location.href;
              const errorSelectors = [
                '.error', '.alert', '.validation-summary-errors',
                '#error', '[class*="error"]', '[class*="invalid"]',
                'span[style*="color:red"]', 'span[style*="color: red"]'
              ];
              let errorText = '';
              for (const sel of errorSelectors) {
                const el = document.querySelector(sel);
                if (el && el.textContent.trim()) {
                  errorText += el.textContent.trim() + ' ';
                }
              }
              return { url, errorText: errorText.trim() };
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('evaluate timeout')), 3000))
          ]);
        } catch (e) {
          console.error('Failed to evaluate page:', e.message);
          // Try to get URL directly
          errorCheck = { url: currentUrl, errorText: '' };
        }

        console.log('📍 URL from evaluate:', errorCheck.url);

        if (errorCheck.errorText) {
          console.error('❌ Error messages found:', errorCheck.errorText);
          throw new Error(`Login validation errors: ${errorCheck.errorText}`);
        }

        // Check for concurrent session warning (common on Lex)
        console.log('🔍 Checking for concurrent session warning...');
        let pageText;
        try {
          pageText = await Promise.race([
            this.page.evaluate(() => document.body ? document.body.innerText : ''),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
          ]);
          console.log('📄 Page text preview:', pageText.substring(0, 500));
        } catch (e) {
          console.warn('Could not get page text:', e.message);
          pageText = '';
        }

        // Check for session warning messages
        const sessionWarnings = [
          'previous logged in session is still active',
          'session is still active',
          'already logged in',
          'concurrent session',
          'try again later'
        ];

        const hasSessionWarning = sessionWarnings.some(warning =>
          pageText.toLowerCase().includes(warning)
        );

        if (hasSessionWarning) {
          console.error('⚠️  Concurrent session detected!');
          console.error('Lex Autolease only allows one active session at a time.');
          console.error('The Puppeteer browser is holding an active session.');
          console.error('Waiting 10 seconds for session to potentially expire...');

          await new Promise(r => setTimeout(r, 10000));

          // Try refreshing and logging in again
          console.log('🔄 Attempting to refresh and retry login...');
          await this.page.goto(LEX_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

          // Look for a "force logout" or "continue" button
          const forceLoginButton = await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
            const continueBtn = buttons.find(b => {
              const text = (b.textContent || b.value || '').toLowerCase();
              return text.includes('continue') || text.includes('force') || text.includes('override') || text.includes('logout previous');
            });
            return continueBtn ? true : false;
          });

          if (forceLoginButton) {
            console.log('Found force login button, clicking...');
            await this.page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
              const continueBtn = buttons.find(b => {
                const text = (b.textContent || b.value || '').toLowerCase();
                return text.includes('continue') || text.includes('force') || text.includes('override') || text.includes('logout previous');
              });
              if (continueBtn) continueBtn.click();
            });
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        throw new Error('Login failed: Page did not redirect from Login.aspx. Check Railway logs for session warnings or credential issues.');
      }
      // Ensure minimal profile object exists for automation script
      await this.page.evaluate(() => {
        try {
          if (!window.profile || typeof window.profile !== 'object') {
            window.profile = {
              Discount: "-1",
              SalesCode: "000000000",
              Role: "LBS",
              RVCode: "00"
            };
          } else {
            window.profile.Discount = window.profile.Discount || "-1";
            window.profile.SalesCode = window.profile.SalesCode || "000000000";
            window.profile.Role = window.profile.Role || "LBS";
            window.profile.RVCode = window.profile.RVCode || "00";
          }
        } catch {}
      });
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
    const scriptPath = path.resolve(__dirname, './automation/lex-autolease-api-automation.js');
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


