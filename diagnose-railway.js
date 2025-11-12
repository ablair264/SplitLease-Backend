/**
 * Railway Deployment Diagnostic Script
 *
 * This script diagnoses issues with Lex and Drivalia workers on Railway
 * Run this on Railway to identify configuration issues
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const { DrivaliaAPI } = require('./src/drivaliaAPI');
const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'blue');
  console.log('='.repeat(80) + '\n');
}

// Store diagnostic results
const diagnosticResults = {
  timestamp: new Date().toISOString(),
  environment: {},
  lex: {},
  drivalia: {},
  summary: {}
};

/**
 * 1. Check Environment Variables
 */
async function checkEnvironmentVariables() {
  section('1. ENVIRONMENT VARIABLES CHECK');

  const requiredVars = {
    'SUPABASE_URL': process.env.SUPABASE_URL,
    'SUPABASE_SERVICE_KEY': process.env.SUPABASE_SERVICE_KEY,
    'LEX_USERNAME': process.env.LEX_USERNAME,
    'LEX_PASSWORD': process.env.LEX_PASSWORD,
  };

  const optionalVars = {
    'LEX_BASE_URL': process.env.LEX_BASE_URL,
    'LEX_LOGIN_URL': process.env.LEX_LOGIN_URL,
    'JOB_POLL_INTERVAL_MS': process.env.JOB_POLL_INTERVAL_MS,
    'MAX_CONCURRENT_JOBS': process.env.MAX_CONCURRENT_JOBS,
  };

  diagnosticResults.environment.required = {};
  diagnosticResults.environment.optional = {};

  log('Required Environment Variables:', 'magenta');
  let allRequiredPresent = true;

  for (const [key, value] of Object.entries(requiredVars)) {
    const isSet = !!value;
    const status = isSet ? '✅ SET' : '❌ MISSING';
    const statusColor = isSet ? 'green' : 'red';

    // Show partial value for security
    let displayValue = 'NOT SET';
    if (isSet) {
      if (key.includes('PASSWORD') || key.includes('KEY')) {
        displayValue = value.substring(0, 10) + '...' + value.substring(value.length - 5);
      } else {
        displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
      }
    }

    log(`  ${status} ${key}: ${displayValue}`, statusColor);
    diagnosticResults.environment.required[key] = isSet;

    if (!isSet) allRequiredPresent = false;
  }

  log('\nOptional Environment Variables:', 'magenta');
  for (const [key, value] of Object.entries(optionalVars)) {
    const isSet = !!value;
    const status = isSet ? '✅ SET' : '⚪ NOT SET (using default)';
    const statusColor = isSet ? 'green' : 'yellow';
    const displayValue = isSet ? value : '(default)';

    log(`  ${status} ${key}: ${displayValue}`, statusColor);
    diagnosticResults.environment.optional[key] = isSet;
  }

  diagnosticResults.environment.allRequiredPresent = allRequiredPresent;

  if (!allRequiredPresent) {
    log('\n⚠️  WARNING: Some required environment variables are missing!', 'red');
    return false;
  }

  log('\n✅ All required environment variables are set', 'green');
  return true;
}

/**
 * 2. Test Drivalia API Authentication
 */
async function testDrivaliaAuth() {
  section('2. DRIVALIA API AUTHENTICATION TEST');

  log('Testing Drivalia API authentication...', 'yellow');

  try {
    const api = new DrivaliaAPI();

    // Check if credentials are hardcoded or from env
    const isHardcoded = api.username === 'Ally Blair';

    if (isHardcoded) {
      log('⚠️  WARNING: Using hardcoded credentials in drivaliaAPI.js', 'yellow');
      log('   Username: ' + api.username, 'yellow');
      log('   Password: ' + api.password.substring(0, 5) + '...', 'yellow');
    } else {
      log('✅ Using credentials from environment variables', 'green');
    }

    diagnosticResults.drivalia.credentialsSource = isHardcoded ? 'hardcoded' : 'environment';
    diagnosticResults.drivalia.username = api.username;

    // Attempt login
    log('\nAttempting to login to Drivalia API...', 'yellow');

    const startTime = Date.now();
    const result = await api.login();
    const duration = Date.now() - startTime;

    log(`✅ Login successful! (${duration}ms)`, 'green');
    log('   Session data received:', 'green');
    log(`   - Session ID: ${result.session?.sessionId || 'N/A'}`, 'green');
    log(`   - User: ${result.session?.user?.name || 'N/A'}`, 'green');

    diagnosticResults.drivalia.loginSuccess = true;
    diagnosticResults.drivalia.loginDuration = duration;
    diagnosticResults.drivalia.session = {
      sessionId: result.session?.sessionId,
      user: result.session?.user?.name
    };

    // Test a simple API call
    log('\nTesting API access (fetching makes)...', 'yellow');
    const makes = await api.getMakes();
    log(`✅ API access working! Found ${makes.length} manufacturers`, 'green');
    log(`   Sample: ${makes.slice(0, 3).map(m => m.name).join(', ')}...`, 'green');

    diagnosticResults.drivalia.apiAccessWorking = true;
    diagnosticResults.drivalia.sampleMakes = makes.slice(0, 5).map(m => m.name);

    return true;

  } catch (error) {
    log(`❌ Drivalia API test failed: ${error.message}`, 'red');
    log(`   Error stack: ${error.stack}`, 'red');

    diagnosticResults.drivalia.loginSuccess = false;
    diagnosticResults.drivalia.error = error.message;
    diagnosticResults.drivalia.errorStack = error.stack;

    // Provide specific guidance based on error
    if (error.message.includes('401')) {
      log('\n🔧 DIAGNOSIS: Invalid credentials', 'yellow');
      log('   The username/password are incorrect or expired', 'yellow');
      log('   ACTION NEEDED: Update credentials in drivaliaAPI.js or add DRIVALIA_USERNAME/DRIVALIA_PASSWORD env vars', 'yellow');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      log('\n🔧 DIAGNOSIS: Network/DNS issue', 'yellow');
      log('   Cannot reach the Drivalia API server', 'yellow');
      log('   ACTION NEEDED: Check Railway networking or API endpoint', 'yellow');
    }

    return false;
  }
}

/**
 * 3. Test Lex Login Flow
 */
async function testLexLogin() {
  section('3. LEX LOGIN FLOW TEST');

  const LEX_USERNAME = process.env.LEX_USERNAME;
  const LEX_PASSWORD = process.env.LEX_PASSWORD;
  const LEX_BASE_URL = process.env.LEX_BASE_URL || 'https://associate.lexautolease.co.uk/';
  const LEX_LOGIN_URL = process.env.LEX_LOGIN_URL || `${LEX_BASE_URL.replace(/\/$/, '')}/Login.aspx`;

  if (!LEX_USERNAME || !LEX_PASSWORD) {
    log('❌ Cannot test Lex login: Missing credentials', 'red');
    diagnosticResults.lex.testSkipped = true;
    diagnosticResults.lex.reason = 'Missing credentials';
    return false;
  }

  log(`Testing Lex login flow...`, 'yellow');
  log(`  URL: ${LEX_LOGIN_URL}`, 'yellow');
  log(`  Username: ${LEX_USERNAME}`, 'yellow');

  let browser = null;
  let page = null;

  try {
    // Launch browser
    log('\nLaunching headless browser...', 'yellow');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });

    page = await browser.newPage();

    // Set up console logging from the page
    page.on('console', msg => {
      log(`  [Browser Console] ${msg.text()}`, 'magenta');
    });

    // Set user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });
    page.setDefaultTimeout(60000);

    log('✅ Browser launched', 'green');

    // Navigate to login page
    log(`\nNavigating to ${LEX_LOGIN_URL}...`, 'yellow');
    const navStartTime = Date.now();

    await page.goto(LEX_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const navDuration = Date.now() - navStartTime;
    log(`✅ Page loaded (${navDuration}ms)`, 'green');

    // Take screenshot of login page
    const screenshotDir = path.join(__dirname, 'diagnostic-screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const loginPageScreenshot = path.join(screenshotDir, 'lex-login-page.png');
    await page.screenshot({ path: loginPageScreenshot, fullPage: true });
    log(`📸 Screenshot saved: ${loginPageScreenshot}`, 'green');

    // Check page content
    const url = page.url();
    const title = await page.title();
    log(`\nPage details:`, 'yellow');
    log(`  URL: ${url}`, 'yellow');
    log(`  Title: ${title}`, 'yellow');

    diagnosticResults.lex.navigation = {
      url,
      title,
      duration: navDuration,
      screenshot: loginPageScreenshot
    };

    // Check for anti-clickjacking
    const hasAntiClickjack = await page.evaluate(() => {
      return !!document.getElementById('antiClickjack');
    });

    if (hasAntiClickjack) {
      log('⚠️  Anti-clickjacking element detected', 'yellow');
      diagnosticResults.lex.antiClickjackDetected = true;
    }

    // Look for login form
    log('\nLooking for login form...', 'yellow');

    const formInfo = await page.evaluate(() => {
      const form = document.getElementById('frmLogon') ||
                    document.forms['frmLogon'] ||
                    document.querySelector('form#frmLogon, form[name="frmLogon"]');

      if (!form) return { found: false };

      const userField = form.querySelector('#txtUserName, input[name="txtUserName"], input[type="text"]');
      const passField = form.querySelector('#txtPassword, input[name="txtPassword"], input[type="password"]');
      const submitBtn = form.querySelector('#btnLogon, input[type="submit"], button[type="submit"]');

      return {
        found: true,
        hasUserField: !!userField,
        hasPassField: !!passField,
        hasSubmitBtn: !!submitBtn,
        userFieldId: userField?.id,
        passFieldId: passField?.id,
        submitBtnId: submitBtn?.id
      };
    });

    if (!formInfo.found) {
      log('❌ Login form not found!', 'red');
      diagnosticResults.lex.formFound = false;

      // Save HTML for analysis
      const html = await page.content();
      const htmlPath = path.join(screenshotDir, 'lex-login-page.html');
      fs.writeFileSync(htmlPath, html);
      log(`📄 HTML saved for analysis: ${htmlPath}`, 'yellow');

      return false;
    }

    log('✅ Login form found:', 'green');
    log(`  Username field: ${formInfo.hasUserField ? '✅' : '❌'} (${formInfo.userFieldId || 'N/A'})`, formInfo.hasUserField ? 'green' : 'red');
    log(`  Password field: ${formInfo.hasPassField ? '✅' : '❌'} (${formInfo.passFieldId || 'N/A'})`, formInfo.hasPassField ? 'green' : 'red');
    log(`  Submit button: ${formInfo.hasSubmitBtn ? '✅' : '❌'} (${formInfo.submitBtnId || 'N/A'})`, formInfo.hasSubmitBtn ? 'green' : 'red');

    diagnosticResults.lex.formFound = true;
    diagnosticResults.lex.formInfo = formInfo;

    // Attempt login
    log('\nAttempting login...', 'yellow');

    const loginStartTime = Date.now();

    await page.evaluate((creds) => {
      // Remove anti-clickjacking overlay
      try {
        const anti = document.getElementById('antiClickjack');
        if (anti && anti.parentNode) anti.parentNode.removeChild(anti);
      } catch {}

      const form = document.getElementById('frmLogon') ||
                    document.forms['frmLogon'] ||
                    document.querySelector('form#frmLogon, form[name="frmLogon"]');

      const userCandidates = [
        () => form.txtUserName,
        () => form.querySelector('#txtUserName'),
        () => form.querySelector('input[name="txtUserName"]'),
        () => form.querySelector('input[type="text"]'),
      ];
      const passCandidates = [
        () => form.txtPassword,
        () => form.querySelector('#txtPassword'),
        () => form.querySelector('input[name="txtPassword"]'),
        () => form.querySelector('input[type="password"]')
      ];

      let userEl = null;
      for (const fn of userCandidates) { try { userEl = fn(); if (userEl) break; } catch {} }
      let passEl = null;
      for (const fn of passCandidates) { try { passEl = fn(); if (passEl) break; } catch {} }

      if (userEl && passEl) {
        userEl.focus();
        userEl.value = creds.username;
        passEl.value = creds.password;

        let submitEl =
          form.querySelector('#btnLogon') ||
          form.querySelector('input[type="submit"]') ||
          form.querySelector('button[type="submit"]');

        if (submitEl) {
          submitEl.click();
        } else {
          form.submit();
        }
      }
    }, { username: LEX_USERNAME, password: LEX_PASSWORD });

    log('  Form submitted, waiting for response...', 'yellow');

    // Wait for navigation or timeout
    try {
      await page.waitForFunction(
        () => !/Login\.aspx/i.test(location.href),
        { timeout: 30000 }
      );

      const loginDuration = Date.now() - loginStartTime;
      const newUrl = page.url();

      log(`✅ Redirected away from login page! (${loginDuration}ms)`, 'green');
      log(`  New URL: ${newUrl}`, 'green');

      // Take screenshot of post-login page
      const postLoginScreenshot = path.join(screenshotDir, 'lex-post-login.png');
      await page.screenshot({ path: postLoginScreenshot, fullPage: true });
      log(`📸 Post-login screenshot: ${postLoginScreenshot}`, 'green');

      // Check for authenticated session
      const isAuthenticated = await page.evaluate(() => {
        return !!(
          (window && window.profile) ||
          document.querySelector('#selManufacturers') ||
          document.querySelector('#selModels')
        );
      });

      if (isAuthenticated) {
        log('✅ Authenticated session detected!', 'green');
        diagnosticResults.lex.loginSuccess = true;
        diagnosticResults.lex.loginDuration = loginDuration;
        diagnosticResults.lex.postLoginUrl = newUrl;
        diagnosticResults.lex.postLoginScreenshot = postLoginScreenshot;
        return true;
      } else {
        log('⚠️  Redirected but authentication markers not found', 'yellow');
        diagnosticResults.lex.loginSuccess = false;
        diagnosticResults.lex.redirectedButNotAuthenticated = true;
        return false;
      }

    } catch (timeoutError) {
      const loginDuration = Date.now() - loginStartTime;
      log(`❌ Login timeout after ${loginDuration}ms`, 'red');
      log(`  Still on URL: ${page.url()}`, 'red');

      // Take screenshot of stuck page
      const stuckScreenshot = path.join(screenshotDir, 'lex-stuck-on-login.png');
      await page.screenshot({ path: stuckScreenshot, fullPage: true });
      log(`📸 Stuck page screenshot: ${stuckScreenshot}`, 'yellow');

      // Get page HTML
      const html = await page.content();
      const htmlPath = path.join(screenshotDir, 'lex-stuck-page.html');
      fs.writeFileSync(htmlPath, html);
      log(`📄 HTML saved: ${htmlPath}`, 'yellow');

      diagnosticResults.lex.loginSuccess = false;
      diagnosticResults.lex.loginTimeout = true;
      diagnosticResults.lex.timeoutDuration = loginDuration;
      diagnosticResults.lex.stuckUrl = page.url();
      diagnosticResults.lex.stuckScreenshot = stuckScreenshot;
      diagnosticResults.lex.stuckHtml = htmlPath;

      // Check for error messages on page
      const errorMessages = await page.evaluate(() => {
        const errors = [];
        const selectors = [
          '.error',
          '.alert',
          '[class*="error"]',
          '[id*="error"]',
          '.message'
        ];

        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            const text = el.textContent.trim();
            if (text && text.length < 500) {
              errors.push(text);
            }
          });
        }

        return errors;
      });

      if (errorMessages.length > 0) {
        log('\n⚠️  Error messages found on page:', 'yellow');
        errorMessages.forEach(msg => log(`    "${msg}"`, 'yellow'));
        diagnosticResults.lex.errorMessages = errorMessages;
      }

      log('\n🔧 DIAGNOSIS: Login form submission not triggering redirect', 'yellow');
      log('   Possible causes:', 'yellow');
      log('   1. Invalid credentials (check LEX_USERNAME/LEX_PASSWORD)', 'yellow');
      log('   2. Anti-bot protection blocking headless browser', 'yellow');
      log('   3. JavaScript requirements not met in headless environment', 'yellow');
      log('   4. Form submission method not working', 'yellow');

      return false;
    }

  } catch (error) {
    log(`❌ Lex login test failed: ${error.message}`, 'red');
    log(`   Error stack: ${error.stack}`, 'red');

    diagnosticResults.lex.error = error.message;
    diagnosticResults.lex.errorStack = error.stack;

    return false;

  } finally {
    if (browser) {
      await browser.close();
      log('\n🔒 Browser closed', 'yellow');
    }
  }
}

/**
 * 4. Generate Summary Report
 */
function generateSummary() {
  section('4. DIAGNOSTIC SUMMARY');

  const issues = [];
  const recommendations = [];

  // Environment issues
  if (!diagnosticResults.environment.allRequiredPresent) {
    issues.push('❌ Missing required environment variables');
    recommendations.push('Set all required environment variables in Railway dashboard');
  }

  // Drivalia issues
  if (!diagnosticResults.drivalia.loginSuccess) {
    issues.push('❌ Drivalia API authentication failing');

    if (diagnosticResults.drivalia.credentialsSource === 'hardcoded') {
      recommendations.push('Update hardcoded credentials in src/drivaliaAPI.js (lines 4-7)');
      recommendations.push('OR add DRIVALIA_USERNAME and DRIVALIA_PASSWORD environment variables and update the code to use them');
    } else {
      recommendations.push('Verify DRIVALIA_USERNAME and DRIVALIA_PASSWORD are correct');
    }
  } else {
    log('✅ Drivalia API: Working correctly', 'green');
  }

  // Lex issues
  if (!diagnosticResults.lex.loginSuccess) {
    issues.push('❌ Lex login failing');

    if (diagnosticResults.lex.loginTimeout) {
      recommendations.push('Lex login is timing out - likely causes:');
      recommendations.push('  - Invalid credentials (verify LEX_USERNAME/LEX_PASSWORD)');
      recommendations.push('  - Anti-bot detection blocking Railway IPs');
      recommendations.push('  - Need to add more anti-bot evasion techniques (stealth plugin, etc.)');
    } else if (diagnosticResults.lex.redirectedButNotAuthenticated) {
      recommendations.push('Lex redirects but session not established - check for:');
      recommendations.push('  - Additional authentication steps (2FA, security questions)');
      recommendations.push('  - Session cookie issues');
    } else if (!diagnosticResults.lex.formFound) {
      recommendations.push('Lex login form not found - page structure may have changed');
      recommendations.push('Check saved HTML/screenshot for details');
    }
  } else {
    log('✅ Lex Login: Working correctly', 'green');
  }

  // Print issues
  if (issues.length > 0) {
    log('\n📋 ISSUES FOUND:', 'red');
    issues.forEach(issue => log(`  ${issue}`, 'red'));
  } else {
    log('\n✅ NO ISSUES FOUND! Both workers should be operational.', 'green');
  }

  // Print recommendations
  if (recommendations.length > 0) {
    log('\n💡 RECOMMENDATIONS:', 'yellow');
    recommendations.forEach(rec => log(`  ${rec}`, 'yellow'));
  }

  diagnosticResults.summary.issues = issues;
  diagnosticResults.summary.recommendations = recommendations;
  diagnosticResults.summary.overallStatus = issues.length === 0 ? 'PASS' : 'FAIL';

  // Save JSON report
  const reportPath = path.join(__dirname, 'diagnostic-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(diagnosticResults, null, 2));
  log(`\n📄 Full diagnostic report saved: ${reportPath}`, 'blue');
}

/**
 * Main Execution
 */
async function main() {
  log('\n🏥 Railway Deployment Diagnostic Script', 'blue');
  log('This script will test both Lex and Drivalia workers\n', 'blue');

  try {
    // Run all diagnostics
    await checkEnvironmentVariables();
    await testDrivaliaAuth();
    await testLexLogin();

    // Generate summary
    generateSummary();

    log('\n✅ Diagnostic complete!', 'green');

    if (diagnosticResults.summary.overallStatus === 'FAIL') {
      process.exit(1);
    }

  } catch (error) {
    log(`\n❌ Diagnostic script crashed: ${error.message}`, 'red');
    log(error.stack, 'red');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
