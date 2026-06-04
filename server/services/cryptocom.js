const axios = require('axios');

const BASE_URL = 'https://api.crypto.com/exchange/v1';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Stablecoins where 1 unit ~= $1, so volume in that currency needs no price conversion
const STABLE_QUOTES = new Set(['PYUSD', 'USD', 'USDT', 'USDC', 'DAI']);

async function getPYUSDPairs() {
  const response = await axios.get(`${BASE_URL}/public/get-instruments`, {
    headers: { 'accept': 'application/json' }
  });

  const instruments = response.data?.result?.data || [];

  return instruments
    .filter(i => i.inst_type === 'CCY_PAIR' && i.tradable !== false)
    .filter(i => i.base_ccy === 'PYUSD' || i.quote_ccy === 'PYUSD')
    .map(i => ({
      symbol: i.symbol,
      baseAsset: i.base_ccy,
      quoteAsset: i.quote_ccy,
      displayName: i.display_name || i.symbol
    }));
}

async function getMonthlyCandles(symbol, count = 13) {
  const response = await axios.get(`${BASE_URL}/public/get-candlestick`, {
    params: {
      instrument_name: symbol,
      timeframe: '1M',
      count
    },
    headers: { 'accept': 'application/json' }
  });

  const candles = response.data?.result?.data || [];

  return candles.map(c => ({
    timestamp: c.t,
    month: new Date(c.t).toISOString().slice(0, 7), // YYYY-MM
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    baseVolume: parseFloat(c.v)
  }));
}

// Volume on crypto.com candles is in BASE currency.
// To get a PYUSD/USD-denominated value:
//   - if base is PYUSD (PYUSD_USD, PYUSD_USDT): volume is already in PYUSD (~$1)
//   - if quote is PYUSD (BTC_PYUSD, etc): multiply baseVolume * close (close is in PYUSD)
function candleToUsdVolume(candle, pair) {
  if (pair.baseAsset === 'PYUSD') {
    return candle.baseVolume; // PYUSD ~ $1
  }
  // base is something like BTC, quote is PYUSD => baseVolume * priceInPYUSD
  return candle.baseVolume * candle.close;
}

async function getMonthlyVolume() {
  const pairs = await getPYUSDPairs();

  if (pairs.length === 0) {
    return { exchange: 'cryptocom', pairs: [], months: [], volumeByPair: {}, totalByMonth: [] };
  }

  // Get last 12 complete months. Crypto.com returns the most recent N candles
  // including the current (in-progress) month, so request 13 and drop the current month.
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  const volumeByPair = {};
  const monthSet = new Set();

  for (const pair of pairs) {
    try {
      const candles = await getMonthlyCandles(pair.symbol, 13);

      const series = candles
        .filter(c => c.month !== currentMonth)
        .slice(-12)
        .map(c => ({
          month: c.month,
          volume: candleToUsdVolume(c, pair)
        }));

      volumeByPair[pair.symbol] = series;
      series.forEach(s => monthSet.add(s.month));

      await delay(250);
    } catch (err) {
      console.error(`[cryptocom] Error fetching candles for ${pair.symbol}:`, err.message);
      volumeByPair[pair.symbol] = [];
    }
  }

  const months = Array.from(monthSet).sort();

  // Aggregate total volume per month across all pairs
  const totalByMonth = months.map(month => {
    let volume = 0;
    const byPair = {};
    for (const pair of pairs) {
      const entry = (volumeByPair[pair.symbol] || []).find(s => s.month === month);
      const v = entry ? entry.volume : 0;
      byPair[pair.symbol] = v;
      volume += v;
    }
    return { month, volume, byPair };
  });

  return {
    exchange: 'cryptocom',
    pairs: pairs.map(p => p.symbol),
    pairDetails: pairs,
    months,
    volumeByPair,
    totalByMonth
  };
}

module.exports = {
  getPYUSDPairs,
  getMonthlyCandles,
  getMonthlyVolume
};
