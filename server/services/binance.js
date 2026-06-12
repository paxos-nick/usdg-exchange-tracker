const axios = require('axios');
const { calculateDepthMetrics } = require('../utils/depthCalculator');

const BASE_URL = 'https://api.binance.com/api/v3';

async function getDailyVolume(symbol = 'PAXGUSDT', limit = 1000) {
  const response = await axios.get(`${BASE_URL}/klines`, {
    params: { symbol, interval: '1d', limit },
    timeout: 10000
  });

  // Binance kline fields:
  // [0]=open_time [1]=open [2]=high [3]=low [4]=close
  // [5]=base_volume(PAXG) [6]=close_time [7]=quote_volume(USDT)
  return response.data.map(c => ({
    date: new Date(c[0]).toISOString().split('T')[0],
    volume: parseFloat(c[7]), // USDT volume
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    trades: parseInt(c[8])
  }));
}

async function getOrderbook(symbol = 'PAXGUSDT', limit = 500) {
  const response = await axios.get(`${BASE_URL}/depth`, {
    params: { symbol, limit },
    timeout: 10000
  });

  return {
    bids: response.data.bids.map(([price, qty]) => [parseFloat(price), parseFloat(qty)]),
    asks: response.data.asks.map(([price, qty]) => [parseFloat(price), parseFloat(qty)])
  };
}

async function getPaxgMarketData() {
  const BPS_LEVELS = [2, 10, 25, 50, 100];

  const [dailyVolume, orderbook] = await Promise.all([
    getDailyVolume(),
    getOrderbook()
  ]);

  const depth = calculateDepthMetrics(orderbook.bids, orderbook.asks, BPS_LEVELS);

  return {
    symbol: 'PAXGUSDT',
    exchange: 'Binance',
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

module.exports = { getDailyVolume, getOrderbook, getPaxgMarketData };
