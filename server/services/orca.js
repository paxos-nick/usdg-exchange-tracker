const axios = require('axios');

const BASE_URL = 'https://api.orca.so/v2/solana';

const USDG_MINT = '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH';

const POOLS = [
  {
    address: '9RqDTfwCx2SgxsvKpspQHc38HUo3B6hRd3oR9JR966Ps',
    name: 'USDG/USDC',
    type: 'stablecoin',
    chain: 'solana'
  },
  {
    address: '5KqohoeGjTjyHAFJJywK4J7fkFuK82PfMyuseGgLKZu2',
    name: 'SOL/USDG',
    type: 'risk',
    chain: 'solana'
  },
  {
    address: 'EbGwM46wxy7EYuwhYrLN1UQPpG15FoEamQvzdMPJLwP6',
    name: 'USDG/xBTC',
    type: 'risk',
    chain: 'solana'
  },
  {
    address: '9goWMLg5ZxayhTinjtfNQLCZg2VBzdwERqHqP5tYSP9Z',
    name: 'USDG/syrupUSDC',
    type: 'stablecoin',
    chain: 'solana'
  }
];

async function getPoolData(poolAddress) {
  const response = await axios.get(`${BASE_URL}/pools/${poolAddress}`);
  const pool = response.data.data;

  const decimalsA = pool.tokenA.decimals;
  const decimalsB = pool.tokenB.decimals;

  const balanceA = parseFloat(pool.tokenBalanceA) / Math.pow(10, decimalsA);
  const balanceB = parseFloat(pool.tokenBalanceB) / Math.pow(10, decimalsB);

  // Identify USDG side and compute its USD value
  const isAUsdg = pool.tokenA.address === USDG_MINT;
  const usdgBalance = isAUsdg ? balanceA : balanceB;

  return {
    address: pool.address,
    tokenA: {
      symbol: pool.tokenA.symbol,
      balance: balanceA,
      mint: pool.tokenA.address
    },
    tokenB: {
      symbol: pool.tokenB.symbol,
      balance: balanceB,
      mint: pool.tokenB.address
    },
    price: parseFloat(pool.price),
    tvlUsd: parseFloat(pool.tvlUsdc),
    usdgBalance,
    feeRate: pool.feeRate / 1e6, // feeRate is in millionths
    stats: {
      '24h': {
        volume: parseFloat(pool.stats['24h']?.volume || 0),
        fees: parseFloat(pool.stats['24h']?.fees || 0),
        yieldOverTvl: parseFloat(pool.stats['24h']?.yieldOverTvl || 0)
      },
      '7d': {
        volume: parseFloat(pool.stats['7d']?.volume || 0),
        fees: parseFloat(pool.stats['7d']?.fees || 0),
        yieldOverTvl: parseFloat(pool.stats['7d']?.yieldOverTvl || 0)
      },
      '30d': {
        volume: parseFloat(pool.stats['30d']?.volume || 0),
        fees: parseFloat(pool.stats['30d']?.fees || 0),
        yieldOverTvl: parseFloat(pool.stats['30d']?.yieldOverTvl || 0)
      }
    }
  };
}

async function getAllPools() {
  const results = [];
  for (const pool of POOLS) {
    try {
      const data = await getPoolData(pool.address);
      results.push({
        ...data,
        name: pool.name,
        type: pool.type,
        chain: pool.chain,
        venue: 'Orca'
      });
    } catch (err) {
      console.error(`Error fetching Orca pool ${pool.name}:`, err.message);
    }
  }
  return results;
}

module.exports = {
  POOLS,
  getPoolData,
  getAllPools
};
