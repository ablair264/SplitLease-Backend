# Drivalia Worker Status

## Current Situation

We've attempted three approaches to automate Drivalia quote generation:

### 1. ❌ Direct API Approach (`drivaliaWorker.js`)
**Status:** Failed due to WAF blocking

- Direct API calls to `/calculate/` endpoint
- Getting 401/403 errors due to Web Application Firewall
- WAF blocks requests that don't come from a real browser session

### 2. ❌ Hybrid Approach (`drivaliaHybridWorker.js`)
**Status:** Failed - session cookies not working

- Browser login to get session cookies
- Then use cookies for direct API calls
- Problem: API still returns 401 even with valid cookies
- Likely needs additional session state (CSRF tokens, etc.)

### 3. 🟡 Pure Browser Automation (`drivaliaSimpleBrowserWorker.js`)
**Status:** In Progress - Vehicle selection implemented

- Full browser automation (no API shortcuts)
- Uses Puppeteer to interact with Angular UI
- Vehicle selection logic just implemented
- Needs testing

## Current Implementation

### File: `src/drivaliaSimpleBrowserWorker.js`

**Completed:**
- ✅ Browser initialization with stealth mode
- ✅ Login automation
- ✅ Navigation to quote page
- ✅ Vehicle selection logic (make/model/variant dropdowns)
- ✅ Quote parameter setting (term, mileage, upfront payment)
- ✅ Recalculate button click
- ✅ Quote extraction from results
- ✅ Job polling and management
- ✅ Supabase integration for job tracking

**Vehicle Selection Strategy:**
The `selectVehicle()` method tries multiple approaches:
1. Find and click make dropdown (tries multiple selectors)
2. Type to filter, then click matching option
3. Same for model dropdown
4. For variants, tries both dropdown and direct clicking
5. Takes screenshots on failure for debugging

**Quote Extraction:**
Extracts prices from `.cui-payment-schedule__value` elements as shown in recording:
- First element: Upfront payment
- Second element: Monthly rental

## How to Run

```bash
# Test the simple browser worker
npm run worker:simple

# Or directly
node src/drivaliaSimpleBrowserWorker.js
```

The worker will:
1. Initialize a visible browser (headless: false for debugging)
2. Log in to Drivalia
3. Poll for pending jobs from Supabase
4. Process each job by automating the browser UI
5. Save quotes back to Supabase

## Next Steps

### 1. Test Vehicle Selection
The vehicle selection logic hasn't been tested yet. Need to:
- Submit a test job through the frontend
- Watch the browser automation run
- Check if selectors work for make/model/variant dropdowns
- Adjust selectors based on actual UI behavior

### 2. Handle Edge Cases
- What if a vehicle isn't found?
- What if dropdowns don't load?
- What if the UI changes between steps?

### 3. Add Better Error Recovery
- If vehicle selection fails, try alternative methods
- Maybe fall back to using the hybrid approach's vehicle lookup API
- Take more screenshots for debugging

### 4. Optimize Performance
- Current implementation waits 2 seconds between many steps
- Could reduce timeouts once we know it works
- Could run multiple browser instances for parallel processing

### 5. Make it Headless
- Currently runs with visible browser for debugging
- Once stable, switch to headless: 'new'

## Testing Plan

1. **Manual Test:**
   ```bash
   npm run worker:simple
   ```
   - Submit a job via web UI with known vehicle (e.g., "AUDI A3 DIESEL SALOON")
   - Watch browser automation
   - Check console logs
   - Verify quotes are saved

2. **Check Screenshots:**
   - If vehicle selection fails, check `vehicle-selection-error-*.png`
   - Use screenshots to identify correct selectors

3. **Iterate:**
   - Update selectors based on what we find
   - Add fallback strategies
   - Test with different vehicles

## Known Issues

1. **Selectors May Not Match:**
   - The recording showed Angular Material components
   - But exact selectors depend on Drivalia's current UI
   - May need to adjust `mat-select`, `mat-option` selectors

2. **Timing Issues:**
   - Angular UI may take time to load
   - Current 2-second waits may be too short or too long
   - Should use `waitForSelector` where possible

3. **Variant Selection Uncertainty:**
   - Recording shows variants might be in a results table
   - Or might be in a third dropdown
   - Current implementation tries both approaches

## Alternative: Fix Hybrid Approach

If pure browser automation is too fragile, we could try to fix the hybrid approach:

**Problem:** API calls return 401 even with cookies from browser login

**Possible fixes:**
1. Extract CSRF token from page and include in API headers
2. Include more browser context (Referer, Origin, etc.)
3. Maintain browser session alongside API calls
4. Use browser to make API calls via `page.evaluate(fetch(...))`

The advantage of hybrid is speed - API calls are faster than UI automation.

## Recording Data

The `drivalia-recording/` folder contains:
- `recording.json` - Full network trace and page states
- `REPORT.md` - Human-readable analysis
- Screenshots of login and quote pages
- All API request/response data

This shows exactly how a real quote was generated:
- Make: AUDI (makeId: 31705)
- Model: A3 DIESEL SALOON (modelId: 129481)
- Variant: 2.0 TDI 150 Black Edition 4dr S Tronic (variantId: 1254757)
- Term: 24 months
- Mileage: 10,000 miles
- Result: £602.78/month

## Conclusion

The pure browser automation approach is the most promising because:
1. ✅ It bypasses WAF issues (looks like real user)
2. ✅ No session management complexity
3. ✅ Works with any UI changes (just update selectors)
4. ❌ Slower than API calls
5. ❌ More fragile (depends on UI structure)

**Next action:** Test the worker and iterate on selectors until it works reliably.
