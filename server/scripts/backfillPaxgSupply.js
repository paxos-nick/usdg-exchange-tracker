/**
 * Backfill 3 years of daily PAXG circulating supply from Ethereum on-chain data.
 * Uses PublicNode's free public archive RPC — no API key required.
 *
 * Usage: node scripts/backfillPaxgSupply.js [days]
 * Default: 1095 days (~3 years)
 *
 * Safe to re-run — skips dates already in the database.
 */

const paxgService = require('../services/paxg');
const pool = require('../db/pool');

const DELAY_MS = 300; // ~3 req/sec — gentle on PublicNode
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const days = parseInt(process.argv[2] || '1095', 10);
  console.log(`[Backfill] Starting PAXG supply backfill for ${days} days...`);

  // Get reference block info from the chain (used for block estimation)
  console.log('[Backfill] Fetching reference block from chain...');
  const { blockNumber: refBlock, timestamp: refTs } = await paxgService.getCurrentBlockInfo();
  console.log(`[Backfill] Reference: block ${refBlock}, timestamp ${new Date(refTs * 1000).toISOString()}`);

  // Build list of target dates (oldest first)
  const dates = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    dates.push(d.toISOString().split('T')[0]);
  }

  // Check which dates are already in the DB
  const existing = await pool.query('SELECT supply_date::text FROM paxg_supply_history');
  const existingDates = new Set(existing.rows.map(r => r.supply_date.split('T')[0]));
  const todo = dates.filter(d => !existingDates.has(d));
  console.log(`[Backfill] ${existingDates.size} dates already stored. ${todo.length} to fetch.`);

  if (todo.length === 0) {
    console.log('[Backfill] Nothing to do.');
    await pool.end();
    return;
  }

  let success = 0;
  let errors = 0;

  for (let i = 0; i < todo.length; i++) {
    const dateStr = todo[i];
    try {
      const { supply, blockNumber } = await paxgService.getSupplyForDate(dateStr, refBlock, refTs);

      await pool.query(
        `INSERT INTO paxg_supply_history (supply_date, supply, block_number)
         VALUES ($1, $2, $3)
         ON CONFLICT (supply_date) DO NOTHING`,
        [dateStr, supply, blockNumber]
      );

      success++;
      if (success % 50 === 0 || i === todo.length - 1) {
        console.log(`[Backfill] ${i + 1}/${todo.length} — ${dateStr}: ${supply.toFixed(2)} PAXG (block ${blockNumber})`);
      }
    } catch (err) {
      errors++;
      console.error(`[Backfill] Error for ${dateStr}:`, err.message);
    }

    await delay(DELAY_MS);
  }

  console.log(`[Backfill] Done. ${success} inserted, ${errors} errors.`);
  await pool.end();
}

run().catch(err => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
