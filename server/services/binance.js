const axios = require('axios');
const { calculateDepthMetrics } = require('../utils/depthCalculator');

const BASE_URL = 'https://api.binance.com/api/v3';
const BPS_LEVELS = [2, 10, 25, 50, 100];

async function getDailyVolume(symbol, limit = 1000) {
  const response = await axios.get(`${BASE_URL}/klines`, {
    params: { symbol, interval: '1d', limit },
    timeout: 10000
  });

  // Binance kline fields:
  // [0]=open_time [1]=open [2]=high [3]=low [4]=close
  // [5]=base_volume [6]=close_time [7]=quote_volume(USDT)
  return response.data.map(c => ({
    date: new Date(c[0]).toISOString().split('T')[0],
    volume: parseFloat(c[7]),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    trades: parseInt(c[8])
  }));
}

async function getOrderbook(symbol, limit = 500) {
  const response = await axios.get(`${BASE_URL}/depth`, {
    params: { symbol, limit },
    timeout: 10000
  });

  return {
    bids: response.data.bids.map(([price, qty]) => [parseFloat(price), parseFloat(qty)]),
    asks: response.data.asks.map(([price, qty]) => [parseFloat(price), parseFloat(qty)])
  };
}

async function getPairData(symbol) {
  const [dailyVolume, orderbook] = await Promise.all([
    getDailyVolume(symbol),
    getOrderbook(symbol)
  ]);

  const depth = calculateDepthMetrics(orderbook.bids, orderbook.asks, BPS_LEVELS);

  return {
    symbol,
    dailyVolume,
    depth: {
      midPrice: depth.midPrice,
      spreadBps: depth.spreadBps,
      bpsLevels: BPS_LEVELS,
      bidDepth: depth.bidDepth,
      askDepth: depth.askDepth
    }
  };
}

async function getGoldPairsData() {
  const [paxg, xaut] = await Promise.all([
    getPairData('PAXGUSDT'),
    getPairData('XAUTUSDT')
  ]);

  // Merge daily volumes by date for the combined chart
  const dateMap = new Map();
  for (const d of paxg.dailyVolume) {
    dateMap.set(d.date, { date: d.date, paxg: d.volume, xaut: 0 });
  }
  for (const d of xaut.dailyVolume) {
    const existing = dateMap.get(d.date);
    if (existing) {
      existing.xaut = d.volume;
    } else {
      dateMap.set(d.date, { date: d.date, paxg: 0, xaut: d.volume });
    }
  }
  const combinedVolume = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return { exchange: 'Binance', paxg, xaut, combinedVolume };
}

module.exports = { getDailyVolume, getOrderbook, getPairData, getGoldPairsData };
