const cron = require('node-cron');
const pool = require('../db/pool');
const orcaService = require('../services/orca');
const curveService = require('../services/curve');
const kaminoService = require('../services/kamino');
const aaveService = require('../services/aave');
const paxgService = require('../services/paxg');
const { fetchUsdgDepth } = require('../services/depthFetcher');
const binanceService = require('../services/binance');
const { calculateDepthMetrics } = require('../utils/depthCalculator');

async function runSnapshot() {
  const isDailyRun = new Date().getUTCHours() === 0;
  const snapshotType = isDailyRun ? 'daily' : 'hourly';
  console.log(`[Snapshot] Starting ${snapshotType} snapshot...`);

  const client = await pool.connect();
  let snapshotId;

  try {
    await client.query('BEGIN');

    // Create snapshot record
    const snapResult = await client.query(
      `INSERT INTO snapshots (taken_at, snapshot_type, status)
       VALUES (NOW(), $1, 'in_progress') RETURNING id`,
      [snapshotType]
    );
    snapshotId = snapResult.rows[0].id;

    // Fetch all DeFi data in parallel
    const [orcaPools, curvePools, vaults, kaminoLending, aaveLending] = await Promise.all([
      orcaService.getAllPools().catch(err => { console.error('[Snapshot] Orca error:', err.message); return []; }),
      curveService.getAllPools().catch(err => { console.error('[Snapshot] Curve error:', err.message); return []; }),
      kaminoService.getAllVaults().catch(err => { console.error('[Snapshot] Kamino vaults error:', err.message); return []; }),
      kaminoService.getLendingData(),
      aaveService.getLendingData()
    ]);

    const allPools = [...orcaPools, ...curvePools];

    // Insert DEX pool snapshots
    for (const p of allPools) {
      await client.query(
        `INSERT INTO dex_pool_snapshots (
          snapshot_id, address, name, pool_type, chain, venue,
          tvl_usd, usdg_balance, yield_24h,
          volume_24h, fees_24h, volume_7d, fees_7d, volume_30d, fees_30d,
          price, token_a_symbol, token_a_balance, token_b_symbol, token_b_balance, fee_rate
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          snapshotId, p.address, p.name, p.type, p.chain, p.venue,
          p.tvlUsd, p.usdgBalance, p.stats['24h'].yieldOverTvl,
          // Volume/fees: only on daily snapshots
          isDailyRun ? p.stats['24h'].volume : null,
          isDailyRun ? p.stats['24h'].fees : null,
          isDailyRun ? p.stats['7d'].volume : null,
          isDailyRun ? p.stats['7d'].fees : null,
          isDailyRun ? p.stats['30d'].volume : null,
          isDailyRun ? p.stats['30d'].fees : null,
          p.price,
          p.tokenA.symbol, p.tokenA.balance,
          p.tokenB.symbol, p.tokenB.balance,
          p.feeRate || 0
        ]
      );
    }
    console.log(`[Snapshot] Inserted ${allPools.length} pool snapshots`);

    // Insert vault snapshots
    for (const v of vaults) {
      await client.query(
        `INSERT INTO vault_snapshots (
          snapshot_id, address, name,
          tvl_usd, share_price, token_price, holders,
          apy_current, apy_24h, apy_7d, apy_30d, apy_90d,
          cumulative_interest_usd
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          snapshotId, v.address, v.name,
          v.tvl, v.sharePrice, v.tokenPrice, v.holders,
          v.apy.current, v.apy['24h'], v.apy['7d'], v.apy['30d'], v.apy['90d'],
          v.cumulativeInterestUsd
        ]
      );
    }
    console.log(`[Snapshot] Inserted ${vaults.length} vault snapshots`);

    // Insert lending snapshots
    const lendingReserves = [kaminoLending, aaveLending].filter(Boolean);
    for (const l of lendingReserves) {
      await client.query(
        `INSERT INTO lending_snapshots (
          snapshot_id, name, chain, venue,
          deposit_tvl, total_borrows, total_liquidity, utilization,
          supply_apy, borrow_apy, loan_to_value, liquidation_threshold
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          snapshotId, l.name, l.chain, l.venue,
          l.depositTvl, l.totalBorrows, l.totalLiquidity, l.utilization,
          l.supplyAPY, l.borrowAPY, l.loanToValue, l.liquidationThreshold
        ]
      );
    }
    console.log(`[Snapshot] Inserted ${lendingReserves.length} lending snapshots`);

    // Mark complete
    await client.query(
      `UPDATE snapshots SET status = 'complete' WHERE id = $1`,
      [snapshotId]
    );

    await client.query('COMMIT');
    console.log(`[Snapshot] ${snapshotType} snapshot #${snapshotId} complete`);

    // On daily runs, append today's PAXG supply to history
    if (isDailyRun) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { blockNumber: refBlock, timestamp: refTs } = await paxgService.getCurrentBlockInfo();
        const { supply, blockNumber } = await paxgService.getSupplyForDate(today, refBlock, refTs);
        await pool.query(
          `INSERT INTO paxg_supply_history (supply_date, supply, block_number)
           VALUES ($1, $2, $3)
           ON CONFLICT (supply_date) DO UPDATE SET supply = EXCLUDED.supply, block_number = EXCLUDED.block_number`,
          [today, supply, blockNumber]
        );
        console.log(`[Snapshot] PAXG supply logged: ${supply.toFixed(2)} tokens (block ${blockNumber})`);
      } catch (err) {
        console.error('[Snapshot] Failed to log PAXG supply:', err.message);
      }
    }

    // Hourly depth snapshot — runs every hour for all runs (not just daily)
    try {
      const snappedAt = new Date();
      const depthRows = [];

      // USDG pairs across all CEX exchanges
      const usdgRows = await fetchUsdgDepth();
      for (const row of usdgRows) {
        depthRows.push({
          exchange: row.exchange,
          pair: row.pair,
          pairType: row.pairType,
          midPrice: row.midPrice,
          bestBid: row.bestBid,
          bestAsk: row.bestAsk,
          spreadBps: row.spreadBps,
          bpsLevels: row.bpsLevels,
          bidDepth: row.bidDepth,
          askDepth: row.askDepth
        });
      }

      // Binance PAXG + XAUT
      const GOLD_BPS = [2, 10, 25, 50, 100];
      for (const symbol of ['PAXGUSDT', 'XAUTUSDT']) {
        try {
          const ob = await binanceService.getOrderbook(symbol);
          const metrics = calculateDepthMetrics(ob.bids, ob.asks, GOLD_BPS);
          depthRows.push({
            exchange: 'Binance',
            pair: symbol,
            pairType: 'gold',
            midPrice: metrics.midPrice,
            bestBid: metrics.bestBid,
            bestAsk: metrics.bestAsk,
            spreadBps: metrics.spreadBps,
            bpsLevels: GOLD_BPS,
            bidDepth: metrics.bidDepth,
            askDepth: metrics.askDepth
          });
        } catch (err) {
          console.error(`[Snapshot] Binance ${symbol} depth error:`, err.message);
        }
      }

      for (const row of depthRows) {
        await pool.query(
          `INSERT INTO depth_snapshots
             (snapped_at, exchange, pair, pair_type, mid_price, best_bid, best_ask,
              spread_bps, bps_levels, bid_depth, ask_depth)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            snappedAt, row.exchange, row.pair, row.pairType,
            row.midPrice, row.bestBid, row.bestAsk, row.spreadBps,
            row.bpsLevels, JSON.stringify(row.bidDepth), JSON.stringify(row.askDepth)
          ]
        );
      }
      console.log(`[Snapshot] Depth snapshot complete: ${depthRows.length} pairs logged`);
    } catch (err) {
      console.error('[Snapshot] Depth snapshot failed:', err.message);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Snapshot] Failed:`, err.message);

    // Try to mark the snapshot as failed
    if (snapshotId) {
      try {
        await pool.query(
          `UPDATE snapshots SET status = 'failed', error_message = $1 WHERE id = $2`,
          [err.message, snapshotId]
        );
      } catch (_) {}
    }
  } finally {
    client.release();
  }
}

function startScheduler() {
  // Run at the top of every hour
  cron.schedule('0 * * * *', () => {
    runSnapshot().catch(err => console.error('[Snapshot] Unhandled error:', err));
  }, { timezone: 'UTC' });
  console.log('[Snapshot] Scheduler started. Runs every hour at :00 UTC');
}

module.exports = { runSnapshot, startScheduler };
