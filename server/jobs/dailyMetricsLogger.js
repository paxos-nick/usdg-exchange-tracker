/**
 * Daily metrics logger job
 * Runs at 11:59 PM UTC daily to log weekly trending metrics
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Import exchange services
const krakenService = require('../services/kraken');
const bullishService = require('../services/bullish');
const gateService = require('../services/gate');
const kucoinService = require('../services/kucoin');
const bitmartService = require('../services/bitmart');
const okxService = require('../services/okx');

// Import metrics calculator
const { calculateAllMetrics } = require('../utils/metricsCalculator');

// All supported exchanges
const EXCHANGES = ['kraken', 'bullish', 'gate', 'kucoin', 'bitmart', 'okx'];

// Service map
const services = {
  kraken: krakenService,
  bullish: bullishService,
  gate: gateService,
  kucoin: kucoinService,
  bitmart: bitmartService,
  okx: okxService
};

// Log file path
const LOG_FILE = path.join(__dirname, '../logs/weekly-metrics.jsonl');

/**
 * Fetch aggregated data from all exchanges
 * (Replicates the logic from /api/aggregated endpoint)
 */
async function fetchAggregatedData() {
  // Fetch from all exchanges in parallel
  const results = await Promise.all(
    EXCHANGES.map(exchangeName =>
      services[exchangeName].getAggregatedVolume().catch(err => {
        console.error(`[MetricsLogger] ${exchangeName} error:`, err.message);
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

  return {
    dailyVolume,
    exchanges: EXCHANGES,
    pairsByExchange
  };
}

/**
 * Append metrics to log file as JSONL
 */
function appendToLog(metrics) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    metrics
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  // Ensure logs directory exists
  const logsDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  fs.appendFileSync(LOG_FILE, logLine);
  console.log(`[MetricsLogger] Logged metrics at ${logEntry.timestamp}`);
}

/**
 * Run the metrics logging job
 */
async function runMetricsJob() {
  console.log('[MetricsLogger] Starting daily metrics collection...');

  try {
    // Fetch fresh data from all exchanges
    const aggregatedData = await fetchAggregatedData();

    // Calculate metrics
    const metrics = calculateAllMetrics(aggregatedData);

    // Log to file
    appendToLog(metrics);

    console.log('[MetricsLogger] Metrics collection complete:', {
      volume7Day: `$${(metrics.volume7Day / 1e6).toFixed(2)}M`,
      activeExchanges: metrics.activeExchanges,
      totalPairs: metrics.totalPairs,
      thresholds: metrics.exchangeThresholds
    });
  } catch (err) {
    console.error('[MetricsLogger] Error collecting metrics:', err);
  }
}

/**
 * Start the scheduled job
 * @param {string} schedule - Cron schedule expression (default: 11:59 PM UTC daily)
 */
function startScheduler(schedule = '59 23 * * *') {
  console.log(`[MetricsLogger] Scheduling daily metrics job: ${schedule} UTC`);

  cron.schedule(schedule, runMetricsJob, {
    timezone: 'UTC'
  });

  console.log('[MetricsLogger] Scheduler started. Next run at 23:59 UTC');
}

module.exports = {
  startScheduler,
  runMetricsJob // Export for manual testing
};
