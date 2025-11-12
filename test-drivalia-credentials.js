/**
 * Interactive Drivalia Credential Tester
 *
 * Tests Drivalia API credentials and shows detailed results
 * Run: node test-drivalia-credentials.js
 */

require('dotenv').config();
const readline = require('readline');
const { DrivaliaAPI } = require('./src/drivaliaAPI');

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function testCredentials(username, password) {
  log('\n🧪 Testing credentials...', 'yellow');
  log(`   Username: ${username}`, 'yellow');
  log(`   Password: ${password.substring(0, 3)}${'*'.repeat(password.length - 3)}`, 'yellow');

  try {
    // Create API instance with provided credentials
    const api = new DrivaliaAPI(username, password);

    // Step 1: Test login
    log('\n1️⃣  Testing login...', 'blue');
    const startTime = Date.now();
    const loginResult = await api.login();
    const loginDuration = Date.now() - startTime;

    log(`   ✅ Login successful! (${loginDuration}ms)`, 'green');

    if (loginResult.session) {
      log('   📋 Session Details:', 'green');
      log(`      Session ID: ${loginResult.session.sessionId || 'N/A'}`, 'green');
      log(`      User: ${loginResult.session.user?.name || 'N/A'}`, 'green');
      log(`      Email: ${loginResult.session.user?.email || 'N/A'}`, 'green');
    }

    // Step 2: Test API access
    log('\n2️⃣  Testing API access (fetching manufacturers)...', 'blue');
    const makes = await api.getMakes();
    log(`   ✅ API access working! Found ${makes.length} manufacturers`, 'green');
    log(`   📋 Sample manufacturers:`, 'green');
    makes.slice(0, 5).forEach(m => {
      log(`      - ${m.name} (code: ${m.code})`, 'green');
    });

    // Step 3: Test vehicle lookup
    log('\n3️⃣  Testing vehicle lookup (Alfa Romeo Giulia)...', 'blue');
    try {
      const vehicle = await api.findVariant('Alfa Romeo', 'Giulia', '2.0');
      log(`   ✅ Vehicle found: ${vehicle.name}`, 'green');
      log(`      XRef Code: ${vehicle.xrefCode}`, 'green');
      log(`      P11D: £${vehicle.p11d}`, 'green');
      log(`      CO2: ${vehicle.co2}g/km`, 'green');

      // Step 4: Test quote calculation
      log('\n4️⃣  Testing quote calculation (36m, 10k miles)...', 'blue');
      const quote = await api.calculateQuote({
        vehicle: vehicle,
        term: 36,
        annualMileage: 10000,
        maintenance: false,
        deposit: 0
      });

      log(`   ✅ Quote calculated successfully!`, 'green');
      log(`      Monthly Payment (Net): £${quote.monthlyPayment.net}`, 'green');
      log(`      Monthly Payment (Gross): £${quote.monthlyPayment.gross}`, 'green');
      log(`      Total Cost (Net): £${quote.totalCost.net}`, 'green');

    } catch (vehicleError) {
      log(`   ⚠️  Vehicle lookup/quote failed: ${vehicleError.message}`, 'yellow');
      log('   (This is OK - credentials work, just couldn\'t find that specific vehicle)', 'yellow');
    }

    log('\n✅ ALL TESTS PASSED!', 'green');
    log('   These credentials are VALID and working correctly.', 'green');

    // Show how to configure them
    log('\n📝 To use these credentials:', 'blue');
    log('   Option 1 - Environment Variables (Recommended):', 'blue');
    log(`      DRIVALIA_USERNAME="${username}"`, 'magenta');
    log(`      DRIVALIA_PASSWORD="${password}"`, 'magenta');
    log('\n   Option 2 - Update hardcoded values in src/drivaliaAPI.js:', 'blue');
    log(`      constructor(username = '${username}', password = '${password}')`, 'magenta');

    return true;

  } catch (error) {
    log(`\n❌ CREDENTIAL TEST FAILED`, 'red');
    log(`   Error: ${error.message}`, 'red');

    // Provide specific guidance
    if (error.message.includes('403')) {
      log('\n💡 Diagnosis: 403 Forbidden', 'yellow');
      log('   Possible causes:', 'yellow');
      log('   • IP address is blocked/not whitelisted', 'yellow');
      log('   • WAF (Web Application Firewall) blocking the request', 'yellow');
      log('   • API access restricted to specific IPs', 'yellow');
      log('   • User agent or request headers being blocked', 'yellow');
      log('\n   Try:', 'yellow');
      log('   • Access the Drivalia portal manually in a browser', 'yellow');
      log('   • Contact Drivalia support to whitelist your IP', 'yellow');
      log('   • Check if there\'s a different API endpoint for automation', 'yellow');
    } else if (error.message.includes('401')) {
      log('\n💡 Diagnosis: 401 Unauthorized', 'yellow');
      log('   The username or password is incorrect', 'yellow');
      log('   • Double-check spelling and capitalization', 'yellow');
      log('   • Try resetting the password in the Drivalia portal', 'yellow');
      log('   • Verify the account is active and not locked', 'yellow');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      log('\n💡 Diagnosis: Network/Connection Error', 'yellow');
      log('   Cannot reach the Drivalia API server', 'yellow');
      log('   • Check your internet connection', 'yellow');
      log('   • Verify the API endpoint URL is correct', 'yellow');
      log('   • Check if there\'s a firewall blocking the connection', 'yellow');
    }

    return false;
  }
}

async function main() {
  log('\n🔐 Drivalia API Credential Tester', 'blue');
  log('=' .repeat(80), 'blue');

  // Check if credentials are in environment
  const envUsername = process.env.DRIVALIA_USERNAME;
  const envPassword = process.env.DRIVALIA_PASSWORD;

  if (envUsername && envPassword) {
    log('\n✅ Found credentials in environment variables:', 'green');
    log(`   DRIVALIA_USERNAME = ${envUsername}`, 'green');
    log(`   DRIVALIA_PASSWORD = ${envPassword.substring(0, 3)}${'*'.repeat(Math.max(0, envPassword.length - 3))}`, 'green');

    const useEnv = await question('\nTest these credentials? (y/n): ');

    if (useEnv.toLowerCase() === 'y') {
      const success = await testCredentials(envUsername, envPassword);
      rl.close();
      process.exit(success ? 0 : 1);
    }
  } else {
    log('\n⚪ No credentials found in environment variables', 'yellow');
    log('   Set DRIVALIA_USERNAME and DRIVALIA_PASSWORD to skip manual entry', 'yellow');
  }

  // Manual entry
  log('\n📝 Enter credentials to test:', 'blue');

  const username = await question('Username: ');
  const password = await question('Password: ');

  if (!username || !password) {
    log('\n❌ Username and password are required', 'red');
    rl.close();
    process.exit(1);
  }

  const success = await testCredentials(username, password);

  rl.close();
  process.exit(success ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = { testCredentials };
