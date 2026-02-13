const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const LOG_FILE = path.join(__dirname, '../logs/weekly-metrics.jsonl');

/**
 * Read and parse the metrics log file
 */
function readMetricsLog() {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch (e) {
      // Skip malformed lines
    }
  }

  // Sort by timestamp
  entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return entries;
}

/**
 * Group daily entries into weekly summaries
 * Uses the last entry of each week (Saturday or most recent day)
 */
function groupByWeek(entries) {
  const weekMap = new Map();

  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    // Get the week start (Sunday)
    const weekStart = new Date(date);
    weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekKey = weekStart.toISOString().split('T')[0];

    // Keep the latest entry for each week
    if (!weekMap.has(weekKey) || new Date(entry.timestamp) > new Date(weekMap.get(weekKey).timestamp)) {
      weekMap.set(weekKey, {
        weekStart: weekKey,
        weekEnd: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ...entry
      });
    }
  }

  return Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Group daily entries into monthly summaries
 * Uses the last entry of each month
 * Only includes completed months (excludes current month)
 */
function groupByMonth(entries) {
  const monthMap = new Map();

  // Get current month to exclude it
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    // Skip the current (incomplete) month
    if (monthKey === currentMonth) {
      continue;
    }

    // Keep the latest entry for each month
    if (!monthMap.has(monthKey) || new Date(entry.timestamp) > new Date(monthMap.get(monthKey).timestamp)) {
      monthMap.set(monthKey, {
        month: monthKey,
        ...entry
      });
    }
  }

  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// GET /api/metrics - Get all historical metrics
router.get('/', (req, res) => {
  try {
    const entries = readMetricsLog();
    res.json({
      entries,
      count: entries.length
    });
  } catch (err) {
    console.error('Error reading metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/weekly - Get metrics grouped by week
router.get('/weekly', (req, res) => {
  try {
    const entries = readMetricsLog();
    const weekly = groupByWeek(entries);

    // Calculate week-over-week changes for the most recent weeks
    let currentWeek = null;
    let previousWeek = null;

    if (weekly.length >= 1) {
      currentWeek = weekly[weekly.length - 1];
    }
    if (weekly.length >= 2) {
      previousWeek = weekly[weekly.length - 2];
    }

    // Calculate changes
    let changes = null;
    if (currentWeek && previousWeek) {
      const curr = currentWeek.metrics;
      const prev = previousWeek.metrics;

      changes = {
        volume7Day: {
          current: curr.volume7Day,
          previous: prev.volume7Day,
          change: curr.volume7Day - prev.volume7Day,
          percentChange: prev.volume7Day > 0 ? ((curr.volume7Day - prev.volume7Day) / prev.volume7Day) * 100 : 0
        },
        activeExchanges: {
          current: curr.activeExchanges,
          previous: prev.activeExchanges,
          change: curr.activeExchanges - prev.activeExchanges
        },
        totalPairs: {
          current: curr.totalPairs,
          previous: prev.totalPairs,
          change: curr.totalPairs - prev.totalPairs
        },
        thresholds: {
          '1Mto5M': {
            current: curr.exchangeThresholds['1Mto5M'],
            previous: prev.exchangeThresholds['1Mto5M'],
            change: curr.exchangeThresholds['1Mto5M'] - prev.exchangeThresholds['1Mto5M']
          },
          '5Mto25M': {
            current: curr.exchangeThresholds['5Mto25M'],
            previous: prev.exchangeThresholds['5Mto25M'],
            change: curr.exchangeThresholds['5Mto25M'] - prev.exchangeThresholds['5Mto25M']
          },
          'over25M': {
            current: curr.exchangeThresholds['over25M'],
            previous: prev.exchangeThresholds['over25M'],
            change: curr.exchangeThresholds['over25M'] - prev.exchangeThresholds['over25M']
          }
        }
      };
    }

    res.json({
      weekly,
      currentWeek,
      previousWeek,
      changes
    });
  } catch (err) {
    console.error('Error reading weekly metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/monthly - Get metrics grouped by month
router.get('/monthly', (req, res) => {
  try {
    const entries = readMetricsLog();
    const monthly = groupByMonth(entries);

    // Calculate month-over-month changes
    let currentMonth = null;
    let previousMonth = null;

    if (monthly.length >= 1) {
      currentMonth = monthly[monthly.length - 1];
    }
    if (monthly.length >= 2) {
      previousMonth = monthly[monthly.length - 2];
    }

    // Calculate changes
    let changes = null;
    if (currentMonth && previousMonth) {
      const curr = currentMonth.metrics;
      const prev = previousMonth.metrics;

      changes = {
        volume30Day: {
          current: curr.volume30Day || 0,
          previous: prev.volume30Day || 0,
          change: (curr.volume30Day || 0) - (prev.volume30Day || 0),
          percentChange: (prev.volume30Day || 0) > 0 ? (((curr.volume30Day || 0) - (prev.volume30Day || 0)) / (prev.volume30Day || 0)) * 100 : 0
        },
        activeExchanges: {
          current: curr.activeExchanges,
          previous: prev.activeExchanges,
          change: curr.activeExchanges - prev.activeExchanges
        },
        totalPairs: {
          current: curr.totalPairs,
          previous: prev.totalPairs,
          change: curr.totalPairs - prev.totalPairs
        },
        thresholds: {
          '1Mto5M': {
            current: curr.exchangeThresholds['1Mto5M'],
            previous: prev.exchangeThresholds['1Mto5M'],
            change: curr.exchangeThresholds['1Mto5M'] - prev.exchangeThresholds['1Mto5M']
          },
          '5Mto25M': {
            current: curr.exchangeThresholds['5Mto25M'],
            previous: prev.exchangeThresholds['5Mto25M'],
            change: curr.exchangeThresholds['5Mto25M'] - prev.exchangeThresholds['5Mto25M']
          },
          'over25M': {
            current: curr.exchangeThresholds['over25M'],
            previous: prev.exchangeThresholds['over25M'],
            change: curr.exchangeThresholds['over25M'] - prev.exchangeThresholds['over25M']
          }
        }
      };
    }

    res.json({
      monthly,
      currentMonth,
      previousMonth,
      changes
    });
  } catch (err) {
    console.error('Error reading monthly metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
