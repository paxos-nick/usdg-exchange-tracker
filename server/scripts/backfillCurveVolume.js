/**
 * Backfill historical Curve USDG/USDC pool volume from prices.curve.finance API.
 * Paginates through 8-hour interval data and aggregates to daily volume.
 * Inserts into dex_pool_snapshots tied to a 'migration' snapshot record.
 *
 * Safe to re-run — skips dates already in the database.
 *
 * Usage: node scripts/backfillCurveVolume.js
 */

const axios = require('axios');
const pool = require('../db/pool');

const CURVE_PRICES_URL = 'https://prices.curve.finance/v1';
const POOL_ADDRESS = '0xc061caa073f3d95F80f8e5428d32D2d76F5e1622';
const USDG_ADDRESS = '0xe343167631d89B6Ffc58B88d6b7fB0228795491D';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const POOL_START_TS = Math.floor(new Date('2025-09-09').getTime() / 1000);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAllVolumeEntries() {
  console.log('[Backfill] Fetching Curve volume history from API...');
  let cursor = POOL_START_TS;
  const now = Math.floor(Date.now() / 1000);
  const allEntries = [];

  while (cursor < now) {
    const response = await axios.get(`${CURVE_PRICES_URL}/volume/ethereum/${POOL_ADDRESS}`, {
      params: {
        main_token: USDG_ADDRESS,
        reference_token: USDC_ADDRESS,
        start: cursor,
        end: now
      }
    });

    const entries = response.data?.data || [];
    if (!entries.length) break;

    allEntries.push(...entries);

    const lastTs = entries[entries.length - 1].timestamp;
    if (lastTs <= cursor) break;
    cursor = lastTs + 1;

    await delay(300);
  }

  console.log(`[Backfill] Fetched ${allEntries.length} 8-hour entries`);
  return allEntries;
}

function aggregateToDaily(entries) {
  const byDay = {};
  for (const e of entries) {
    const day = new Date(e.timestamp * 1000).toISOString().split('T')[0];
    if (!byDay[day]) byDay[day] = { volume: 0, fees: 0 };
    byDay[day].volume += e.volume || 0;
    byDay[day].fees += e.fees || 0;
  }
  return Object.entries(byDay)
    .map(([date, d]) => ({ date, volume: d.volume, fees: d.fees }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function run() {
  const entries = await fetchAllVolumeEntries();
  const daily = aggregateToDaily(entries);
  console.log(`[Backfill] ${daily.length} days of data (${daily[0]?.date} → ${daily[daily.length - 1]?.date})`);

  // Find dates already in DB for this pool to skip them
  const existing = await pool.query(
    `SELECT DISTINCT DATE(s.taken_at)::text AS snap_date
     FROM dex_pool_snapshots d
     JOIN snapshots s ON s.id = d.snapshot_id
     WHERE d.address = $1 AND d.volume_24h IS NOT NULL`,
    [POOL_ADDRESS.toLowerCase()]
  );
  const existingDates = new Set(existing.rows.map(r => r.snap_date.split('T')[0]));
  const todo = daily.filter(d => !existingDates.has(d.date));
  console.log(`[Backfill] ${existingDates.size} dates already in DB, ${todo.length} to insert`);

  if (todo.length === 0) {
    console.log('[Backfill] Nothing to do.');
    await pool.end();
    return;
  }

  // Fetch current pool state once for TVL/balances (used for all historical rows)
  console.log('[Backfill] Fetching current pool state for metadata...');
  const poolResp = await axios.get(`${CURVE_PRICES_URL}/pools/ethereum/${POOL_ADDRESS}`);
  const poolData = poolResp.data;
  const coins = poolData.coins || [];
  const balances = poolData.balances || [];
  const tvlUsd = poolData.tvl_usd || 0;
  const usdgBalance = balances[0] || 0;
  const otherBalance = balances[1] || 0;

  let inserted = 0;
  let errors = 0;

  for (const day of todo) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create a migration-type snapshot for this date
      const snapResult = await client.query(
        `INSERT INTO snapshots (taken_at, snapshot_type, status)
         VALUES ($1::date + interval '23 hours 59 minutes', 'migration', 'complete')
         RETURNING id`,
        [day.date]
      );
      const snapshotId = snapResult.rows[0].id;

      await client.query(
        `INSERT INTO dex_pool_snapshots (
          snapshot_id, address, name, pool_type, chain, venue,
          tvl_usd, usdg_balance, yield_24h,
          volume_24h, fees_24h, volume_7d, fees_7d, volume_30d, fees_30d,
          price, token_a_symbol, token_a_balance, token_b_symbol, token_b_balance, fee_rate
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          snapshotId,
          POOL_ADDRESS.toLowerCase(),
          'USDG/USDC',
          'stablecoin',
          'ethereum',
          'Curve',
          tvlUsd,
          usdgBalance,
          0, // yield_24h unknown for historical
          day.volume,
          day.fees,
          null, // 7d/30d not backfilled (would need rolling calc)
          null,
          null,
          null,
          1.0,
          coins[0]?.symbol || 'USDG',
          usdgBalance,
          coins[1]?.symbol || 'USDC',
          otherBalance,
          0.0001 // Curve stable pool fee
        ]
      );

      await client.query('COMMIT');
      inserted++;

      if (inserted % 50 === 0 || inserted === todo.length) {
        console.log(`[Backfill] ${inserted}/${todo.length} — ${day.date}: $${Math.round(day.volume).toLocaleString()} volume`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      errors++;
      console.error(`[Backfill] Error for ${day.date}:`, err.message);
    } finally {
      client.release();
    }
  }

  console.log(`[Backfill] Done. ${inserted} inserted, ${errors} errors.`);
  await pool.end();
}

run().catch(err => {
  console.error('[Backfill] Fatal:', err);
  process.exit(1);
});
