/**
 * Backfill historical metrics for the past N weeks
 *
 * Usage: node scripts/backfillMetrics.js [weeks]
 * Default: 4 weeks
 */

const fs = require('fs');
const path = require('path');

// Import exchange services
const krakenService = require('../services/kraken');
const bullishService = require('../services/bullish');
const gateService = require('../services/gate');
const kucoinService = require('../services/kucoin');
const bitmartService = require('../services/bitmart');
const okxService = require('../services/okx');

const EXCHANGES = ['kraken', 'bullish', 'gate', 'kucoin', 'bitmart', 'okx'];

const services = {
  kraken: krakenService,
  bullish: bullishService,
  gate: gateService,
  kucoin: kucoinService,
  bitmart: bitmartService,
  okx: okxService
};

const LOG_FILE = path.join(__dirname, '../logs/weekly-metrics.jsonl');

/**
 * Fetch all historical data from exchanges
 */
async function fetchAllHistoricalData() {
  console.log('Fetching historical data from all exchanges...');

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

  return { dailyVolume, pairsByExchange };
}

/**
 * Calculate metrics for a specific date given historical data
 */
function calculateMetricsForDate(targetDate, dailyVolume, pairsByExchange) {
  // Filter data up to and including the target date
  const dataUpToDate = dailyVolume.filter(d => d.date <= targetDate);

  if (dataUpToDate.length === 0) {
    return null;
  }

  // Get the last 7 days of data (relative to target date)
  const last7Days = dataUpToDate.slice(-7);
  const volume7Day = last7Days.reduce((sum, d) => sum + d.volume, 0);

  // Get the last 30 days for exchange averages
  const last30Days = dataUpToDate.slice(-30);

  // Calculate calendar month volume (sum of all days in the same month as targetDate)
  const targetMonth = targetDate.slice(0, 7); // "YYYY-MM"
  const monthDays = dailyVolume.filter(d => d.date.startsWith(targetMonth) && d.date <= targetDate);
  const volumeMonth = monthDays.reduce((sum, d) => sum + d.volume, 0);

  // Calculate 30-day average per exchange
  const exchangeAverages = {};
  for (const exchange of EXCHANGES) {
    const totalVolume = last30Days.reduce((sum, day) => {
      return sum + (day.byExchange?.[exchange] || 0);
    }, 0);
    exchangeAverages[exchange] = last30Days.length > 0 ? totalVolume / Math.min(30, last30Days.length) : 0;
  }

  // Count active exchanges (non-zero in last 30 days)
  const activeExchanges = EXCHANGES.filter(exchange => {
    const totalVolume = last30Days.reduce((sum, day) => {
      return sum + (day.byExchange?.[exchange] || 0);
    }, 0);
    return totalVolume > 0;
  }).length;

  // Count total pairs
  const totalPairs = Object.values(pairsByExchange).flat().length;

  // Count by threshold
  const avgValues = Object.values(exchangeAverages);
  const exchangeThresholds = {
    '1Mto5M': avgValues.filter(avg => avg >= 1_000_000 && avg < 5_000_000).length,
    '5Mto25M': avgValues.filter(avg => avg >= 5_000_000 && avg < 25_000_000).length,
    'over25M': avgValues.filter(avg => avg >= 25_000_000).length
  };

  return {
    volume7Day,
    volume30Day,
    activeExchanges,
    totalPairs,
    exchangeThresholds
  };
}

/**
 * Generate dates for the past N weeks (at 23:59 UTC each day)
 */
function getPastDates(weeks) {
  const dates = [];
  const now = new Date();

  for (let i = weeks * 7; i >= 1; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    date.setUTCHours(23, 59, 0, 0);

    // Format as YYYY-MM-DD for comparison with dailyVolume
    const dateStr = date.toISOString().split('T')[0];

    dates.push({
      dateStr,
      timestamp: date.toISOString()
    });
  }

  return dates;
}

/**
 * Main backfill function
 */
async function backfill(weeks = 4) {
  console.log(`\nBackfilling metrics for the past ${weeks} weeks...\n`);

  // Fetch all historical data
  const { dailyVolume, pairsByExchange } = await fetchAllHistoricalData();
  console.log(`Fetched ${dailyVolume.length} days of historical data\n`);

  // Get dates to backfill
  const dates = getPastDates(weeks);
  console.log(`Generating ${dates.length} historical entries...\n`);

  // Ensure logs directory exists
  const logsDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Read existing log to avoid duplicates
  let existingTimestamps = new Set();
  if (fs.existsSync(LOG_FILE)) {
    const existingContent = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = existingContent.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Extract just the date part for comparison
        const dateStr = entry.timestamp.split('T')[0];
        existingTimestamps.add(dateStr);
      } catch (e) {
        // Skip malformed lines
      }
    }
  }

  // Generate and append entries
  let added = 0;
  let skipped = 0;

  for (const { dateStr, timestamp } of dates) {
    // Skip if we already have an entry for this date
    if (existingTimestamps.has(dateStr)) {
      skipped++;
      continue;
    }

    const metrics = calculateMetricsForDate(dateStr, dailyVolume, pairsByExchange);

    if (!metrics) {
      console.log(`  No data available for ${dateStr}`);
      continue;
    }

    const logEntry = {
      timestamp,
      metrics
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
    added++;

    console.log(`  ${dateStr}: 7d=$${(metrics.volume7Day / 1e6).toFixed(1)}M, 30d=$${(metrics.volume30Day / 1e6).toFixed(1)}M, ` +
      `exchanges=${metrics.activeExchanges}, ` +
      `thresholds=[${metrics.exchangeThresholds['1Mto5M']}, ${metrics.exchangeThresholds['5Mto25M']}, ${metrics.exchangeThresholds['over25M']}]`);
  }

  console.log(`\nBackfill complete: ${added} entries added, ${skipped} skipped (already existed)`);
  console.log(`Log file: ${LOG_FILE}`);
}

// Run the backfill
const weeks = parseInt(process.argv[2]) || 4;
backfill(weeks).catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
