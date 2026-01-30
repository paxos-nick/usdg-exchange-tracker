const express = require('express');
const krakenService = require('../services/kraken');
const bullishService = require('../services/bullish');
const gateService = require('../services/gate');
const kucoinService = require('../services/kucoin');
const bitmartService = require('../services/bitmart');
const okxService = require('../services/okx');

const router = express.Router();

// All supported exchanges
const EXCHANGES = ['kraken', 'bullish', 'gate', 'kucoin', 'bitmart', 'okx'];

// Service map for easy lookup
const services = {
  kraken: krakenService,
  bullish: bullishService,
  gate: gateService,
  kucoin: kucoinService,
  bitmart: bitmartService,
  okx: okxService
};

// Simple in-memory cache with 5-minute TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

// GET /api/exchanges - List supported exchanges
router.get('/exchanges', (req, res) => {
  res.json(EXCHANGES);
});

// GET /api/volume/:exchange - Get volume for specific exchange
router.get('/volume/:exchange', async (req, res) => {
  const { exchange } = req.params;
  const cacheKey = `volume_${exchange}`;

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const service = services[exchange.toLowerCase()];
  if (!service) {
    return res.status(400).json({ error: `Unknown exchange: ${exchange}` });
  }

  try {
    const data = await service.getAggregatedVolume();
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error(`Error fetching ${exchange} volume:`, err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/aggregated - Get combined volume across all exchanges
router.get('/aggregated', async (req, res) => {
  const cacheKey = 'volume_aggregated';

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    // Fetch from all exchanges in parallel
    const results = await Promise.all(
      EXCHANGES.map(exchangeName =>
        services[exchangeName].getAggregatedVolume().catch(err => {
          console.error(`${exchangeName} error:`, err.message);
          return { exchange: exchangeName, pairs: [], dailyVolume: [] };
        })
      )
    );

    // Combine volumes by date
    const volumeByDate = new Map();
    const pairsByExchange = {};

    for (const exchangeData of results) {
      const exchangeName = exchangeData.exchange;
      pairsByExchange[exchangeName] = exchangeData.pairs;

      for (const day of exchangeData.dailyVolume) {
        const existing = volumeByDate.get(day.date) || { volume: 0, byExchange: {} };
        existing.volume += day.volume;
        existing.byExchange[exchangeName] = day.volume;
        volumeByDate.set(day.date, existing);
      }
    }

    const dailyVolume = Array.from(volumeByDate.entries())
      .map(([date, data]) => ({
        date,
        volume: data.volume,
        byExchange: data.byExchange
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalVolume = dailyVolume.reduce((sum, day) => sum + day.volume, 0);

    const data = {
      dailyVolume,
      totalVolume,
      exchanges: EXCHANGES,
      pairsByExchange
    };

    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Error fetching aggregated volume:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to extract the counter-asset from a USDG pair
function extractAsset(pairName) {
  // Normalize: remove separators and convert to uppercase
  const normalized = pairName.toUpperCase().replace(/[/_-]/g, '');

  // Remove USDG from the pair to get the counter-asset
  if (normalized.startsWith('USDG')) {
    return normalized.replace('USDG', '');
  }
  if (normalized.endsWith('USDG')) {
    return normalized.replace('USDG', '');
  }

  // Fallback: try to split on common patterns
  const parts = pairName.split(/[/_-]/);
  for (const part of parts) {
    if (part.toUpperCase() !== 'USDG') {
      return part.toUpperCase();
    }
  }

  return pairName; // Return original if can't extract
}

// GET /api/asset-volume - Get volume grouped by asset across all exchanges
router.get('/asset-volume', async (req, res) => {
  const cacheKey = 'asset_volume';

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    // Fetch per-pair volume from all exchanges in parallel
    const results = await Promise.all(
      EXCHANGES.map(exchangeName =>
        services[exchangeName].getPerPairVolume().catch(err => {
          console.error(`${exchangeName} error:`, err.message);
          return { exchange: exchangeName, pairs: [], volumeByPair: {} };
        })
      )
    );

    // Group by asset
    const assetSet = new Set();
    const volumeByAsset = {};

    for (const exchangeData of results) {
      const exchangeName = exchangeData.exchange;

      for (const [pairName, dailyData] of Object.entries(exchangeData.volumeByPair)) {
        const asset = extractAsset(pairName);
        assetSet.add(asset);

        if (!volumeByAsset[asset]) {
          volumeByAsset[asset] = {};
        }

        // Merge data for this exchange (in case multiple pairs map to same asset)
        if (!volumeByAsset[asset][exchangeName]) {
          volumeByAsset[asset][exchangeName] = [];
        }

        // Add daily volumes
        for (const day of dailyData) {
          const existing = volumeByAsset[asset][exchangeName].find(d => d.date === day.date);
          if (existing) {
            existing.volume += day.volume;
          } else {
            volumeByAsset[asset][exchangeName].push({ date: day.date, volume: day.volume });
          }
        }
      }
    }

    // Sort daily data within each exchange
    for (const asset of Object.keys(volumeByAsset)) {
      for (const exchange of Object.keys(volumeByAsset[asset])) {
        volumeByAsset[asset][exchange].sort((a, b) => a.date.localeCompare(b.date));
      }
    }

    const assets = Array.from(assetSet).sort();

    const data = {
      assets,
      volumeByAsset,
      exchanges: EXCHANGES
    };

    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Error fetching asset volume:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pairs/:exchange - Get per-pair volume for specific exchange
router.get('/pairs/:exchange', async (req, res) => {
  const { exchange } = req.params;
  const cacheKey = `pairs_${exchange}`;

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const service = services[exchange.toLowerCase()];
  if (!service) {
    return res.status(400).json({ error: `Unknown exchange: ${exchange}` });
  }

  try {
    const data = await service.getPerPairVolume();
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error(`Error fetching ${exchange} pair volume:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
