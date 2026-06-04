const express = require('express');
const krakenService = require('../services/kraken');
const bullishService = require('../services/bullish');
const gateService = require('../services/gate');
const kucoinService = require('../services/kucoin');
const bitmartService = require('../services/bitmart');
const okxService = require('../services/okx');
const cryptocomService = require('../services/cryptocom');
const paxgService = require('../services/paxg');
const dbPool = require('../db/pool');

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

// Simple in-memory cache with 6-hour TTL
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

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

// GET /api/pyusd - Aggregated PYUSD pair monthly volume across exchanges (last 12 months)
router.get('/pyusd', async (req, res) => {
  const cacheKey = 'pyusd_monthly_all';

  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const [cryptocomData, krakenData] = await Promise.all([
      cryptocomService.getMonthlyVolume().catch(err => {
        console.error('cryptocom PYUSD error:', err.message);
        return { exchange: 'cryptocom', pairs: [], volumeByPair: {}, totalByMonth: [] };
      }),
      krakenService.getMonthlyPyusdVolume().catch(err => {
        console.error('kraken PYUSD error:', err.message);
        return { exchange: 'kraken', pairs: [], volumeByPair: {} };
      })
    ]);

    // Normalize each exchange into { exchange, pairs: [{ label, series: [{month, volume}] }] }
    const exchanges = [];

    // crypto.com
    exchanges.push({
      exchange: 'cryptocom',
      displayName: 'Crypto.com',
      pairs: cryptocomData.pairs.map(p => ({
        label: p,
        series: cryptocomData.volumeByPair[p] || []
      }))
    });

    // kraken
    exchanges.push({
      exchange: 'kraken',
      displayName: 'Kraken',
      pairs: krakenData.pairs.map(p => ({
        label: p,
        series: krakenData.volumeByPair[p] || []
      }))
    });

    // Build the union of months across all data
    const monthSet = new Set();
    for (const ex of exchanges) {
      for (const pair of ex.pairs) {
        for (const point of pair.series) monthSet.add(point.month);
      }
    }
    const months = Array.from(monthSet).sort().slice(-12);

    // For each month, compute totals overall, by exchange, and by pair (prefixed)
    const totalByMonth = months.map(month => {
      const byPair = {};
      const byExchange = {};
      let volume = 0;
      for (const ex of exchanges) {
        let exTotal = 0;
        for (const pair of ex.pairs) {
          const point = pair.series.find(s => s.month === month);
          const v = point ? point.volume : 0;
          const key = `${ex.displayName}: ${pair.label}`;
          byPair[key] = v;
          exTotal += v;
        }
        byExchange[ex.exchange] = exTotal;
        volume += exTotal;
      }
      return { month, volume, byExchange, byPair };
    });

    // Flat list of all pair labels (prefixed with exchange) in stable order
    const pairLabels = [];
    for (const ex of exchanges) {
      for (const pair of ex.pairs) {
        pairLabels.push(`${ex.displayName}: ${pair.label}`);
      }
    }

    const data = {
      months,
      pairs: pairLabels,
      exchanges: exchanges.map(ex => ({
        exchange: ex.exchange,
        displayName: ex.displayName,
        pairs: ex.pairs.map(p => p.label)
      })),
      totalByMonth
    };

    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Error fetching PYUSD volume:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/paxg/supply - PAXG circulating supply history from Postgres + live today
router.get('/paxg/supply', async (req, res) => {
  const cacheKey = 'paxg_supply_history';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Load all historical rows from Postgres
    const result = await dbPool.query(
      `SELECT supply_date::text AS date, supply::float, block_number
       FROM paxg_supply_history
       ORDER BY supply_date ASC`
    );

    const history = result.rows.map(r => ({
      date: r.date.split('T')[0],
      supply: parseFloat(r.supply),
      blockNumber: parseInt(r.block_number)
    }));

    // Append today's live supply if not yet in DB
    const today = new Date().toISOString().split('T')[0];
    const hasToday = history.length > 0 && history[history.length - 1].date === today;
    if (!hasToday) {
      try {
        const liveSupply = await paxgService.getCurrentSupply();
        history.push({ date: today, supply: liveSupply, blockNumber: null });
      } catch (err) {
        console.error('[paxg] Failed to fetch live supply:', err.message);
      }
    }

    const data = {
      token: 'PAXG',
      address: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
      chain: 'ethereum',
      history
    };

    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('Error fetching PAXG supply:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
