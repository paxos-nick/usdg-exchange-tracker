/**
 * Backfill daily USDG Aave v4 borrow data from on-chain archive.
 * Queries getReserveTotalDebt() and getAssetDrawnRate() at one block per day.
 *
 * Usage: node scripts/backfillAaveUsdg.js [start_date]
 * Default start: 2025-05-01
 * Safe to re-run — skips dates already in the database.
 */

const aaveV4 = require('../services/aaveV4');
const pool   = require('../db/pool');

const DELAY_MS   = 500; // gentle on PublicNode — ~2 req/sec (5 calls per day)
const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const startArg  = process.argv[2] || '2025-05-01';
  const startDate = new Date(startArg + 'T00:00:00Z');
  const today     = new Date();
  const currentDay = today.toISOString().split('T')[0];

  console.log(`[Backfill] USDG Aave v4: ${startArg} → ${currentDay}`);

  // Get reference block for date estimation
  console.log('[Backfill] Fetching reference block...');
  const { blockNumber: refBlock, timestamp: refTs } = await aaveV4.getCurrentBlockInfo();
  console.log(`[Backfill] Reference: block ${refBlock} @ ${new Date(refTs * 1000).toISOString()}`);

  // Build date list
  const dates = [];
  for (let d = new Date(startDate); d.toISOString().split('T')[0] < currentDay; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  // Reprocess dates that are missing OR lack supply data (idle USDG needs total_supply).
  const existing = await pool.query(
    'SELECT snapshot_date::text AS d, (total_supply IS NOT NULL) AS has_supply FROM aave_usdg_history'
  );
  const completeSet = new Set(
    existing.rows.filter(r => r.has_supply).map(r => r.d.split('T')[0])
  );
  const todo = dates.filter(d => !completeSet.has(d));
  console.log(`[Backfill] ${completeSet.size} complete (with supply), ${todo.length} to (re)fetch`);

  if (todo.length === 0) { console.log('[Backfill] Nothing to do.'); await pool.end(); return; }

  let success = 0, errors = 0;

  for (let i = 0; i < todo.length; i++) {
    const dateStr = todo[i];
    try {
      const blockNumber = aaveV4.estimateBlockForDate(dateStr, refBlock, refTs);
      const data = await aaveV4.getUsdgReserveDataAtBlock(blockNumber);

      await pool.query(
        `INSERT INTO aave_usdg_history
           (snapshot_date, total_debt, borrow_apy, daily_interest, block_number, spoke_breakdown, total_supply, supply_apy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (snapshot_date) DO UPDATE SET
           total_supply = EXCLUDED.total_supply,
           supply_apy   = EXCLUDED.supply_apy`,
        [dateStr, data.totalVariableDebt, data.variableBorrowApy,
         data.dailyInterestCost, blockNumber, JSON.stringify(data.spokeBreakdown),
         data.totalSupply, data.supplyApy]
      );

      success++;
      if (success % 10 === 0 || i === todo.length - 1) {
        const idle = Math.max(data.totalSupply - data.totalVariableDebt, 0);
        console.log(`[Backfill] ${i + 1}/${todo.length} — ${dateStr}: $${Math.round(data.totalVariableDebt / 1e6 * 100) / 100}M borrowed, $${Math.round(data.totalSupply / 1e6 * 100) / 100}M supplied, idle $${Math.round(idle / 1e6 * 100) / 100}M`);
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

run().catch(err => { console.error('[Backfill] Fatal:', err); process.exit(1); });
