/**
 * Uniswap pools on Robinhood (Hood) chain — Chain ID 4663.
 * Data from GeckoTerminal free API (no auth required).
 * Pools 1 & 2 are Uniswap v4 (32-byte pool IDs); Pool 3 is Uniswap v3.
 */

const axios = require('axios');

const GECKO   = 'https://api.geckoterminal.com/api/v2';
const NETWORK = 'robinhood';

const POOLS = [
  {
    id:      '0xd18c9dc53c12b0db1bc259ff031cd1ac4330ff30a862383904263b6be006bb02',
    name:    'SyrupUSDG/USDG',
    type:    'stable',
    venue:   'Uniswap v4',
    feeRate: 0.0001, // 0.01% — typical for stablecoin pairs
  },
  {
    id:      '0xa5f23cae4e5c3388c5a8a6b08a83f53e56df8f1a63757e606b362994b68a2361',
    name:    'USDe/USDG',
    type:    'stable',
    venue:   'Uniswap v4',
    feeRate: 0.0001,
  },
  {
    id:      '0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca',
    name:    'ETH/USDG',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.0001, // 0.01% confirmed
  },
];

async function fetchOhlcvVolume(poolId, days) {
  try {
    const { data } = await axios.get(
      `${GECKO}/networks/${NETWORK}/pools/${poolId}/ohlcv/day`,
      { params: { limit: days }, headers: { Accept: 'application/json' }, timeout: 15000 }
    );
    const bars = data.data?.attributes?.ohlcv_list || [];
    return bars.reduce((sum, bar) => sum + (bar[5] || 0), 0); // index 5 = volume
  } catch {
    return null;
  }
}

async function getPoolData(pool) {
  const { data } = await axios.get(`${GECKO}/networks/${NETWORK}/pools/${pool.id}`, {
    params:  { include: 'base_token,quote_token' },
    headers: { Accept: 'application/json' },
    timeout: 15000,
  });

  const attrs = data.data?.attributes;
  if (!attrs) throw new Error(`No attributes returned for pool ${pool.id}`);

  // Resolve included token metadata
  const included   = data.included || [];
  const baseRelId  = data.data.relationships?.base_token?.data?.id;
  const quoteRelId = data.data.relationships?.quote_token?.data?.id;
  const baseTok    = included.find(i => i.id === baseRelId)?.attributes  || {};
  const quoteTok   = included.find(i => i.id === quoteRelId)?.attributes || {};

  const [symA, symB] = pool.name.split('/');
  const tvlUsd  = parseFloat(attrs.reserve_in_usd) || 0;
  const vol24h  = parseFloat(attrs.volume_usd?.h24) || 0;
  const fees24h = vol24h * pool.feeRate;

  // Fetch 7d and 30d volume from daily OHLCV bars (GeckoTerminal free tier supports this)
  const [vol7d, vol30d] = await Promise.all([
    fetchOhlcvVolume(pool.id, 7),
    fetchOhlcvVolume(pool.id, 30),
  ]);
  const fees7d  = vol7d  != null ? vol7d  * pool.feeRate : null;
  const fees30d = vol30d != null ? vol30d * pool.feeRate : null;

  return {
    address:     pool.id,
    name:        pool.name,
    type:        pool.type,
    chain:       'robinhood',
    venue:       pool.venue,
    tokenA:      { symbol: baseTok.symbol  || symA, balance: tvlUsd / 2, address: baseTok.address  || '' },
    tokenB:      { symbol: quoteTok.symbol || symB, balance: tvlUsd / 2, address: quoteTok.address || '' },
    price:       parseFloat(attrs.base_token_price_usd) || 0,
    tvlUsd,
    usdgBalance: tvlUsd / 2,
    feeRate:     pool.feeRate,
    stats: {
      '24h': { volume: vol24h, fees: fees24h, yieldOverTvl: tvlUsd > 0 ? fees24h / tvlUsd : 0 },
      '7d':  { volume: vol7d,  fees: fees7d,  yieldOverTvl: tvlUsd > 0 && fees7d  != null ? fees7d  / tvlUsd : null },
      '30d': { volume: vol30d, fees: fees30d, yieldOverTvl: tvlUsd > 0 && fees30d != null ? fees30d / tvlUsd : null },
    },
    baseApr: { daily: null, weekly: null },
  };
}

async function getAllPools() {
  const results = [];
  for (const pool of POOLS) {
    try {
      results.push(await getPoolData(pool));
    } catch (err) {
      console.error(`[UniswapHood] Error fetching ${pool.name}:`, err.message);
    }
  }
  return results;
}

module.exports = { POOLS, getPoolData, getAllPools };
