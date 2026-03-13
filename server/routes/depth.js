const express = require('express');
const krakenService = require('../services/kraken');
const gateService = require('../services/gate');
const kucoinService = require('../services/kucoin');
const bitmartService = require('../services/bitmart');
const okxService = require('../services/okx');
const { classifyPair, getBpsLevels, calculateDepthMetrics } = require('../utils/depthCalculator');

const router = express.Router();

// Exchanges with orderbook support (Bullish excluded - AMM)
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

// Rate limit delays per exchange (ms)
const RATE_LIMITS = {
  kraken: 1000,
  gate: 100,
  kucoin: 200,
  bitmart: 250,
  okx: 150
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 5-minute cache for orderbook data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Per-exchange health tracking
// { [exchange]: { lastSuccess: Date|null, lastAttempt: Date|null, lastError: string|null, ok: bool } }
const exchangeHealth = {};
for (const ex of EXCHANGES) {
  exchangeHealth[ex] = { lastSuccess: null, lastAttempt: null, lastError: null, ok: null };
}

/**
 * Extract base/quote from pair data based on exchange format
 */
function extractBaseQuote(pair, exchangeName) {
  switch (exchangeName) {
    case 'kraken': {
      // Kraken pair objects have .base and .quote fields
      const base = (pair.base || '').replace(/^[XZ]/, '').toUpperCase();
      const quote = (pair.quote || '').replace(/^[XZ]/, '').toUpperCase();
      return { base, quote };
    }
    case 'gate':
    case 'bitmart': {
      // Underscore separator: USDG_USDT
      const parts = pair.symbol.split('_');
      return { base: parts[0], quote: parts[1] };
    }
    case 'kucoin':
    case 'okx': {
      // Dash separator: USDG-USDT, BTC-USDG
      const parts = pair.symbol.split('-');
      return { base: parts[0], quote: parts[1] };
    }
    default:
      return { base: '', quote: '' };
  }
}

// GET /api/depth - Depth and spread for all exchanges/pairs
router.get('/', async (req, res) => {
  const cacheKey = 'depth_all';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const results = [];

    // Fetch all exchanges in parallel
    const exchangePromises = EXCHANGES.map(async (exchangeName) => {
      const service = services[exchangeName];
      const exchangeResults = [];
      const attemptTime = new Date();
      exchangeHealth[exchangeName].lastAttempt = attemptTime;

      try {
        const pairs = await service.getUSDGPairs();
        const fetchedAt = new Date().toISOString();

        for (const pair of pairs) {
          try {
            const { base, quote } = extractBaseQuote(pair, exchangeName);
            const orderbook = await service.getOrderbook(pair.symbol);

            if (!orderbook.bids.length || !orderbook.asks.length) {
              continue;
            }

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
              spreadBps: metrics.spreadBps,
              bpsLevels,
              bidDepth: metrics.bidDepth,
              askDepth: metrics.askDepth,
              fetchedAt,
              ok: true
            });

            // Rate limit between pair requests within same exchange
            if (pairs.length > 1) {
              await delay(RATE_LIMITS[exchangeName]);
            }
          } catch (err) {
            console.error(`[Depth] Error fetching orderbook for ${exchangeName}/${pair.symbol}:`, err.message);
          }
        }

        exchangeHealth[exchangeName].lastSuccess = attemptTime;
        exchangeHealth[exchangeName].lastError = null;
        exchangeHealth[exchangeName].ok = true;
      } catch (err) {
        console.error(`[Depth] Error fetching pairs for ${exchangeName}:`, err.message);
        exchangeHealth[exchangeName].lastError = err.message;
        exchangeHealth[exchangeName].ok = false;
      }

      return exchangeResults;
    });

    const allResults = await Promise.all(exchangePromises);
    for (const exchangeResults of allResults) {
      results.push(...exchangeResults);
    }

    // Sort by exchange name, then pair name
    results.sort((a, b) => {
      const exchangeCompare = a.exchange.localeCompare(b.exchange);
      if (exchangeCompare !== 0) return exchangeCompare;
      return a.pair.localeCompare(b.pair);
    });

    const data = {
      timestamp: new Date().toISOString(),
      rows: results
    };

    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[Depth] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health - Per-exchange connection health
router.get('/health', (req, res) => {
  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  const now = Date.now();

  const health = {};
  for (const ex of EXCHANGES) {
    const h = exchangeHealth[ex];
    const lastSuccessMs = h.lastSuccess ? now - new Date(h.lastSuccess).getTime() : null;
    const isStale = lastSuccessMs === null || lastSuccessMs > STALE_THRESHOLD_MS;
    const ok = h.ok === true && !isStale;

    health[ex] = {
      name: EXCHANGE_NAMES[ex],
      ok,
      lastSuccess: h.lastSuccess,
      lastAttempt: h.lastAttempt,
      lastError: h.lastError,
      lastSuccessAgoMs: lastSuccessMs
    };
  }

  res.json({ timestamp: new Date().toISOString(), exchanges: health });
});

module.exports = router;
