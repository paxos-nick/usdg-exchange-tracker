const axios = require('axios');

const BASE_URL = 'https://api.gateio.ws/api/v4';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Gate.io uses USDG_USDT format
const USDG_PAIRS = ['USDG_USDT'];

async function getUSDGPairs() {
  return USDG_PAIRS.map(pair => ({
    symbol: pair,
    displayName: pair.replace('_', '/')
  }));
}

async function getDailyVolume(pair) {
  const response = await axios.get(`${BASE_URL}/spot/candlesticks`, {
    params: {
      currency_pair: pair,
      interval: '1d',
      limit: 1000
    }
  });

  const candles = response.data;

  // Gate.io response: [[timestamp, volume, close, high, low, open, amount], ...]
  // Note: Gate.io order is different - check docs
  return candles.map(candle => ({
    timestamp: parseInt(candle[0]) * 1000,
    date: new Date(parseInt(candle[0]) * 1000).toISOString().split('T')[0],
    volume: parseFloat(candle[1]),
    close: parseFloat(candle[2]),
    high: parseFloat(candle[3]),
    low: parseFloat(candle[4]),
    open: parseFloat(candle[5])
  }));
}

async function getAggregatedVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'gate',
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

      await delay(100);
    } catch (err) {
      console.error(`Error fetching Gate.io volume for ${pair.symbol}:`, err.message);
    }
  }

  const dailyVolume = Array.from(volumeByDate.entries())
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    exchange: 'gate',
    pairs: pairNames,
    dailyVolume
  };
}

async function getPerPairVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'gate',
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

      await delay(100);
    } catch (err) {
      console.error(`Error fetching Gate.io volume for ${pair.symbol}:`, err.message);
    }
  }

  return {
    exchange: 'gate',
    pairs: pairNames,
    volumeByPair
  };
}

async function getOrderbook(pair) {
  const response = await axios.get(`${BASE_URL}/spot/order_book`, {
    params: { currency_pair: pair, limit: 100 }
  });

  return {
    bids: (response.data.bids || []).map(b => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: (response.data.asks || []).map(a => [parseFloat(a[0]), parseFloat(a[1])])
  };
}

module.exports = {
  getUSDGPairs,
  getDailyVolume,
  getAggregatedVolume,
  getPerPairVolume,
  getOrderbook
};
