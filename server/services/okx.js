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

async function getOrderbook(symbol) {
  const response = await axios.get(`${BASE_URL}/market/books`, {
    params: { instId: symbol, sz: 400 }
  });

  if (response.data.code !== '0') {
    throw new Error(`OKX API error: ${response.data.msg}`);
  }

  const data = response.data.data[0];
  return {
    bids: (data.bids || []).map(b => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: (data.asks || []).map(a => [parseFloat(a[0]), parseFloat(a[1])])
  };
}

// Fetch full daily volume history for any OKX instrument (paginates through history-candles)
// Returns [{ date, volume }] with volume in USDT (index 6 = volCcyQuote)
async function getDailyVolumeHistory(instId) {
  const all = [];
  let after = '';

  for (let page = 0; page < 20; page++) {
    const params = { instId, bar: '1D', limit: 100 };
    if (after) params.after = after;

    const response = await axios.get(`${BASE_URL}/market/history-candles`, { params });
    if (response.data.code !== '0') throw new Error(`OKX API error: ${response.data.msg}`);

    const batch = response.data.data || [];
    if (!batch.length) break;

    all.push(...batch);
    after = batch[batch.length - 1][0]; // oldest timestamp in batch
    await delay(200);
  }

  // Deduplicate and sort ascending
  const byDate = new Map();
  for (const c of all) {
    const date = new Date(parseInt(c[0])).toISOString().split('T')[0];
    byDate.set(date, { date, volume: parseFloat(c[6]) }); // index 6 = USDT volume
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = {
  getUSDGPairs,
  getDailyVolume,
  getDailyVolumeHistory,
  getAggregatedVolume,
  getPerPairVolume,
  getOrderbook
};
