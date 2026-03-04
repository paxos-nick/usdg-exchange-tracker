const express = require('express');
const queries = require('../db/queries');

const router = express.Router();

// GET /api/defi/pools - All DEX pool data from latest snapshot
router.get('/pools', async (req, res) => {
  try {
    const pools = await queries.getLatestDexPools();
    res.json({ timestamp: new Date().toISOString(), pools });
  } catch (err) {
    console.error('Error fetching DEX pools:', err.message);
    res.status(500).json({ error: 'Failed to fetch DEX pool data' });
  }
});

// GET /api/defi/vaults - Kamino vault metrics from latest snapshot
router.get('/vaults', async (req, res) => {
  try {
    const vaults = await queries.getLatestVaults();
    res.json({ timestamp: new Date().toISOString(), vaults });
  } catch (err) {
    console.error('Error fetching vaults:', err.message);
    res.status(500).json({ error: 'Failed to fetch vault data' });
  }
});

// GET /api/defi/lending - All lending reserve metrics from latest snapshot
router.get('/lending', async (req, res) => {
  try {
    const reserves = await queries.getLatestLending();
    const kaminoReserve = reserves.find(r => r.venue === 'Kamino') || reserves[0] || null;
    res.json({ timestamp: new Date().toISOString(), lending: kaminoReserve, reserves });
  } catch (err) {
    console.error('Error fetching lending data:', err.message);
    res.status(500).json({ error: 'Failed to fetch lending data' });
  }
});

// GET /api/defi/pool-history - Daily DEX snapshots from Postgres
router.get('/pool-history', async (req, res) => {
  try {
    const history = await queries.getPoolHistory();
    res.json({ history });
  } catch (err) {
    console.error('Error fetching pool history:', err.message);
    res.status(500).json({ error: 'Failed to fetch pool history' });
  }
});

// GET /api/defi/tvl-summary - Current TVL summary per chain from latest snapshot
router.get('/tvl-summary', async (req, res) => {
  try {
    const pools = await queries.getLatestDexPools();
    const lending = await queries.getLatestLending();

    const chains = {};

    pools.forEach(p => {
      const chain = p.chain || 'solana';
      if (!chains[chain]) chains[chain] = { dexTvl: 0, lendingTvl: 0, pools: [], lending: [] };
      chains[chain].dexTvl += p.usdgBalance || 0;
      chains[chain].pools.push({
        name: p.name,
        venue: p.venue,
        usdgBalance: p.usdgBalance,
        tvl: p.tvlUsd,
        volume24h: p.stats['24h'].volume,
        volume30d: p.stats['30d'].volume
      });
    });

    lending.forEach(l => {
      const chain = l.chain || 'solana';
      if (!chains[chain]) chains[chain] = { dexTvl: 0, lendingTvl: 0, pools: [], lending: [] };
      chains[chain].lendingTvl += l.depositTvl || 0;
      chains[chain].lending.push({
        name: l.name,
        venue: l.venue,
        depositTvl: l.depositTvl,
        totalBorrows: l.totalBorrows,
        supplyAPY: l.supplyAPY
      });
    });

    const summary = Object.entries(chains).map(([chain, data]) => ({
      chain,
      dexTvl: data.dexTvl,
      lendingTvl: data.lendingTvl,
      totalTvl: data.dexTvl + data.lendingTvl,
      pools: data.pools,
      lending: data.lending
    }));

    res.json({ timestamp: new Date().toISOString(), chains: summary });
  } catch (err) {
    console.error('Error fetching TVL summary:', err.message);
    res.status(500).json({ error: 'Failed to fetch TVL summary' });
  }
});

module.exports = router;
