# Railway Diagnostic Script

This diagnostic script identifies configuration issues preventing the Lex and Drivalia workers from running on Railway.

## Quick Start

### Run Locally (Recommended First)

```bash
cd lease-analyzer-backend
npm install
node diagnose-railway.js
```

### Run on Railway

```bash
# SSH into your Railway deployment
railway run node diagnose-railway.js

# Or add as a one-time script
# In package.json, add:
#   "diagnose": "node diagnose-railway.js"
# Then run:
railway run npm run diagnose
```

## What It Tests

### 1. Environment Variables ✅
- Checks if all required variables are set:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `LEX_USERNAME`
  - `LEX_PASSWORD`
- Shows which optional variables are configured

### 2. Drivalia API Authentication 🔐
- Tests login with current credentials
- Identifies if using hardcoded vs. environment credentials
- Attempts to fetch vehicle catalog to verify API access
- Provides specific error diagnosis

### 3. Lex Login Flow 🌐
- Launches headless browser (same as worker)
- Navigates to Lex login page
- Attempts to login with configured credentials
- Takes screenshots at each step
- Saves HTML for analysis if stuck
- Detects anti-bot protections

### 4. Summary Report 📋
- Lists all issues found
- Provides actionable recommendations
- Saves full JSON report for detailed analysis

## Output Files

After running, check these files:

```
lease-analyzer-backend/
├── diagnostic-report.json          # Full JSON report
└── diagnostic-screenshots/         # Screenshots from Lex test
    ├── lex-login-page.png         # Initial login page
    ├── lex-post-login.png         # After successful login
    ├── lex-stuck-on-login.png     # If login times out
    ├── lex-login-page.html        # HTML if form not found
    └── lex-stuck-page.html        # HTML if stuck
```

## Known Issues & Solutions

### Drivalia: 401 Unauthorized ❌

**Problem:** Hardcoded credentials in `src/drivaliaAPI.js:4` are expired/invalid

**Solution:**
```javascript
// Option 1: Update hardcoded credentials (temporary fix)
constructor(username = 'YOUR_USERNAME', password = 'YOUR_PASSWORD') {

// Option 2: Use environment variables (better)
constructor(
  username = process.env.DRIVALIA_USERNAME || 'fallback',
  password = process.env.DRIVALIA_PASSWORD || 'fallback'
) {
```

Then set in Railway:
```bash
DRIVALIA_USERNAME=your_username
DRIVALIA_PASSWORD=your_password
```

### Lex: Login Timeout ⏱️

**Problem:** Login form submits but never redirects from Login.aspx

**Possible causes:**
1. **Invalid credentials** - Verify `LEX_USERNAME` and `LEX_PASSWORD`
2. **Anti-bot detection** - Railway IPs may be blocked by Lex's bot protection
3. **Anti-clickjacking interference** - The page has JavaScript that fights automation

**Solutions:**

#### 1. Verify credentials locally first
Run the diagnostic script locally where Lex login is known to work:
```bash
node diagnose-railway.js
```

If it works locally but fails on Railway → it's an environment/IP issue, not credentials.

#### 2. Add stealth techniques
Install puppeteer-extra with stealth plugin:
```bash
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```

Update `lexWorker.js`:
```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
```

#### 3. Add more browser fingerprinting
In `lexWorker.js`, add these to `initBrowser()`:
```javascript
args: [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',  // NEW
  '--disable-features=IsolateOrigins,site-per-process', // NEW
  '--window-size=1366,900' // NEW
],
ignoreDefaultArgs: ['--enable-automation'], // NEW
```

And after `newPage()`:
```javascript
// Hide webdriver property
await this.page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
  });
});

// Add realistic Chrome properties
await this.page.evaluateOnNewDocument(() => {
  window.chrome = {
    runtime: {},
  };
});
```

#### 4. Contact Lex IT support
If Railway IPs are blocked, you may need to:
- Request IP whitelisting
- Use a proxy service
- Run workers from a different hosting provider

## Environment Variables Checklist

Make sure these are set in Railway:

**Required:**
- [ ] `SUPABASE_URL` - Your Supabase project URL
- [ ] `SUPABASE_SERVICE_KEY` - Supabase service role key (not anon key!)
- [ ] `LEX_USERNAME` - Lex AutoLease login username
- [ ] `LEX_PASSWORD` - Lex AutoLease login password
- [ ] `DRIVALIA_USERNAME` - Drivalia API username (after code update)
- [ ] `DRIVALIA_PASSWORD` - Drivalia API password (after code update)

**Optional:**
- [ ] `LEX_BASE_URL` - Override default Lex URL
- [ ] `LEX_LOGIN_URL` - Override default login URL
- [ ] `JOB_POLL_INTERVAL_MS` - How often to poll for jobs (default: 5000)
- [ ] `MAX_CONCURRENT_JOBS` - Max jobs to process at once (default: 3)

## Next Steps

1. **Run the diagnostic script** locally first
2. **Fix any issues** it identifies
3. **Test locally** to verify fixes work
4. **Deploy to Railway** with updated code/env vars
5. **Run diagnostic on Railway** to verify deployment
6. **Monitor worker logs** when processing actual jobs

## Getting Help

If the diagnostic report shows issues you can't resolve:

1. Share the `diagnostic-report.json` file
2. Include screenshots from `diagnostic-screenshots/`
3. Include relevant Railway logs
4. Describe any recent changes to Lex/Drivalia sites

## Technical Details

### Why Lex Login Might Fail on Railway

1. **Headless Detection**: Lex may detect headless browsers and block them
2. **IP Reputation**: Railway IPs might be flagged as datacenter/bot traffic
3. **Browser Fingerprinting**: Missing browser properties that real Chrome has
4. **Network Timing**: Railway's network latency might differ from local
5. **Resource Constraints**: Limited CPU/memory affecting browser performance

### Why Drivalia Returns 401

The current code has hardcoded credentials at initialization:
```javascript
class DrivaliaAPI {
  constructor(username = 'Ally Blair', password = '9Mu@.5Qw2!XXtaF') {
```

These credentials are either:
- Expired/revoked
- Wrong environment (dev vs. prod)
- Account locked/disabled

The diagnostic script will test these and tell you the exact HTTP response.
