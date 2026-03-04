const axios = require('axios');

const BASE_URL = 'https://prices.curve.finance/v1';

const POOLS = [
  {
    address: '0xc061caa073f3d95F80f8e5428d32D2d76F5e1622',
    name: 'USDG/USDC',
    type: 'stablecoin',
    chain: 'ethereum',
    usdgIndex: 0  // USDG is coin[0] in this pool
  }
];

async function getPoolData(pool) {
  const response = await axios.get(
    `${BASE_URL}/pools/ethereum/${pool.address}`
  );
  const data = response.data;

  const coins = data.coins || [];
  const balances = data.balances || [];
  const usdgCoin = coins[pool.usdgIndex] || {};
  const otherIndex = pool.usdgIndex === 0 ? 1 : 0;
  const otherCoin = coins[otherIndex] || {};

  // Balances are already parsed (not raw) from the API
  const usdgBalance = balances[pool.usdgIndex] || 0;
  const otherBalance = balances[otherIndex] || 0;

  const tvlUsd = data.tvl_usd || 0;
  const volume24h = data.trading_volume_24h || 0;
  const fees24h = data.trading_fee_24h || 0;

  // Fetch 7d and 30d volume from history endpoint
  const now = Math.floor(Date.now() / 1000);
  let vol7d = { volume: 0, fees: 0 };
  let vol30d = { volume: 0, fees: 0 };
  try {
    const [res7, res30] = await Promise.all([
      axios.get(`${BASE_URL}/volume/ethereum/${pool.address}`, {
        params: { main_token: usdgCoin.address, reference_token: otherCoin.address, start: now - 7 * 86400, end: now }
      }),
      axios.get(`${BASE_URL}/volume/ethereum/${pool.address}`, {
        params: { main_token: usdgCoin.address, reference_token: otherCoin.address, start: now - 30 * 86400, end: now }
      })
    ]);
    const entries7 = res7.data?.data || [];
    const entries30 = res30.data?.data || [];
    vol7d = { volume: entries7.reduce((s, e) => s + (e.volume || 0), 0), fees: entries7.reduce((s, e) => s + (e.fees || 0), 0) };
    vol30d = { volume: entries30.reduce((s, e) => s + (e.volume || 0), 0), fees: entries30.reduce((s, e) => s + (e.fees || 0), 0) };
  } catch (err) {
    console.error('Error fetching Curve volume history:', err.message);
  }

  return {
    address: pool.address,
    name: pool.name,
    type: pool.type,
    chain: pool.chain,
    venue: 'Curve',
    tokenA: {
      symbol: usdgCoin.symbol || 'USDG',
      balance: usdgBalance,
      address: usdgCoin.address
    },
    tokenB: {
      symbol: otherCoin.symbol || 'USDC',
      balance: otherBalance,
      address: otherCoin.address
    },
    price: tvlUsd > 0 && usdgBalance > 0 ? 1.0 : 0,
    tvlUsd,
    usdgBalance,
    feeRate: 0,
    stats: {
      '24h': {
        volume: volume24h,
        fees: fees24h,
        yieldOverTvl: tvlUsd > 0 ? fees24h / tvlUsd : 0
      },
      '7d': {
        volume: vol7d.volume,
        fees: vol7d.fees,
        yieldOverTvl: tvlUsd > 0 ? vol7d.fees / tvlUsd : 0
      },
      '30d': {
        volume: vol30d.volume,
        fees: vol30d.fees,
        yieldOverTvl: tvlUsd > 0 ? vol30d.fees / tvlUsd : 0
      }
    },
    baseApr: {
      daily: data.base_daily_apr || 0,
      weekly: data.base_weekly_apr || 0
    }
  };
}

async function getAllPools() {
  const results = [];
  for (const pool of POOLS) {
    try {
      const data = await getPoolData(pool);
      results.push(data);
    } catch (err) {
      console.error(`Error fetching Curve pool ${pool.name}:`, err.message);
    }
  }
  return results;
}

module.exports = {
  POOLS,
  getPoolData,
  getAllPools
};
