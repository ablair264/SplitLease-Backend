require('dotenv').config();
const { leaseDB } = require('./src/db');

async function clearTables() {
  try {
    console.log('🗑️  Clearing lease_offers table...');
    const result1 = await leaseDB.query('DELETE FROM lease_offers');
    console.log(`✅ Deleted ${result1.rowCount} records from lease_offers`);

    console.log('🗑️  Clearing best_deals_cache table...');
    const result2 = await leaseDB.query('DELETE FROM best_deals_cache');
    console.log(`✅ Deleted ${result2.rowCount} records from best_deals_cache`);

    console.log('✨ All tables cleared successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing tables:', error);
    process.exit(1);
  }
}

clearTables();
