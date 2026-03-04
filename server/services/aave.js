const axios = require('axios');

const GRAPHQL_URL = 'https://api.v3.aave.com/graphql';

// AAVE V3 Ethereum mainnet market
const MARKET_ADDRESS = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

const LENDING = {
  underlyingToken: '0xe343167631d89b6ffc58b88d6b7fb0228795491d',
  name: 'USDG (AAVE V3)',
  chain: 'ethereum'
};

const RESERVE_QUERY = `
  query GetReserve($market: EvmAddress!, $underlyingToken: EvmAddress!, $chainId: ChainId!) {
    reserve(request: {
      market: $market,
      underlyingToken: $underlyingToken,
      chainId: $chainId
    }) {
      underlyingToken { symbol address decimals }
      supplyInfo {
        apy { value }
        total { value }
        maxLTV { value }
        liquidationThreshold { value }
        canBeCollateral
        supplyCap { amount { value } usd }
      }
      borrowInfo {
        apy { value }
        total { amount { value } usd }
        availableLiquidity { amount { value } usd }
        utilizationRate { value }
        reserveFactor { value }
      }
      size { amount { value } usd }
      usdExchangeRate
    }
  }
`;

async function getLendingData() {
  try {
    const response = await axios.post(GRAPHQL_URL, {
      query: RESERVE_QUERY,
      variables: {
        market: MARKET_ADDRESS,
        underlyingToken: LENDING.underlyingToken,
        chainId: 1
      }
    });

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    const reserve = response.data.data.reserve;
    const supply = reserve.supplyInfo;
    const borrow = reserve.borrowInfo;

    const depositTvl = parseFloat(supply.total.value) || 0;
    const totalBorrows = parseFloat(borrow.total.usd) || 0;
    const totalLiquidity = parseFloat(borrow.availableLiquidity.usd) || 0;
    const utilization = parseFloat(borrow.utilizationRate.value) * 100 || 0;

    return {
      name: LENDING.name,
      chain: LENDING.chain,
      venue: 'AAVE',
      symbol: reserve.underlyingToken.symbol,
      depositTvl,
      totalBorrows,
      totalLiquidity,
      utilization,
      supplyAPY: parseFloat(supply.apy.value) || 0,
      borrowAPY: parseFloat(borrow.apy.value) || 0,
      loanToValue: parseFloat(supply.maxLTV.value) || 0,
      liquidationThreshold: parseFloat(supply.liquidationThreshold.value) || 0,
      canBeCollateral: supply.canBeCollateral,
      reserveFactor: parseFloat(borrow.reserveFactor.value) || 0
    };
  } catch (err) {
    console.error(`Error fetching AAVE lending ${LENDING.name}:`, err.message);
    return null;
  }
}

module.exports = {
  LENDING,
  getLendingData
};
