const axios = require('axios');

const BASE_URL = 'https://www.okx.com/api/v5';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// OKX uses USDG-USDT format
const USDG_PAIRS = ['USDG-USDT'];

async function getUSDGPairs() {
  return USDG_PAIRS.map(pair => ({
    symbol: pair,
    displayName: pair.replace('-', '/')
  }));
}

async function getDailyVolume(pair) {
  const response = await axios.get(`${BASE_URL}/market/candles`, {
    params: {
      instId: pair,
      bar: '1D',
      limit: 300
    }
  });

  if (response.data.code !== '0') {
    throw new Error(`OKX API error: ${response.data.msg}`);
  }

  const candles = response.data.data || [];

  // OKX response: [[timestamp, open, high, low, close, vol, volCcy, volCcyQuote, confirm], ...]
  // Timestamp is in milliseconds
  return candles.map(candle => ({
    timestamp: parseInt(candle[0]),
    date: new Date(parseInt(candle[0])).toISOString().split('T')[0],
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5])
  }));
}

async function getAggregatedVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'okx',
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

      await delay(150);
    } catch (err) {
      console.error(`Error fetching OKX volume for ${pair.symbol}:`, err.message);
    }
  }

  const dailyVolume = Array.from(volumeByDate.entries())
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    exchange: 'okx',
    pairs: pairNames,
    dailyVolume
  };
}

async function getPerPairVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'okx',
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

      await delay(150);
    } catch (err) {
      console.error(`Error fetching OKX volume for ${pair.symbol}:`, err.message);
    }
  }

  return {
    exchange: 'okx',
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
