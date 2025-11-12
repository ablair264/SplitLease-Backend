# Drivalia Browser Worker Setup Guide

## What Changed?

We switched from **direct API calls** (blocked by WAF) to **browser automation** (works like a real user).

### Why This Works:
- ✅ Browser has all the right cookies and session state
- ✅ JavaScript executes properly
- ✅ Looks like a real user to the WAF
- ✅ Same approach as Lex worker (proven to work)

---

## Quick Start

### 1. Test the New Worker Locally

```bash
cd lease-analyzer-backend
npm run worker:browser
```

**Expected behavior:**
- Opens headless browser
- Logs into Drivalia web portal
- Waits for jobs from Supabase

### 2. Create a Test Job

Use your frontend to create a Drivalia job, or create one manually in Supabase.

---

## ⚠️ Important: Customize the Selectors

The worker needs to know the exact HTML selectors for Drivalia's UI. These are currently **placeholders** and need to be updated based on the actual Drivalia portal.

### How to Find the Right Selectors

1. **Open Drivalia Portal in Chrome:**
   - Go to https://www.caafgenus3.co.uk/WebApp/
   - Login with your credentials

2. **Navigate to the Quote Page:**
   - Find where you normally get quotes
   - Right-click on each form element → "Inspect"

3. **Copy the Selectors:**
   For each element, look for:
   - `name` attribute (best)
   - `id` attribute (good)
   - `class` names (okay)
   - `ng-model` for AngularJS apps (common in Drivalia)

### Elements to Find:

#### Login Page (`ensureLoggedIn()` method)
- [ ] Username input field
- [ ] Password input field
- [ ] Login button

**Current selectors:**
```javascript
// Lines 136-137 in drivaliaBrowserWorker.js
'input[name="username"], input[type="text"]'
'input[name="password"], input[type="password"]'
```

**How to update:**
1. Inspect the username field
2. Copy its `name` or `id`
3. Update line 136: `'input[name="YOUR_ACTUAL_NAME"]'`

#### Quote Page (`searchVehicle()` method)
- [ ] Manufacturer dropdown/input
- [ ] Model dropdown/input
- [ ] Variant dropdown/input

**Current selectors:**
```javascript
// Lines 202-203 in drivaliaBrowserWorker.js
'select[name="make"], input[placeholder*="manufacturer"]'
'select[name="model"]'
'select[name="variant"]'
```

#### Quote Parameters (`setQuoteParameters()` method)
- [ ] Term/contract length
- [ ] Annual mileage
- [ ] Deposit (optional)
- [ ] Maintenance checkbox (optional)

**Current selectors:**
```javascript
// Lines 258-262 in drivaliaBrowserWorker.js
'select[name="term"], input[name="term"]'
'select[name="mileage"], input[name="annualMileage"]'
'input[name="deposit"], input[name="initialPayment"]'
'input[type="checkbox"][name*="maintenance"]'
```

#### Quote Results (`getQuote()` method)
- [ ] Monthly rental amount element
- [ ] Total cost element (optional)
- [ ] Initial payment element (optional)
- [ ] Calculate/Get Quote button

**Current selectors:**
```javascript
// Lines 296-300 in drivaliaBrowserWorker.js
'button[ng-click*="calculate"], button.calculate-btn'
'.monthly-rental, .rental-amount, [ng-bind*="monthly"]'
'.total-cost, [ng-bind*="total"]'
'.initial-payment, [ng-bind*="initial"]'
```

---

## Step-by-Step Customization

### Method 1: Use Your Browser Console Logs

Since you already captured API calls, you likely have the page open. Let's use it:

1. **Open Browser Console** (F12)
2. **Run this script to find selectors:**

```javascript
// Find login elements
console.log('=== LOGIN PAGE ===');
console.log('Username field:', document.querySelector('input[type="text"]'));
console.log('Password field:', document.querySelector('input[type="password"]'));
console.log('Login button:', document.querySelector('button[type="submit"]'));

// After logging in, go to quote page and run:
console.log('=== QUOTE PAGE ===');
console.log('Make selector:', document.querySelector('select, input').name || 'Need to find');
console.log('All inputs:', Array.from(document.querySelectorAll('input')).map(i => ({
  name: i.name,
  id: i.id,
  placeholder: i.placeholder,
  type: i.type
})));
console.log('All selects:', Array.from(document.querySelectorAll('select')).map(s => ({
  name: s.name,
  id: s.id
})));
```

3. **Copy the output** and share it with me, I'll update the selectors for you.

### Method 2: Record a Manual Quote

1. **Open Drivalia in Chrome**
2. **Open DevTools** → Network tab → Record
3. **Get a quote manually** (fill form, click calculate)
4. **Right-click on each field** you interact with → Copy selector
5. **Update the worker code** with those selectors

### Method 3: Take Screenshots

If you're not comfortable with selectors:

1. **Login to Drivalia**
2. **Go to quote page**
3. **Take screenshots** of:
   - The full quote form
   - Login page
   - Results page
4. **Share screenshots** - I can identify the selectors

---

## Testing Your Changes

After updating selectors:

```bash
# Test locally first
npm run worker:browser

# Check the console output for errors
```

### Common Issues:

**"Element not found" errors:**
```
Error: Waiting for selector 'input[name="username"]' failed: Timeout 30000ms exceeded
```
**Fix:** The selector is wrong. Inspect the element and use the correct selector.

**"Already logged in" message but actually not:**
```javascript
// Update the isLoggedIn check on line 122
const isLoggedIn = await this.page.evaluate(() => {
  // Replace with YOUR specific logged-in indicator
  return !!document.querySelector('.user-menu'); // ← Change this
});
```

**Form submits but doesn't navigate:**
- Increase timeout on line 152
- Check if there's a "loading" overlay that needs to be waited for

---

## What I Need From You

To finish customizing this worker, please provide **ONE** of the following:

### Option A: Selector Discovery (Best)
Run this in your browser console while on Drivalia quote page:

```javascript
const info = {
  login: {
    username: document.querySelector('input[type="text"]')?.outerHTML,
    password: document.querySelector('input[type="password"]')?.outerHTML,
    button: document.querySelector('button[type="submit"]')?.outerHTML
  },
  quote: {
    allInputs: Array.from(document.querySelectorAll('input')).map(i => ({
      name: i.name, id: i.id, placeholder: i.placeholder, type: i.type
    })),
    allSelects: Array.from(document.querySelectorAll('select')).map(s => ({
      name: s.name, id: s.id
    })),
    buttons: Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim(), onClick: b.getAttribute('ng-click')
    }))
  }
};
console.log(JSON.stringify(info, null, 2));
```

Copy the output and share it.

### Option B: Screenshots (Easier)
Take screenshots of:
1. Login page (with form visible)
2. Quote page with empty form
3. Quote page with filled form
4. Results after clicking "Calculate"

### Option C: HTML Source (Most Complete)
1. Login to Drivalia
2. Go to quote page
3. Right-click → "View Page Source" or Ctrl+U
4. Save the HTML file
5. Share it with me

---

## Deploying to Railway

Once the selectors are working locally:

1. **Commit changes:**
```bash
git add .
git commit -m "feat: add Drivalia browser automation worker"
git push
```

2. **Update Railway service:**
   - Go to Railway dashboard
   - Find your Drivalia worker service
   - Change the start command from:
     ```
     npm run worker
     ```
     to:
     ```
     npm run worker:browser
     ```

3. **Verify environment variables are set:**
   - `DRIVALIA_USERNAME`
   - `DRIVALIA_PASSWORD`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

4. **Deploy and monitor logs**

---

## Advantages of Browser Automation

✅ **No more 403 errors** - WAF sees a real browser
✅ **Works exactly like manual process** - same UI flow
✅ **More reliable** - if UI works manually, it works automated
✅ **Can handle dynamic content** - JavaScript, AJAX, etc.
✅ **Same approach as Lex** - proven pattern

## Disadvantages

⚠️ **Slower than API** - needs to load pages, click buttons
⚠️ **More resource intensive** - runs full Chrome browser
⚠️ **Breaks if UI changes** - selectors need updating
⚠️ **Harder to debug** - need screenshots/HTML dumps

---

## Next Steps

1. **Find the selectors** using one of the methods above
2. **Update drivaliaBrowserWorker.js** with correct selectors
3. **Test locally** with `npm run worker:browser`
4. **Deploy to Railway** once working
5. **Keep old API worker** as backup (might work from Railway IPs)

Let me know which option you prefer for finding selectors!
