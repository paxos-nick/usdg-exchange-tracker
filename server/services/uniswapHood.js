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
  // ── Additional pools added 2026-09 ────────────────────────────────────────
  {
    id:      '0xfe2a80bb5618fd14984b92ca6d45bf5ba67443ddb1435e28b2e48df2fc1526cd',
    name:    'SPY/USDG',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0.003, // 0.3% (30 bps) — from GeckoTerminal pool name
  },
  {
    id:      '0xfAb520051f96F4D2a32c22B6a3dD7fFfdf231bFe',
    name:    'SGOV/USDG',
    type:    'stable',
    venue:   'Uniswap v3',
    feeRate: 0.003, // 0.3% (30 bps) — from GeckoTerminal pool name
  },
  {
    id:      '0x7A6A053eCCf1446A2633E05aA6D40D09381997ec',
    name:    'GLD/USDG',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.003, // 0.3% (30 bps) — from GeckoTerminal pool name
  },
  {
    id:      '0x7A192E71564ec66eE0763e328a3Ac274942dE4e1',
    name:    'PONS/USDG 1%',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.01, // 1% (100 bps) — from GeckoTerminal pool name; distinct fee tier from existing PONS/USDG (0.3%)
  },
  {
    id:      '0xc61284332117c3FB23A2A56cceFFD07F7aF60029',
    name:    'SPCX/USDG 0.05%',
    type:    'volatile',
    venue:   'Uniswap v3',
    feeRate: 0.0005, // 0.05% (5 bps) — from GeckoTerminal pool name; distinct fee tier from existing SPCX/USDG (1%)
  },
  {
    id:      '0xf399bd1544377680d48c62fd85c2105b869e55906c4189cc5ab3b4e83446928c',
    name:    'U/USDG',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0.00008, // 0.008% (0.8 bps) — from GeckoTerminal pool name
  },
  {
    id:      '0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551',
    name:    'WETH/USDG (dynamic)',
    type:    'volatile',
    venue:   'Uniswap v4',
    // Dynamic-fee hook pool (fee flag 0x800000 on-chain, hook 0x06a88987...) —
    // no fixed bps exists; approximated at 0.05% to match the other low-fee
    // WETH/USDG v4 pool. Revisit if a way to read the live hook fee appears.
    feeRate: 0.0005,
  },
  {
    id:      '0xd986decace9ec31ff37f5e0b28155fd5f83e604d8ea995163541cbd119c24614',
    name:    'WETH/USDG (0%)',
    type:    'volatile',
    venue:   'Uniswap v4',
    feeRate: 0, // confirmed 0% static fee via on-chain Initialize event; TVL is negligible (~$4.8K)
  },
];

// GeckoTerminal's free tier allows ~30 calls/min and rate-limits by IP, so every call goes
// through one serialized queue with spacing, and 429s back off and retry.
const MIN_GAP_MS = 2200;
let queueTail = Promise.resolve();
let lastCallAt = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function geckoGet(path, params) {
  const run = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = lastCallAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      try {
        const { data } = await axios.get(`${GECKO}${path}`, {
          params, timeout: 20000,
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; exchange-tracker/1.0)' },
        });
        return data;
      } catch (err) {
        if (err.response?.status === 429 && attempt < 3) { await sleep(15000 * (attempt + 1)); continue; }
        throw err;
      }
    }
  };
  const result = queueTail.then(run, run);
  queueTail = result.catch(() => {});
  return result;
}

// Daily bars for every pool, newest first, shared by the pool snapshot and the volume history
// (cached so one hourly run costs one call per pool).
const BARS_TTL_MS = 30 * 60 * 1000;
let barsCache = { at: 0, days: 0, byPool: null };

async function fetchAllBars(days = 100) {
  if (barsCache.byPool && barsCache.days >= days && Date.now() - barsCache.at < BARS_TTL_MS) return barsCache.byPool;
  const byPool = {};
  for (const pool of POOLS) {
    try {
      const data = await geckoGet(`/networks/${NETWORK}/pools/${pool.id}/ohlcv/day`, { limit: days });
      const bars = (data.data?.attributes?.ohlcv_list || []).slice().sort((a, b) => b[0] - a[0]);
      byPool[pool.id] = bars; // each bar: [timestamp, open, high, low, close, volume]
    } catch (err) {
      console.error(`[UniswapHood] OHLCV error for ${pool.name}:`, err.message);
      byPool[pool.id] = null;
    }
  }
  if (Object.values(byPool).some(b => b)) barsCache = { at: Date.now(), days, byPool };
  return byPool;
}

// Returns daily history for all pools: [{date, volume, feeRevenue}] with `.complete` = every
// pool fetched. feeRevenue = sum of (pool_volume × pool_feeRate) since fee rates differ per pool.
async function getVolumeHistory(days = 100) {
  const byPool = await fetchAllBars(days);
  const byDate = {};
  for (const pool of POOLS) {
    for (const bar of (byPool[pool.id] || [])) {
      const date = new Date(bar[0] * 1000).toISOString().split('T')[0];
      const vol  = bar[5] || 0;
      if (!byDate[date]) byDate[date] = { volume: 0, feeRevenue: 0 };
      byDate[date].volume     += vol;
      byDate[date].feeRevenue += vol * pool.feeRate;
    }
  }
  const rows = Object.entries(byDate)
    .map(([date, { volume, feeRevenue }]) => ({ date, volume, feeRevenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
  rows.complete = POOLS.every(p => byPool[p.id]);
  return rows;
}

async function fetchPoolMeta() {
  const out = {};
  for (let i = 0; i < POOLS.length; i += 30) {
    const ids = POOLS.slice(i, i + 30).map(p => p.id).join(',');
    try {
      const data = await geckoGet(`/networks/${NETWORK}/pools/multi/${ids}`);
      for (const item of (data.data || [])) out[item.id.replace(`${NETWORK}_`, '').toLowerCase()] = item.attributes;
    } catch (err) {
      console.error('[UniswapHood] pool metadata error:', err.message);
    }
  }
  return out;
}

function buildPoolData(pool, attrs, bars) {
  const [symA, symB] = pool.name.split('/');
  const tvlUsd = parseFloat(attrs?.reserve_in_usd) || 0;
  const sum = n => (bars || []).slice(0, n).reduce((t, b) => t + (b[5] || 0), 0);
  // bars are newest-first: 1 bar = latest calendar day, 7/30 = trailing windows
  const vol24h = bars ? sum(1) : 0;
  const vol7d  = bars ? sum(7) : null;
  const vol30d = bars ? sum(30) : null;
  const fees24h = vol24h * pool.feeRate;
  const fees7d  = vol7d  != null ? vol7d  * pool.feeRate : null;
  const fees30d = vol30d != null ? vol30d * pool.feeRate : null;
  return {
    address:     pool.id,
    name:        pool.name,
    type:        pool.type,
    chain:       'robinhood',
    venue:       pool.venue,
    tokenA:      { symbol: symA, balance: tvlUsd / 2, address: '' },
    tokenB:      { symbol: symB, balance: tvlUsd / 2, address: '' },
    price:       parseFloat(attrs?.base_token_price_usd) || 0,
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

// All pools in one pass: 1 metadata call + 1 bars call per pool, throttled. A pool whose
// metadata or bars are missing is skipped rather than recorded as $0 TVL / $0 volume.
async function getAllPools() {
  const [meta, byPool] = await Promise.all([fetchPoolMeta(), fetchAllBars(100)]);
  const results = [];
  for (const pool of POOLS) {
    const attrs = meta[pool.id.toLowerCase()];
    const bars  = byPool[pool.id];
    if (!attrs || !bars) {
      console.error(`[UniswapHood] Skipping ${pool.name}: ${!attrs ? 'no metadata' : 'no OHLCV bars'}`);
      continue;
    }
    results.push(buildPoolData(pool, attrs, bars));
  }
  return results;
}

module.exports = { POOLS, getAllPools, getVolumeHistory };
