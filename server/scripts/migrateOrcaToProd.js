/**
 * Migrate local Orca dex_pool_snapshots to production Railway Postgres.
 *
 * Usage:
 *   DATABASE_URL=<prod_url> SOURCE_DATABASE_URL=<local_url> node scripts/migrateOrcaToProd.js
 *
 * Or just run with defaults (reads local, writes to DATABASE_URL):
 *   DATABASE_URL=<prod_url> node scripts/migrateOrcaToProd.js
 */

const { Pool } = require('pg');

const sourcePool = new Pool({
  connectionString: process.env.SOURCE_DATABASE_URL || 'postgresql://localhost:5432/exchange_tracker',
  max: 5
});

const destPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log('[Migrate] Starting Orca snapshot migration to production...');

  // Fetch all snapshots that have Orca pool data from local DB
  const snapResult = await sourcePool.query(`
    SELECT DISTINCT s.id, s.taken_at, s.snapshot_type, s.status
    FROM snapshots s
    JOIN dex_pool_snapshots d ON d.snapshot_id = s.id
    WHERE d.venue = 'Orca' AND s.status = 'complete'
    ORDER BY s.taken_at ASC
  `);

  const snapshots = snapResult.rows;
  console.log(`[Migrate] Found ${snapshots.length} snapshots with Orca data`);

  // Check which dates already exist in prod (by taken_at timestamp)
  const existingResult = await destPool.query(`
    SELECT taken_at FROM snapshots ORDER BY taken_at
  `);
  const existingTs = new Set(existingResult.rows.map(r => r.taken_at.toISOString()));
  const todo = snapshots.filter(s => !existingTs.has(s.taken_at.toISOString()));
  console.log(`[Migrate] ${snapshots.length - todo.length} already in prod, ${todo.length} to migrate`);

  if (todo.length === 0) {
    console.log('[Migrate] Nothing to do.');
    await sourcePool.end();
    await destPool.end();
    return;
  }

  let inserted = 0;
  let errors = 0;

  for (const snap of todo) {
    const client = await destPool.connect();
    try {
      // Fetch pool rows for this snapshot from local
      const poolRows = await sourcePool.query(
        `SELECT * FROM dex_pool_snapshots WHERE snapshot_id = $1`,
        [snap.id]
      );

      await client.query('BEGIN');

      const newSnap = await client.query(
        `INSERT INTO snapshots (taken_at, snapshot_type, status)
         VALUES ($1, $2, $3) RETURNING id`,
        [snap.taken_at, snap.snapshot_type, snap.status]
      );
      const newSnapId = newSnap.rows[0].id;

      for (const p of poolRows.rows) {
        await client.query(
          `INSERT INTO dex_pool_snapshots (
            snapshot_id, address, name, pool_type, chain, venue,
            tvl_usd, usdg_balance, yield_24h,
            volume_24h, fees_24h, volume_7d, fees_7d, volume_30d, fees_30d,
            price, token_a_symbol, token_a_balance, token_b_symbol, token_b_balance, fee_rate
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            newSnapId, p.address, p.name, p.pool_type, p.chain, p.venue,
            p.tvl_usd, p.usdg_balance, p.yield_24h,
            p.volume_24h, p.fees_24h, p.volume_7d, p.fees_7d, p.volume_30d, p.fees_30d,
            p.price, p.token_a_symbol, p.token_a_balance, p.token_b_symbol, p.token_b_balance, p.fee_rate
          ]
        );
      }

      await client.query('COMMIT');
      inserted++;

      if (inserted % 100 === 0 || inserted === todo.length) {
        console.log(`[Migrate] ${inserted}/${todo.length} — ${snap.taken_at.toISOString().split('T')[0]} (${snap.snapshot_type}, ${poolRows.rows.length} pools)`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      errors++;
      console.error(`[Migrate] Error for snapshot ${snap.id}:`, err.message);
    } finally {
      client.release();
    }

    await delay(50);
  }

  console.log(`[Migrate] Done. ${inserted} snapshots migrated, ${errors} errors.`);
  await sourcePool.end();
  await destPool.end();
}

run().catch(err => {
  console.error('[Migrate] Fatal:', err);
  process.exit(1);
});
