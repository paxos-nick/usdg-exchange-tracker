const krakenService = require('./kraken');
const gateService = require('./gate');
const kucoinService = require('./kucoin');
const bitmartService = require('./bitmart');
const okxService = require('./okx');
const { classifyPair, getBpsLevels, calculateDepthMetrics } = require('../utils/depthCalculator');

const EXCHANGES = ['kraken', 'gate', 'kucoin', 'bitmart', 'okx'];

const services = {
  kraken: krakenService,
  gate: gateService,
  kucoin: kucoinService,
  bitmart: bitmartService,
  okx: okxService
};

const EXCHANGE_NAMES = {
  kraken: 'Kraken',
  gate: 'Gate.io',
  kucoin: 'Kucoin',
  bitmart: 'Bitmart',
  okx: 'OKX'
};

const RATE_LIMITS = {
  kraken: 1000,
  gate: 100,
  kucoin: 200,
  bitmart: 250,
  okx: 150
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function extractBaseQuote(pair, exchangeName) {
  switch (exchangeName) {
    case 'kraken': {
      const base = (pair.base || '').replace(/^[XZ]/, '').toUpperCase();
      const quote = (pair.quote || '').replace(/^[XZ]/, '').toUpperCase();
      return { base, quote };
    }
    case 'gate':
    case 'bitmart': {
      const parts = pair.symbol.split('_');
      return { base: parts[0], quote: parts[1] };
    }
    case 'kucoin':
    case 'okx': {
      const parts = pair.symbol.split('-');
      return { base: parts[0], quote: parts[1] };
    }
    default:
      return { base: '', quote: '' };
  }
}

/**
 * Fetch current USDG depth data from all supported exchanges.
 * Returns the same row shape used by GET /api/depth.
 */
async function fetchUsdgDepth() {
  const results = [];

  const exchangePromises = EXCHANGES.map(async (exchangeName) => {
    const service = services[exchangeName];
    const exchangeResults = [];

    try {
      const pairs = await service.getUSDGPairs();
      const fetchedAt = new Date().toISOString();

      for (const pair of pairs) {
        try {
          const { base, quote } = extractBaseQuote(pair, exchangeName);
          const orderbook = await service.getOrderbook(pair.symbol);

          if (!orderbook.bids.length || !orderbook.asks.length) continue;

          const pairType = classifyPair(base, quote);
          const bpsLevels = getBpsLevels(pairType);
          const metrics = calculateDepthMetrics(orderbook.bids, orderbook.asks, bpsLevels);
          const displayName = pair.wsname || pair.displayName || pair.symbol;

          exchangeResults.push({
            exchange: exchangeName,
            exchangeDisplay: EXCHANGE_NAMES[exchangeName],
            pair: displayName,
            pairType,
            midPrice: metrics.midPrice,
            bestBid: metrics.bestBid,
            bestAsk: metrics.bestAsk,
            spreadBps: metrics.spreadBps,
            bpsLevels,
            bidDepth: metrics.bidDepth,
            askDepth: metrics.askDepth,
            fetchedAt,
            ok: true
          });

          if (pairs.length > 1) await delay(RATE_LIMITS[exchangeName]);
        } catch (err) {
          console.error(`[DepthFetcher] ${exchangeName}/${pair.symbol}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[DepthFetcher] ${exchangeName} pairs:`, err.message);
    }

    return exchangeResults;
  });

  const allResults = await Promise.all(exchangePromises);
  for (const rows of allResults) results.push(...rows);

  results.sort((a, b) => {
    const ec = a.exchange.localeCompare(b.exchange);
    return ec !== 0 ? ec : a.pair.localeCompare(b.pair);
  });

  return results;
}

module.exports = { fetchUsdgDepth, EXCHANGE_NAMES };
