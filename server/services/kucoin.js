const axios = require('axios');

const BASE_URL = 'https://api.kucoin.com/api/v1';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Kucoin uses USDG-USDT format
const USDG_PAIRS = ['USDG-USDT', 'BTC-USDG'];

// Check if a pair needs volume conversion (base currency is not a stablecoin)
function needsVolumeConversion(symbol) {
  const stablecoins = ['USDG', 'USDT', 'USDC', 'USD', 'EUR'];
  const upperSymbol = symbol.toUpperCase();
  // Check if symbol starts with a stablecoin (before the separator)
  const base = upperSymbol.split('-')[0];
  return !stablecoins.includes(base);
}

async function getUSDGPairs() {
  return USDG_PAIRS.map(pair => ({
    symbol: pair,
    displayName: pair.replace('-', '/')
  }));
}

async function getDailyVolume(pair) {
  // Get data for last year
  const endAt = Math.floor(Date.now() / 1000);
  const startAt = endAt - (365 * 24 * 60 * 60);

  const response = await axios.get(`${BASE_URL}/market/candles`, {
    params: {
      symbol: pair,
      type: '1day',
      startAt: startAt,
      endAt: endAt
    }
  });

  if (response.data.code !== '200000') {
    throw new Error(`Kucoin API error: ${response.data.msg}`);
  }

  const candles = response.data.data || [];

  // Kucoin response: [[timestamp, open, close, high, low, volume, amount], ...]
  return candles.map(candle => {
    const close = parseFloat(candle[2]);
    const rawVolume = parseFloat(candle[5]);
    return {
      timestamp: parseInt(candle[0]) * 1000,
      date: new Date(parseInt(candle[0]) * 1000).toISOString().split('T')[0],
      open: parseFloat(candle[1]),
      close: close,
      high: parseFloat(candle[3]),
      low: parseFloat(candle[4]),
      rawVolume: rawVolume,
      volume: rawVolume // Will be converted in aggregation if needed
    };
  });
}

async function getAggregatedVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'kucoin',
      pairs: [],
      dailyVolume: []
    };
  }

  const volumeByDate = new Map();
  const pairNames = [];

  for (const pair of pairs) {
    try {
      pairNames.push(pair.displayName);
      const dailyData = await getDailyVolume(pair.symbol);
      const convertVolume = needsVolumeConversion(pair.symbol);

      for (const day of dailyData) {
        if (day.date) {
          const existing = volumeByDate.get(day.date) || 0;
          // Convert to USD value if needed (volume * price)
          const usdVolume = convertVolume ? day.rawVolume * day.close : day.rawVolume;
          volumeByDate.set(day.date, existing + usdVolume);
        }
      }

      await delay(200);
    } catch (err) {
      console.error(`Error fetching Kucoin volume for ${pair.symbol}:`, err.message);
    }
  }

  const dailyVolume = Array.from(volumeByDate.entries())
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    exchange: 'kucoin',
    pairs: pairNames,
    dailyVolume
  };
}

async function getPerPairVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'kucoin',
      pairs: [],
      volumeByPair: {}
    };
  }

  const volumeByPair = {};
  const pairNames = [];

  for (const pair of pairs) {
    try {
      pairNames.push(pair.displayName);
      const dailyData = await getDailyVolume(pair.symbol);
      const convertVolume = needsVolumeConversion(pair.symbol);

      volumeByPair[pair.displayName] = dailyData.map(d => ({
        date: d.date,
        // Convert to USD value if needed (volume * price)
        volume: convertVolume ? d.rawVolume * d.close : d.rawVolume
      }));

      await delay(200);
    } catch (err) {
      console.error(`Error fetching Kucoin volume for ${pair.symbol}:`, err.message);
    }
  }

  return {
    exchange: 'kucoin',
    pairs: pairNames,
    volumeByPair
  };
}

async function getOrderbook(symbol) {
  const response = await axios.get(`${BASE_URL}/market/orderbook/level2_100`, {
    params: { symbol: symbol }
  });

  if (response.data.code !== '200000') {
    throw new Error(`Kucoin API error: ${response.data.msg}`);
  }

  const data = response.data.data;
  return {
    bids: (data.bids || []).map(b => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: (data.asks || []).map(a => [parseFloat(a[0]), parseFloat(a[1])])
  };
}

module.exports = {
  getUSDGPairs,
  getDailyVolume,
  getAggregatedVolume,
  getPerPairVolume,
  getOrderbook
};
