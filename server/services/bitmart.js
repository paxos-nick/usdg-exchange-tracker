const axios = require('axios');

const BASE_URL = 'https://api-cloud.bitmart.com';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Bitmart uses USDG_USDT format
const USDG_PAIRS = ['USDG_USDT'];

async function getUSDGPairs() {
  return USDG_PAIRS.map(pair => ({
    symbol: pair,
    displayName: pair.replace('_', '/')
  }));
}

async function getDailyVolume(pair) {
  // step=1440 is daily (1440 minutes)
  // Get data going back ~1 year
  const after = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);

  const response = await axios.get(`${BASE_URL}/spot/quotation/v3/klines`, {
    params: {
      symbol: pair,
      step: 1440,
      after: after,
      limit: 200
    }
  });

  if (response.data.code !== 1000) {
    throw new Error(`Bitmart API error: ${response.data.message}`);
  }

  const candles = response.data.data || [];

  // Bitmart returns arrays: [timestamp, open, high, low, close, volume, amount]
  return candles.map(candle => {
    const timestamp = parseInt(candle[0]) * 1000;
    return {
      timestamp: timestamp,
      date: new Date(timestamp).toISOString().split('T')[0],
      open: parseFloat(candle[1] || 0),
      high: parseFloat(candle[2] || 0),
      low: parseFloat(candle[3] || 0),
      close: parseFloat(candle[4] || 0),
      volume: parseFloat(candle[5] || 0)
    };
  });
}

async function getAggregatedVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'bitmart',
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

      for (const day of dailyData) {
        if (day.date) {
          const existing = volumeByDate.get(day.date) || 0;
          volumeByDate.set(day.date, existing + day.volume);
        }
      }

      await delay(250);
    } catch (err) {
      console.error(`Error fetching Bitmart volume for ${pair.symbol}:`, err.message);
    }
  }

  const dailyVolume = Array.from(volumeByDate.entries())
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    exchange: 'bitmart',
    pairs: pairNames,
    dailyVolume
  };
}

async function getPerPairVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'bitmart',
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

      volumeByPair[pair.displayName] = dailyData.map(d => ({
        date: d.date,
        volume: d.volume
      }));

      await delay(250);
    } catch (err) {
      console.error(`Error fetching Bitmart volume for ${pair.symbol}:`, err.message);
    }
  }

  return {
    exchange: 'bitmart',
    pairs: pairNames,
    volumeByPair
  };
}

module.exports = {
  getUSDGPairs,
  getDailyVolume,
  getAggregatedVolume,
  getPerPairVolume
};
