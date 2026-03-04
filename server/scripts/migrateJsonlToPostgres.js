const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');
const { setupDatabase } = require('../db/schema');

const SNAPSHOTS_FILE = path.join(__dirname, '..', 'logs', 'dex-snapshots.jsonl');

async function migrate() {
  await setupDatabase();

  if (!fs.existsSync(SNAPSHOTS_FILE)) {
    console.log('No dex-snapshots.jsonl found, nothing to migrate.');
    return;
  }

  const lines = fs.readFileSync(SNAPSHOTS_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  console.log(`Found ${lines.length} snapshot(s) to migrate`);

  const client = await pool.connect();
  try {
    for (const line of lines) {
      const snapshot = JSON.parse(line);
      const date = snapshot.date; // "YYYY-MM-DD"

      // Check if we already imported this date
      const existing = await client.query(
        `SELECT s.id FROM snapshots s
         JOIN dex_pool_snapshots d ON d.snapshot_id = s.id
         WHERE s.snapshot_type = 'migration' AND DATE(s.taken_at) = $1
         LIMIT 1`,
        [date]
      );
      if (existing.rows.length > 0) {
        console.log(`  Skipping ${date} — already migrated`);
        continue;
      }

      await client.query('BEGIN');

      // Create snapshot with the original date as taken_at (midnight UTC)
      const snapResult = await client.query(
        `INSERT INTO snapshots (taken_at, snapshot_type, status)
         VALUES ($1, 'migration', 'complete') RETURNING id`,
        [`${date}T00:00:00Z`]
      );
      const snapshotId = snapResult.rows[0].id;

      // Insert pools (these old snapshots have volume data, treat as daily)
      for (const p of (snapshot.pools || [])) {
        await client.query(
          `INSERT INTO dex_pool_snapshots (
            snapshot_id, address, name, pool_type, chain, venue,
            tvl_usd, usdg_balance, yield_24h,
            volume_24h, fees_24h, volume_7d, fees_7d, volume_30d, fees_30d,
            price, token_a_symbol, token_a_balance, token_b_symbol, token_b_balance, fee_rate
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            snapshotId,
            p.address || '',
            p.name,
            p.type || 'stablecoin',
            p.chain || 'solana',
            p.venue || 'Orca',
            p.tvl || 0,
            p.usdgBalance || 0,
            p.yield24h || 0,
            p.volume24h || 0,
            p.fees24h || 0,
            null, null, // 7d not stored in old format
            null, null, // 30d not stored in old format
            p.price || 0,
            null, 0, // token symbols/balances not stored in old format
            null, 0,
            0
          ]
        );
      }

      // Insert lending
      for (const l of (snapshot.lending || [])) {
        await client.query(
          `INSERT INTO lending_snapshots (
            snapshot_id, name, chain, venue,
            deposit_tvl, total_borrows, total_liquidity, utilization,
            supply_apy, borrow_apy, loan_to_value, liquidation_threshold
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            snapshotId,
            l.name,
            l.chain || 'solana',
            l.venue || 'Kamino',
            l.depositTvl || 0,
            l.totalBorrows || 0,
            0, // totalLiquidity not stored in old format
            0, // utilization not stored in old format
            l.supplyAPY || 0,
            0, // borrowAPY not stored in old format
            0, 0
          ]
        );
      }

      await client.query('COMMIT');
      console.log(`  Migrated ${date}: ${(snapshot.pools || []).length} pools, ${(snapshot.lending || []).length} lending`);
    }

    console.log('Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
