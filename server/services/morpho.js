const axios = require('axios');

const GRAPHQL_URL = 'https://blue-api.morpho.org/graphql';

// The 5 Morpho Blue markets on Robinhood Chain (Hood) that source liquidity
// from the Steakhouse USDG vault (0xBeEff033...). Identified by their
// globally-unique market keys from the Morpho app URLs.
const MARKET_KEYS = [
  '0xc845da65a020ddca5f132efa8fea79676d8edfdea504226a4c01e7a9e34cddd6', // USDG/USDe
  '0x919a9b6b94dae7c86620eaf7a08e597aae8a4c3a9e9c7671771fbaf62b6b61c7', // USDG/syrupUSDG
  '0x1efd13a2d1dc66a2466e7c25820537028e604791f00454d9c686fdfbf70f404d', // USDG/mGLO
  '0x0309c02dabf0be02682af1a2bde9a457f4df0f0b6bc889cde3f948e5315e4114', // USDG/spUSDG
  '0x127353ba63e08f74d8e9ce8a1c2b41b5f89c7167135b1c09fbed34a71b4cb06b', // USDG/WETH
];

const CURRENT_QUERY = `{
  markets(where: { uniqueKey_in: ${JSON.stringify(MARKET_KEYS)} }, first: 10) {
    items {
      marketId
      loanAsset { symbol decimals }
      collateralAsset { symbol }
      state { borrowApy borrowAssets supplyAssets utilization }
    }
  }
}`;

const HISTORY_QUERY = `{
  markets(where: { uniqueKey_in: ${JSON.stringify(MARKET_KEYS)} }, first: 10) {
    items {
      marketId
      loanAsset { symbol decimals }
      collateralAsset { symbol }
      historicalState {
        borrowApy { x y }
        borrowAssets { x y }
      }
    }
  }
}`;

async function query(gql) {
  const r = await axios.post(GRAPHQL_URL, { query: gql }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  if (r.data.errors) throw new Error(r.data.errors[0].message);
  return r.data.data;
}

// Aggregate current state across all 5 markets
async function getLendingData() {
  const data = await query(CURRENT_QUERY);
  const items = data?.markets?.items || [];

  let totalBorrows = 0, weightedApySum = 0, totalSupply = 0;
  const breakdown = [];

  for (const m of items) {
    const dec = m.loanAsset?.decimals || 6;
    const borrow = Number(m.state?.borrowAssets || 0) / Math.pow(10, dec);
    const supply = Number(m.state?.supplyAssets || 0) / Math.pow(10, dec);
    const apy = m.state?.borrowApy || 0;
    totalBorrows += borrow;
    weightedApySum += borrow * apy;
    totalSupply += supply;
    breakdown.push({
      market: m.loanAsset?.symbol + '/' + m.collateralAsset?.symbol,
      borrow, apy, dailyInterest: borrow * apy / 365,
    });
  }

  const borrowApy = totalBorrows > 0 ? weightedApySum / totalBorrows : 0;
  const dailyInterest = totalBorrows * borrowApy / 365;
  const utilization = totalSupply > 0 ? totalBorrows / totalSupply : 0;

  return {
    name: 'USDG (Steakhouse Vault)',
    chain: 'robinhood',
    venue: 'Morpho',
    totalBorrows,
    totalSupply,
    borrowApy,    // decimal e.g. 0.042
    dailyInterest,
    utilization,
    breakdown,
  };
}

// Build a daily history map from the historicalState time series.
// Returns array of { date, totalBorrows, borrowApy, dailyInterest }.
async function getDailyHistory() {
  const data = await query(HISTORY_QUERY);
  const items = data?.markets?.items || [];

  // For each market, take the latest data point per calendar date
  const byDate = {};
  for (const m of items) {
    const dec = m.loanAsset?.decimals || 6;
    const apyPts = m.historicalState?.borrowApy || [];
    const assetPts = m.historicalState?.borrowAssets || [];

    const assetByTs = {};
    for (const p of assetPts) assetByTs[p.x] = Number(p.y) / Math.pow(10, dec);

    const latestPerDate = {};
    for (const p of apyPts) {
      const date = new Date(p.x * 1000).toISOString().split('T')[0];
      if (!latestPerDate[date] || p.x > latestPerDate[date].x)
        latestPerDate[date] = { x: p.x, apy: p.y, borrow: assetByTs[p.x] || 0 };
    }

    for (const [date, v] of Object.entries(latestPerDate)) {
      if (!byDate[date]) byDate[date] = { totalBorrows: 0, weightedApySum: 0, dailyInterest: 0 };
      byDate[date].totalBorrows += v.borrow;
      byDate[date].weightedApySum += v.borrow * v.apy;
      byDate[date].dailyInterest += v.borrow * v.apy / 365;
    }
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, r]) => ({
      date,
      totalBorrows: r.totalBorrows,
      borrowApy: r.totalBorrows > 0 ? r.weightedApySum / r.totalBorrows : 0,
      dailyInterest: r.dailyInterest,
    }));
}

module.exports = { getLendingData, getDailyHistory, MARKET_KEYS };
