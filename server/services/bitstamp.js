const axios = require('axios');

const BASE_URL = 'https://www.bitstamp.net/api/v2';
const PAIR = 'usdgusd'; // USDG/USD — volume in USDG (base), ≈ $1 per unit

async function getDailyCandles(limit = 1000) {
  const { data } = await axios.get(`${BASE_URL}/ohlc/${PAIR}/`, {
    params: { step: 86400, limit },
    headers: { Accept: 'application/json' },
    timeout: 15000,
  });
  return data.data?.ohlc || [];
}

async function getAggregatedVolume() {
  try {
    const candles = await getDailyCandles();
    const dailyVolume = candles
      .filter(c => parseFloat(c.volume) > 0)
      .map(c => ({
        date: new Date(parseInt(c.timestamp) * 1000).toISOString().split('T')[0],
        volume: parseFloat(c.volume), // USDG volume ≈ USD
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { exchange: 'bitstamp', pairs: ['USDG/USD'], dailyVolume };
  } catch (err) {
    console.error('[Bitstamp] Error fetching volume:', err.message);
    return { exchange: 'bitstamp', pairs: [], dailyVolume: [] };
  }
}

async function getPerPairVolume() {
  try {
    const candles = await getDailyCandles();
    const pairData = candles
      .filter(c => parseFloat(c.volume) > 0)
      .map(c => ({
        date: new Date(parseInt(c.timestamp) * 1000).toISOString().split('T')[0],
        volume: parseFloat(c.volume),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      exchange: 'bitstamp',
      pairs: ['USDG/USD'],
      volumeByPair: { 'USDG/USD': pairData },
    };
  } catch (err) {
    console.error('[Bitstamp] Error fetching per-pair volume:', err.message);
    return { exchange: 'bitstamp', pairs: [], volumeByPair: {} };
  }
}

function getUSDGPairs() {
  return [{ symbol: 'usdgusd', displayName: 'USDG/USD', base: 'USDG', quote: 'USD' }];
}

async function getOrderbook(pairSymbol) {
  const { data } = await axios.get(`${BASE_URL}/order_book/${pairSymbol}/`, {
    headers: { Accept: 'application/json' },
    timeout: 10000,
  });
  return {
    bids: (data.bids || []).map(b => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: (data.asks || []).map(a => [parseFloat(a[0]), parseFloat(a[1])]),
  };
}

module.exports = { getAggregatedVolume, getPerPairVolume, getUSDGPairs, getOrderbook };
