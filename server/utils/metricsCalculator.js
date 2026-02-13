/**
 * Metrics calculator for USDG exchange volume dashboard
 * Used by daily logging job to calculate weekly trending metrics
 */

/**
 * Calculate total volume for the last N days
 * @param {Array} dailyVolume - Array of { date, volume, byExchange }
 * @param {number} days - Number of days to sum (default 7)
 * @returns {number} Total volume for the period
 */
function calculateNDayVolume(dailyVolume, days = 7) {
  const lastNDays = dailyVolume.slice(-days);
  return lastNDays.reduce((sum, day) => sum + day.volume, 0);
}

/**
 * Count active exchanges (those with non-zero volume in the last 30 days)
 * @param {Array} dailyVolume - Array of { date, volume, byExchange }
 * @param {Array} exchanges - List of exchange names
 * @returns {number} Count of active exchanges
 */
function countActiveExchanges(dailyVolume, exchanges) {
  const last30Days = dailyVolume.slice(-30);

  return exchanges.filter(exchange => {
    const totalVolume = last30Days.reduce((sum, day) => {
      return sum + (day.byExchange?.[exchange] || 0);
    }, 0);
    return totalVolume > 0;
  }).length;
}

/**
 * Count total USDG pairs across all exchanges
 * @param {Object} pairsByExchange - { exchangeName: [pairs] }
 * @returns {number} Total pair count
 */
function countTotalPairs(pairsByExchange) {
  return Object.values(pairsByExchange).flat().length;
}

/**
 * Calculate 30-day average daily volume per exchange
 * @param {Array} dailyVolume - Array of { date, volume, byExchange }
 * @param {Array} exchanges - List of exchange names
 * @returns {Object} { exchangeName: averageVolume }
 */
function calculateExchangeAverages(dailyVolume, exchanges) {
  const last30Days = dailyVolume.slice(-30);
  const averages = {};

  for (const exchange of exchanges) {
    const totalVolume = last30Days.reduce((sum, day) => {
      return sum + (day.byExchange?.[exchange] || 0);
    }, 0);
    averages[exchange] = last30Days.length > 0 ? totalVolume / 30 : 0;
  }

  return averages;
}

/**
 * Count exchanges by volume threshold (exclusive buckets)
 * @param {Object} exchangeAverages - { exchangeName: averageVolume }
 * @returns {Object} { '1Mto5M': count, '5Mto25M': count, 'over25M': count }
 */
function countExchangesByThreshold(exchangeAverages) {
  const values = Object.values(exchangeAverages);

  return {
    '1Mto5M': values.filter(avg => avg >= 1_000_000 && avg < 5_000_000).length,
    '5Mto25M': values.filter(avg => avg >= 5_000_000 && avg < 25_000_000).length,
    'over25M': values.filter(avg => avg >= 25_000_000).length
  };
}

/**
 * Calculate all metrics from aggregated data
 * @param {Object} aggregatedData - Data from /api/aggregated endpoint
 * @returns {Object} All calculated metrics
 */
function calculateAllMetrics(aggregatedData) {
  const { dailyVolume, exchanges, pairsByExchange } = aggregatedData;

  const volume7Day = calculateNDayVolume(dailyVolume, 7);
  const volume30Day = calculateNDayVolume(dailyVolume, 30);
  const activeExchanges = countActiveExchanges(dailyVolume, exchanges);
  const totalPairs = countTotalPairs(pairsByExchange);
  const exchangeAverages = calculateExchangeAverages(dailyVolume, exchanges);
  const exchangeThresholds = countExchangesByThreshold(exchangeAverages);

  return {
    volume7Day,
    volume30Day,
    activeExchanges,
    totalPairs,
    exchangeThresholds
  };
}

module.exports = {
  calculateNDayVolume,
  countActiveExchanges,
  countTotalPairs,
  calculateExchangeAverages,
  countExchangesByThreshold,
  calculateAllMetrics
};
