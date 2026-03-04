const pool = require('./pool');

// Get the most recent complete snapshot ID
async function getLatestSnapshotId() {
  const result = await pool.query(
    `SELECT id FROM snapshots WHERE status = 'complete' ORDER BY taken_at DESC LIMIT 1`
  );
  return result.rows[0]?.id || null;
}

// Get the most recent daily (with volume) snapshot ID
async function getLatestDailySnapshotId() {
  const result = await pool.query(
    `SELECT id FROM snapshots
     WHERE status = 'complete' AND snapshot_type IN ('daily', 'migration')
     ORDER BY taken_at DESC LIMIT 1`
  );
  return result.rows[0]?.id || null;
}

// Get latest DEX pool data (TVL from most recent, volume from most recent daily)
async function getLatestDexPools() {
  const latestId = await getLatestSnapshotId();
  const dailyId = await getLatestDailySnapshotId();
  if (!latestId) return [];

  // Get hourly data (TVL, balances, yield)
  const hourlyResult = await pool.query(
    `SELECT * FROM dex_pool_snapshots WHERE snapshot_id = $1 ORDER BY chain, name`,
    [latestId]
  );

  // If we have daily volume data, merge it in
  let volumeByAddress = {};
  if (dailyId) {
    const dailyResult = await pool.query(
      `SELECT address, volume_24h, fees_24h, volume_7d, fees_7d, volume_30d, fees_30d
       FROM dex_pool_snapshots WHERE snapshot_id = $1`,
      [dailyId]
    );
    for (const row of dailyResult.rows) {
      volumeByAddress[row.address] = row;
    }
  }

  return hourlyResult.rows.map(row => {
    const vol = volumeByAddress[row.address] || {};
    return {
      address: row.address,
      name: row.name,
      type: row.pool_type,
      chain: row.chain,
      venue: row.venue,
      tvlUsd: parseFloat(row.tvl_usd) || 0,
      usdgBalance: parseFloat(row.usdg_balance) || 0,
      feeRate: parseFloat(row.fee_rate) || 0,
      price: parseFloat(row.price) || 0,
      tokenA: {
        symbol: row.token_a_symbol || '',
        balance: parseFloat(row.token_a_balance) || 0
      },
      tokenB: {
        symbol: row.token_b_symbol || '',
        balance: parseFloat(row.token_b_balance) || 0
      },
      stats: {
        '24h': {
          volume: parseFloat(vol.volume_24h || row.volume_24h) || 0,
          fees: parseFloat(vol.fees_24h || row.fees_24h) || 0,
          yieldOverTvl: parseFloat(row.yield_24h) || 0
        },
        '7d': {
          volume: parseFloat(vol.volume_7d || row.volume_7d) || 0,
          fees: parseFloat(vol.fees_7d || row.fees_7d) || 0,
          yieldOverTvl: 0
        },
        '30d': {
          volume: parseFloat(vol.volume_30d || row.volume_30d) || 0,
          fees: parseFloat(vol.fees_30d || row.fees_30d) || 0,
          yieldOverTvl: 0
        }
      }
    };
  });
}

// Get latest vault data
async function getLatestVaults() {
  const latestId = await getLatestSnapshotId();
  if (!latestId) return [];

  const result = await pool.query(
    `SELECT * FROM vault_snapshots WHERE snapshot_id = $1`,
    [latestId]
  );

  return result.rows.map(row => ({
    address: row.address,
    name: row.name,
    tvl: parseFloat(row.tvl_usd) || 0,
    sharePrice: parseFloat(row.share_price) || 0,
    tokenPrice: parseFloat(row.token_price) || 0,
    holders: row.holders || 0,
    apy: {
      current: parseFloat(row.apy_current) || 0,
      '24h': parseFloat(row.apy_24h) || 0,
      '7d': parseFloat(row.apy_7d) || 0,
      '30d': parseFloat(row.apy_30d) || 0,
      '90d': parseFloat(row.apy_90d) || 0
    },
    cumulativeInterestUsd: parseFloat(row.cumulative_interest_usd) || 0
  }));
}

// Get latest lending data
async function getLatestLending() {
  const latestId = await getLatestSnapshotId();
  if (!latestId) return [];

  const result = await pool.query(
    `SELECT * FROM lending_snapshots WHERE snapshot_id = $1`,
    [latestId]
  );

  return result.rows.map(row => ({
    name: row.name,
    chain: row.chain,
    venue: row.venue,
    depositTvl: parseFloat(row.deposit_tvl) || 0,
    totalBorrows: parseFloat(row.total_borrows) || 0,
    totalLiquidity: parseFloat(row.total_liquidity) || 0,
    utilization: parseFloat(row.utilization) || 0,
    supplyAPY: parseFloat(row.supply_apy) || 0,
    borrowAPY: parseFloat(row.borrow_apy) || 0,
    loanToValue: parseFloat(row.loan_to_value) || 0,
    liquidationThreshold: parseFloat(row.liquidation_threshold) || 0
  }));
}

// Get pool history — one entry per snapshot date with pools + lending arrays
async function getPoolHistory() {
  // Get all complete snapshots that have pool data, pick one per day (prefer daily over hourly)
  const result = await pool.query(`
    WITH ranked AS (
      SELECT s.id, DATE(s.taken_at AT TIME ZONE 'UTC') as snap_date, s.snapshot_type,
             ROW_NUMBER() OVER (
               PARTITION BY DATE(s.taken_at AT TIME ZONE 'UTC')
               ORDER BY CASE WHEN s.snapshot_type IN ('daily','migration') THEN 0 ELSE 1 END, s.taken_at DESC
             ) as rn
      FROM snapshots s
      WHERE s.status = 'complete'
        AND EXISTS (SELECT 1 FROM dex_pool_snapshots d WHERE d.snapshot_id = s.id)
    )
    SELECT id, snap_date FROM ranked WHERE rn = 1 ORDER BY snap_date ASC
  `);

  const history = [];
  for (const snap of result.rows) {
    const [poolRows, lendingRows] = await Promise.all([
      pool.query(`SELECT * FROM dex_pool_snapshots WHERE snapshot_id = $1`, [snap.id]),
      pool.query(`SELECT * FROM lending_snapshots WHERE snapshot_id = $1`, [snap.id])
    ]);

    history.push({
      date: snap.snap_date.toISOString().split('T')[0],
      pools: poolRows.rows.map(r => ({
        address: r.address,
        name: r.name,
        type: r.pool_type,
        chain: r.chain,
        venue: r.venue,
        volume24h: parseFloat(r.volume_24h) || 0,
        fees24h: parseFloat(r.fees_24h) || 0,
        tvl: parseFloat(r.tvl_usd) || 0,
        usdgBalance: parseFloat(r.usdg_balance) || 0,
        yield24h: parseFloat(r.yield_24h) || 0,
        price: parseFloat(r.price) || 0
      })),
      lending: lendingRows.rows.map(r => ({
        name: r.name,
        chain: r.chain,
        venue: r.venue,
        depositTvl: parseFloat(r.deposit_tvl) || 0,
        totalBorrows: parseFloat(r.total_borrows) || 0,
        supplyAPY: parseFloat(r.supply_apy) || 0
      }))
    });
  }

  return history;
}

module.exports = {
  getLatestSnapshotId,
  getLatestDailySnapshotId,
  getLatestDexPools,
  getLatestVaults,
  getLatestLending,
  getPoolHistory
};
