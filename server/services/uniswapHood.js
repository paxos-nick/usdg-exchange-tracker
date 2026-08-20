/**
 * Uniswap pools on Robinhood (Hood) chain — Chain ID 4663.
 * Data from GeckoTerminal free API (no auth required).
 * Pools 1 & 2 are Uniswap v4 (32-byte pool IDs); Pool 3 is Uniswap v3.
 */

const axios = require('axios');

const GECKO   = 'https://api.geckoterminal.com/api/v2';
const NETWORK = 'robinhood';

const POOLS = [
  // ── Uniswap v4 pools (32-byte pool IDs) ──────────────────────────────────
  {
    id:      '0xd18c9dc53c12b0db1bc259ff031cd1ac4330ff30a862383904263b6be006bb02',
    name:    'SyrupUSDG/USDG',
    type:    'stable',
    venue:   'Uniswap v4',
    feeRate: 0.0001, // 0.01% (1 bps)
  },
  {
    id:      '0xa5f23cae4e5c3388c5a8a6b08a83f53e56df8f1a63757e606b362994b68a2361',
    name:    'USDe/USDG',
    type:    'stable',
    venue:   'Uniswap v4',
    feeRate: 0.0001,
  },
  {
    id:      '0xcb6ffbcc84359535c2cc0a5688c0a76520ea6e0a4820fddd3ac8d7880e576370',
    name:    'SPCX/USDG',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0.01, // 1% (100 bps) — confirmed by user
  },
  // ── Uniswap v3 pools (20-byte addresses) ─────────────────────────────────
  {
    id:      '0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca',
    name:    'ETH/USDG',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.0001, // 0.01% (1 bps) — confirmed via fee() on-chain
  },
  {
    id:      '0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a',
    name:    'USDG/WETH',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.0005, // 0.05% (5 bps) — confirmed via fee() on-chain
  },
  {
    id:      '0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3',
    name:    'NVDA/USDG',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.0005, // 0.05% (5 bps) — confirmed via fee() on-chain
  },
  {
    id:      '0x02175608F1b5E6b5ed221cCFdC7Be197D111D915',
    name:    'USDG/USO',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.003, // 0.3% (30 bps) — confirmed via fee() on-chain
  },
  // ── Additional v4 pools ───────────────────────────────────────────────────
  {
    id:      '0xa92a3df27a00a276183ff7265fd8affa11df1fe8bb23ddfaf13f6c879a3f818b',
    name:    'CASHCAT/USDG',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0.00269, // 0.269% (26.9 bps) — from GeckoTerminal pool name
  },
  {
    id:      '0x77c25b9386d47de62e0155c393696e9f43f7e6d036c6ca52f66735ccbb8808a7',
    name:    'USDG/WETH 0.3%',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0.003, // 0.3% (30 bps) — from GeckoTerminal pool name
  },
  {
    id:      '0x4be9657ec9002e528f4f17a5c43edc525a07f888f7b180c2afbf75e096c4f38a',
    name:    'PONS/USDG',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0.003, // 0.3% (30 bps) — from GeckoTerminal pool name
  },
  {
    id:      '0xfcfae8fa0bd6da961bcf5d990f27690932deac4f093e99bf3e871691c6586593',
    name:    'USDG/WETH 0.05%',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0.0005, // 0.05% (5 bps) — from GeckoTerminal pool name
  },
];

async function fetchOhlcvBars(poolId, limit) {
  const { data } = await axios.get(
    `${GECKO}/networks/${NETWORK}/pools/${poolId}/ohlcv/day`,
    { params: { limit }, headers: { Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; exchange-tracker/1.0)' }, timeout: 20000 }
  );
  return data.data?.attributes?.ohlcv_list || []; // each bar: [timestamp, open, high, low, close, volume]
}

async function fetchOhlcvVolume(poolId, days) {
  try {
    const bars = await fetchOhlcvBars(poolId, days);
    return bars.reduce((sum, bar) => sum + (bar[5] || 0), 0);
  } catch {
    return null;
  }
}

// Returns daily history for all pools: [{date, volume, feeRevenue}]
// feeRevenue = sum of (pool_volume × pool_feeRate) — accurate since fee rates differ per pool
async function getVolumeHistory(days = 100) {
  const byDate = {};
  await Promise.all(POOLS.map(async pool => {
    try {
      const bars = await fetchOhlcvBars(pool.id, days);
      for (const bar of bars) {
        const date = new Date(bar[0] * 1000).toISOString().split('T')[0];
        const vol  = bar[5] || 0;
        if (!byDate[date]) byDate[date] = { volume: 0, feeRevenue: 0 };
        byDate[date].volume     += vol;
        byDate[date].feeRevenue += vol * pool.feeRate;
      }
    } catch (err) {
      console.error(`[UniswapHood] OHLCV error for ${pool.name}:`, err.message);
    }
  }));
  return Object.entries(byDate)
    .map(([date, { volume, feeRevenue }]) => ({ date, volume, feeRevenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  const tvlUsd = parseFloat(attrs.reserve_in_usd) || 0;

  // Use OHLCV for all volume windows — pool endpoint's volume_usd.h24 returns 0 inconsistently
  const [vol24h, vol7d, vol30d] = await Promise.all([
    fetchOhlcvVolume(pool.id, 1),   // single bar = yesterday's full calendar-day volume
    fetchOhlcvVolume(pool.id, 7),
    fetchOhlcvVolume(pool.id, 30),
  ]);
  const fees24h = (vol24h || 0) * pool.feeRate;
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
      '24h': { volume: vol24h ?? 0, fees: fees24h, yieldOverTvl: tvlUsd > 0 ? fees24h / tvlUsd : 0 },
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

module.exports = { POOLS, getPoolData, getAllPools, getVolumeHistory };
