const axios = require('axios');

const BASE_URL = 'https://api.kamino.finance';

const VAULTS = [
  {
    address: 'BqBsS4myH82S4yfqeKjXSF7yErWwSi5WTshSzKmHQgzw',
    name: 'Steakhouse USDG'
  },
  {
    address: 'BoZDRc1RDY9FzUZZ19WT4GbtTnnbXQ8AGSU5ByEw3ut5',
    name: 'Steakhouse High Yield USDG'
  },
  {
    address: 'DJbRxuBckoJpFVUNtWx94NghcthfGaRV5NRmEazUaddE',
    name: 'Elemental USDG Optimizer'
  }
];

const LENDING = {
  market: '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF',
  reserve: 'ESCkPWKHmgNE7Msf77n9yzqJd5kQVWWGy3o5Mgxhvavp',
  name: 'USDG (Main Market)',
  chain: 'solana'
};

async function getVaultMetrics(vaultAddress) {
  const response = await axios.get(`${BASE_URL}/kvaults/vaults/${vaultAddress}/metrics`);
  const m = response.data;

  return {
    address: vaultAddress,
    tvl: parseFloat(m.tokensInvestedUsd || 0) + parseFloat(m.tokensAvailableUsd || 0),
    tokensInvested: parseFloat(m.tokensInvested || 0),
    tokensAvailable: parseFloat(m.tokensAvailable || 0),
    sharePrice: parseFloat(m.sharePrice || 0),
    tokenPrice: parseFloat(m.tokenPrice || 0),
    holders: m.numberOfHolders || 0,
    apy: {
      current: parseFloat(m.apy || 0),
      '24h': parseFloat(m.apy24h || 0),
      '7d': parseFloat(m.apy7d || 0),
      '30d': parseFloat(m.apy30d || 0),
      '90d': parseFloat(m.apy90d || 0)
    },
    cumulativeInterestUsd: parseFloat(m.cumulativeInterestEarnedUsd || 0)
  };
}

async function getReserveMetrics(marketAddress, reserveAddress) {
  // Use a 3-day window ending today and take the latest entry
  // (today's data may not be available yet)
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
  const response = await axios.get(
    `${BASE_URL}/kamino-market/${marketAddress}/reserves/${reserveAddress}/metrics/history`,
    { params: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], frequency: 'day' } }
  );

  const data = response.data;
  let metrics;
  if (data.history && data.history.length > 0) {
    metrics = data.history[data.history.length - 1].metrics;
  } else {
    throw new Error('No reserve metrics available');
  }

  const depositTvl = parseFloat(metrics.depositTvl || 0);
  const totalBorrows = parseFloat(metrics.totalBorrows || 0);
  const totalLiquidity = parseFloat(metrics.totalLiquidity || 0);
  const utilization = depositTvl > 0 ? (totalBorrows / depositTvl) * 100 : 0;

  return {
    reserve: reserveAddress,
    symbol: metrics.symbol || 'USDG',
    depositTvl,
    totalBorrows,
    totalLiquidity,
    utilization,
    supplyAPY: metrics.supplyInterestAPY || 0,
    borrowAPY: metrics.borrowInterestAPY || 0,
    loanToValue: metrics.loanToValue || 0,
    liquidationThreshold: metrics.liquidationThreshold || 0
  };
}

async function getAllVaults() {
  const results = [];
  for (const vault of VAULTS) {
    try {
      const data = await getVaultMetrics(vault.address);
      results.push({ ...data, name: vault.name });
    } catch (err) {
      console.error(`Error fetching Kamino vault ${vault.name}:`, err.message);
    }
  }
  return results;
}

async function getLendingData() {
  try {
    const data = await getReserveMetrics(LENDING.market, LENDING.reserve);
    return { ...data, name: LENDING.name, chain: LENDING.chain, venue: 'Kamino' };
  } catch (err) {
    console.error(`Error fetching Kamino lending ${LENDING.name}:`, err.message);
    return null;
  }
}

module.exports = {
  VAULTS,
  LENDING,
  getVaultMetrics,
  getReserveMetrics,
  getAllVaults,
  getLendingData
};
