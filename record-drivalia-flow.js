/**
 * Drivalia Flow Recorder
 *
 * Records the entire manual quote process to capture all selectors,
 * interactions, network calls, and page transitions.
 *
 * This runs a headless browser that YOU control, while it records everything.
 */

require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const DRIVALIA_BASE_URL = process.env.DRIVALIA_BASE_URL || 'https://www.caafgenus3.co.uk/WebApp/';

const recording = {
  startTime: new Date().toISOString(),
  steps: [],
  interactions: [],
  networkCalls: [],
  pageTransitions: [],
  screenshots: [],
  htmlSnapshots: [],
  errors: []
};

let stepCounter = 0;
let screenshotCounter = 0;

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    step: '\x1b[35m'
  };
  console.log(`${colors[type]}[${timestamp}] ${message}\x1b[0m`);

  recording.steps.push({
    timestamp,
    type,
    message
  });
}

async function takeSnapshot(page, label) {
  const screenshotDir = path.join(__dirname, 'drivalia-recording');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  screenshotCounter++;
  const screenshotPath = path.join(screenshotDir, `${screenshotCounter}-${label}.png`);
  const htmlPath = path.join(screenshotDir, `${screenshotCounter}-${label}.html`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(htmlPath, html);

    log(`📸 Snapshot saved: ${label}`, 'success');

    recording.screenshots.push({
      step: screenshotCounter,
      label,
      path: screenshotPath
    });

    recording.htmlSnapshots.push({
      step: screenshotCounter,
      label,
      path: htmlPath
    });
  } catch (error) {
    log(`Failed to take snapshot: ${error.message}`, 'error');
  }
}

async function capturePageState(page, label) {
  log(`📊 Capturing page state: ${label}`, 'step');

  const state = await page.evaluate(() => {
    // Capture all interactive elements
    const captureElements = (selector, type) => {
      return Array.from(document.querySelectorAll(selector)).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          type,
          tag: el.tagName,
          id: el.id || null,
          name: el.name || null,
          className: el.className || null,
          placeholder: el.placeholder || null,
          value: el.value || null,
          textContent: el.textContent?.trim().substring(0, 100) || null,
          ariaLabel: el.getAttribute('aria-label'),
          dataHook: el.getAttribute('data-hook'),
          ngModel: el.getAttribute('ng-model'),
          formControlName: el.getAttribute('formcontrolname'),
          matInput: el.getAttribute('matinput') !== null,
          visible: rect.width > 0 && rect.height > 0,
          position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        };
      });
    };

    return {
      url: window.location.href,
      hash: window.location.hash,
      title: document.title,
      inputs: captureElements('input', 'input'),
      selects: captureElements('select', 'select'),
      matSelects: captureElements('mat-select', 'mat-select'),
      buttons: captureElements('button', 'button'),
      autocompletes: captureElements('[matautocomplete], [aria-autocomplete]', 'autocomplete'),
      checkboxes: captureElements('input[type="checkbox"]', 'checkbox'),
      radios: captureElements('input[type="radio"]', 'radio'),
      textareas: captureElements('textarea', 'textarea'),
      forms: Array.from(document.querySelectorAll('form')).map(form => ({
        id: form.id,
        name: form.name,
        action: form.action,
        method: form.method
      })),
      angularModels: Array.from(document.querySelectorAll('[ng-model]')).map(el => ({
        tag: el.tagName,
        ngModel: el.getAttribute('ng-model'),
        value: el.value || el.textContent?.trim().substring(0, 50)
      }))
    };
  });

  recording.interactions.push({
    step: ++stepCounter,
    label,
    timestamp: new Date().toISOString(),
    state
  });

  return state;
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🎥 DRIVALIA FLOW RECORDER');
  console.log('='.repeat(80) + '\n');

  log('This will open a VISIBLE browser window.', 'warning');
  log('YOU will manually perform a quote, and I will record EVERYTHING.', 'warning');
  log('\n', 'info');

  const username = process.env.DRIVALIA_USERNAME;
  const password = process.env.DRIVALIA_PASSWORD;

  if (!username || !password) {
    log('Missing DRIVALIA_USERNAME or DRIVALIA_PASSWORD in .env', 'error');
    process.exit(1);
  }

  log('Launching browser...', 'info');

  const browser = await puppeteer.launch({
    headless: false, // VISIBLE browser so you can control it
    devtools: true,  // Open DevTools automatically
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--start-maximized'
    ],
    slowMo: 50 // Slow down actions slightly for easier recording
  });

  const page = await browser.newPage();

  // Set realistic viewport
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  });

  // Record all network requests
  page.on('request', request => {
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      recording.networkCalls.push({
        timestamp: new Date().toISOString(),
        type: 'request',
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        postData: request.postData()
      });
    }
  });

  // Record all network responses
  page.on('response', async response => {
    if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
      try {
        const responseBody = await response.text().catch(() => null);
        recording.networkCalls.push({
          timestamp: new Date().toISOString(),
          type: 'response',
          status: response.status(),
          url: response.url(),
          headers: response.headers(),
          body: responseBody
        });
      } catch (e) {
        // Some responses can't be read
      }
    }
  });

  // Record page navigations
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      recording.pageTransitions.push({
        timestamp: new Date().toISOString(),
        url: frame.url()
      });
      log(`→ Navigated to: ${frame.url()}`, 'info');
    }
  });

  // Record console messages
  page.on('console', msg => {
    log(`[Browser Console] ${msg.type()}: ${msg.text()}`, 'info');
  });

  // Record errors
  page.on('pageerror', error => {
    log(`[Page Error] ${error.message}`, 'error');
    recording.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack
    });
  });

  try {
    // STEP 1: Navigate to Drivalia
    log('STEP 1: Navigating to Drivalia...', 'step');
    await page.goto(DRIVALIA_BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await takeSnapshot(page, 'initial-page');
    await capturePageState(page, 'Initial page load');

    // STEP 2: Auto-login
    log('STEP 2: Attempting auto-login...', 'step');

    // Check if we're on login page
    const onLoginPage = await page.evaluate(() => {
      return window.location.hash.includes('login') ||
             !!document.querySelector('input[name="username"]');
    });

    if (onLoginPage) {
      log('On login page, filling credentials...', 'info');
      await takeSnapshot(page, 'login-page');
      await capturePageState(page, 'Login page');

      // Wait for and fill login form
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      await page.type('input[name="username"]', username, { delay: 100 });
      await page.type('input[name="password"]', password, { delay: 100 });

      await takeSnapshot(page, 'login-filled');

      // Click login
      const loginButton = await page.$('button[data-hook="login.submit"]');
      if (loginButton) {
        await loginButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        log('✅ Logged in successfully', 'success');
        await takeSnapshot(page, 'after-login');
        await capturePageState(page, 'After login');
      }
    } else {
      log('Already logged in or not on login page', 'info');
    }

    // STEP 3: Instructions for user
    console.log('\n' + '='.repeat(80));
    console.log('📝 INSTRUCTIONS FOR YOU:');
    console.log('='.repeat(80));
    console.log('1. In the browser window that just opened, navigate to the QUOTE page');
    console.log('2. Select a vehicle (any manufacturer, model, variant)');
    console.log('3. Set the quote parameters (term, mileage, etc.)');
    console.log('4. Click "Calculate" or "Get Quote"');
    console.log('5. Wait for results to appear');
    console.log('6. Come back here and press ENTER when done');
    console.log('='.repeat(80) + '\n');

    // Wait for user input
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    log('STEP 3: Capturing final state...', 'step');
    await takeSnapshot(page, 'final-state');
    const finalState = await capturePageState(page, 'Final state after quote');

    // Extract quote results
    log('STEP 4: Extracting quote results...', 'step');
    const quoteResults = await page.evaluate(() => {
      // Try to find any elements that look like prices
      const findPrices = () => {
        const priceElements = [];
        const selectors = [
          '[class*="price"]',
          '[class*="rental"]',
          '[class*="payment"]',
          '[class*="cost"]',
          '[class*="total"]',
          '[ng-bind*="price"]',
          '[ng-bind*="rental"]',
          '[ng-bind*="payment"]'
        ];

        selectors.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && /£|[0-9]+\.[0-9]{2}/.test(text)) {
              priceElements.push({
                selector: sel,
                text: text,
                html: el.outerHTML.substring(0, 200),
                className: el.className,
                id: el.id
              });
            }
          });
        });

        return priceElements;
      };

      return {
        prices: findPrices(),
        allText: document.body.textContent.match(/£[0-9,]+\.?[0-9]*/g) || []
      };
    });

    recording.quoteResults = quoteResults;
    log(`Found ${quoteResults.prices.length} price elements`, 'success');
    log(`Found ${quoteResults.allText.length} price-like text patterns`, 'success');

    // STEP 5: Save recording
    log('STEP 5: Saving recording...', 'step');

    const recordingPath = path.join(__dirname, 'drivalia-recording', 'recording.json');
    fs.writeFileSync(recordingPath, JSON.stringify(recording, null, 2));
    log(`✅ Recording saved to: ${recordingPath}`, 'success');

    // Generate human-readable report
    const reportPath = path.join(__dirname, 'drivalia-recording', 'REPORT.md');
    const report = generateReport(recording);
    fs.writeFileSync(reportPath, report);
    log(`✅ Report saved to: ${reportPath}`, 'success');

    console.log('\n' + '='.repeat(80));
    console.log('✅ RECORDING COMPLETE!');
    console.log('='.repeat(80));
    console.log('\nGenerated files:');
    console.log(`  - ${recordingPath}`);
    console.log(`  - ${reportPath}`);
    console.log(`  - ${recording.screenshots.length} screenshots`);
    console.log(`  - ${recording.htmlSnapshots.length} HTML snapshots`);
    console.log(`  - ${recording.networkCalls.length} network calls recorded`);
    console.log('\nNext: Share the recording.json and REPORT.md files with me!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
  } finally {
    // Don't close browser automatically - let user review
    console.log('\nBrowser will stay open for review. Close it manually when done.');
    console.log('Press ENTER to close and exit...');

    await new Promise(resolve => {
      process.stdin.once('data', async () => {
        await browser.close();
        resolve();
      });
    });
  }
}

function generateReport(recording) {
  let report = '# Drivalia Flow Recording Report\n\n';
  report += `**Recorded at:** ${recording.startTime}\n\n`;
  report += `**Total steps:** ${recording.steps.length}\n`;
  report += `**Screenshots:** ${recording.screenshots.length}\n`;
  report += `**Network calls:** ${recording.networkCalls.length}\n`;
  report += `**Page transitions:** ${recording.pageTransitions.length}\n\n`;

  report += '## Page Transitions\n\n';
  recording.pageTransitions.forEach((transition, i) => {
    report += `${i + 1}. ${transition.url}\n`;
  });

  report += '\n## Captured Page States\n\n';
  recording.interactions.forEach(interaction => {
    report += `### Step ${interaction.step}: ${interaction.label}\n\n`;
    report += `**URL:** ${interaction.state.url}\n`;
    report += `**Hash:** ${interaction.state.hash}\n\n`;

    if (interaction.state.inputs.filter(i => i.visible).length > 0) {
      report += '#### Visible Inputs:\n\n';
      interaction.state.inputs.filter(i => i.visible).forEach(input => {
        report += `- **${input.type}** - name: \`${input.name}\`, id: \`${input.id}\`, placeholder: "${input.placeholder}"\n`;
        if (input.ariaLabel) report += `  - aria-label: "${input.ariaLabel}"\n`;
        if (input.dataHook) report += `  - data-hook: "${input.dataHook}"\n`;
        if (input.ngModel) report += `  - ng-model: "${input.ngModel}"\n`;
      });
      report += '\n';
    }

    if (interaction.state.matSelects.filter(s => s.visible).length > 0) {
      report += '#### Angular Material Selects:\n\n';
      interaction.state.matSelects.filter(s => s.visible).forEach(select => {
        report += `- id: \`${select.id}\`, aria-label: "${select.ariaLabel}"\n`;
        if (select.ngModel) report += `  - ng-model: "${select.ngModel}"\n`;
        if (select.formControlName) report += `  - formControlName: "${select.formControlName}"\n`;
      });
      report += '\n';
    }

    if (interaction.state.buttons.filter(b => b.visible).length > 0) {
      report += '#### Visible Buttons:\n\n';
      interaction.state.buttons.filter(b => b.visible).forEach(button => {
        report += `- "${button.textContent}" - type: \`${button.type}\`\n`;
        if (button.dataHook) report += `  - data-hook: "${button.dataHook}"\n`;
      });
      report += '\n';
    }
  });

  if (recording.quoteResults) {
    report += '\n## Quote Results Found\n\n';
    report += `**Price elements:** ${recording.quoteResults.prices.length}\n\n`;

    recording.quoteResults.prices.forEach((price, i) => {
      report += `${i + 1}. **${price.text}**\n`;
      report += `   - Selector: \`${price.selector}\`\n`;
      report += `   - Class: \`${price.className}\`\n`;
      if (price.id) report += `   - ID: \`${price.id}\`\n`;
      report += '\n';
    });

    if (recording.quoteResults.allText.length > 0) {
      report += '\n**All price-like text found on page:**\n\n';
      recording.quoteResults.allText.slice(0, 20).forEach(text => {
        report += `- ${text}\n`;
      });
    }
  }

  report += '\n## Key Network Calls\n\n';
  const apiCalls = recording.networkCalls.filter(call =>
    call.type === 'request' &&
    (call.url.includes('/api/') || call.method === 'POST')
  );

  apiCalls.forEach((call, i) => {
    report += `${i + 1}. **${call.method}** ${call.url}\n`;
    if (call.postData) {
      report += `   - Body: \`${call.postData.substring(0, 200)}\`\n`;
    }
  });

  return report;
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nRecording interrupted. Saving what we have...');
  const recordingPath = path.join(__dirname, 'drivalia-recording', 'recording-partial.json');
  fs.writeFileSync(recordingPath, JSON.stringify(recording, null, 2));
  console.log(`Partial recording saved to: ${recordingPath}`);
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
