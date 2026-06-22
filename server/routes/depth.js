const express = require('express');
const pool = require('../db/pool');
const { fetchUsdgDepth, EXCHANGE_NAMES } = require('../services/depthFetcher');

const router = express.Router();

const EXCHANGES = ['kraken', 'gate', 'kucoin', 'bitmart', 'okx'];

// Per-exchange health tracking
const exchangeHealth = {};
for (const ex of EXCHANGES) {
  exchangeHealth[ex] = { lastSuccess: null, lastAttempt: null, lastError: null, ok: null };
}

// 5-minute cache for live orderbook data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// GET /api/depth - Live depth and spread for all USDG pairs
router.get('/', async (req, res) => {
  const cacheKey = 'depth_all';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const rows = await fetchUsdgDepth();

    // Update health tracking
    for (const row of rows) {
      if (row.ok) {
        exchangeHealth[row.exchange] = {
          ...exchangeHealth[row.exchange],
          lastSuccess: new Date(),
          lastError: null,
          ok: true
        };
      }
    }

    const data = { timestamp: new Date().toISOString(), rows };
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[Depth] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/depth/history - Historical USDG depth snapshots with CSV export
router.get('/history', async (req, res) => {
  const { start, end, format = 'json' } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
  }

  try {
    const result = await pool.query(
      `SELECT snapped_at, exchange, pair, pair_type, mid_price, best_bid, best_ask,
              spread_bps, bps_levels, bid_depth, ask_depth
       FROM depth_snapshots
       WHERE exchange != 'Binance'
         AND snapped_at >= $1::date
         AND snapped_at <  $2::date + interval '1 day'
       ORDER BY snapped_at ASC, exchange, pair`,
      [start, end]
    );

    const rows = result.rows;

    if (format === 'csv') {
      const ALL_BPS = [1, 2, 5, 10, 25, 50, 100];
      const headers = [
        'timestamp', 'exchange', 'pair', 'pair_type',
        'mid_price', 'best_bid', 'best_ask', 'spread_bps',
        ...ALL_BPS.flatMap(b => [`bid_${b}bps`, `ask_${b}bps`])
      ];

      const csvLines = [headers.join(',')];
      for (const row of rows) {
        const bid = row.bid_depth || {};
        const ask = row.ask_depth || {};
        const cols = [
          row.snapped_at.toISOString(),
          row.exchange,
          row.pair,
          row.pair_type,
          row.mid_price ?? '',
          row.best_bid ?? '',
          row.best_ask ?? '',
          row.spread_bps ?? '',
          ...ALL_BPS.flatMap(b => [bid[b] ?? '', ask[b] ?? ''])
        ];
        csvLines.push(cols.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="usdg_depth_${start}_to_${end}.csv"`);
      return res.send(csvLines.join('\n'));
    }

    res.json({ rows });
  } catch (err) {
    console.error('[Depth] History error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/depth/health - Per-exchange connection health
router.get('/health', (req, res) => {
  const STALE_THRESHOLD_MS = 10 * 60 * 1000;
  const now = Date.now();

  const health = {};
  for (const ex of EXCHANGES) {
    const h = exchangeHealth[ex];
    const lastSuccessMs = h.lastSuccess ? now - new Date(h.lastSuccess).getTime() : null;
    const isStale = lastSuccessMs === null || lastSuccessMs > STALE_THRESHOLD_MS;
    health[ex] = {
      name: EXCHANGE_NAMES[ex],
      ok: h.ok === true && !isStale,
      lastSuccess: h.lastSuccess,
      lastAttempt: h.lastAttempt,
      lastError: h.lastError,
      lastSuccessAgoMs: lastSuccessMs
    };
  }

  res.json({ timestamp: new Date().toISOString(), exchanges: health });
});

module.exports = router;
