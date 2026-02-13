/**
 * Depth and spread calculation utilities
 */

const STABLECOINS = ['USDG', 'USDT', 'USDC', 'USD', 'EUR'];

/**
 * Classify a pair as 'stablecoin' or 'risk'
 */
function classifyPair(base, quote) {
  const cleanBase = base.replace(/^[XZ]/, '').toUpperCase();
  const normalBase = base.toUpperCase();
  if (STABLECOINS.includes(normalBase) || STABLECOINS.includes(cleanBase)) {
    return 'stablecoin';
  }
  return 'risk';
}

/**
 * Get BPS levels for a pair type
 */
function getBpsLevels(pairType) {
  if (pairType === 'stablecoin') {
    return [2, 5, 10, 100];
  }
  return [10, 25, 50, 100];
}

/**
 * Calculate depth metrics from orderbook data
 * @param {Array} bids - [[price, qty], ...] sorted descending by price
 * @param {Array} asks - [[price, qty], ...] sorted ascending by price
 * @param {Array} bpsLevels - e.g. [2, 5, 10, 100]
 * @returns {{ midPrice, spreadBps, bidDepth, askDepth }}
 */
function calculateDepthMetrics(bids, asks, bpsLevels) {
  const bestBid = bids[0][0];
  const bestAsk = asks[0][0];
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadBps = ((bestAsk - bestBid) / midPrice) * 10000;

  const bidDepth = {};
  const askDepth = {};

  for (const level of bpsLevels) {
    // Bid side: sum USD value of all bids within `level` bps below mid
    const lowerBound = midPrice * (1 - level / 10000);
    let bidTotal = 0;
    for (const [price, qty] of bids) {
      if (price >= lowerBound) {
        bidTotal += price * qty;
      } else {
        break;
      }
    }
    bidDepth[level] = bidTotal;

    // Ask side: sum USD value of all asks within `level` bps above mid
    const upperBound = midPrice * (1 + level / 10000);
    let askTotal = 0;
    for (const [price, qty] of asks) {
      if (price <= upperBound) {
        askTotal += price * qty;
      } else {
        break;
      }
    }
    askDepth[level] = askTotal;
  }

  return { midPrice, spreadBps, bidDepth, askDepth };
}

module.exports = {
  STABLECOINS,
  classifyPair,
  getBpsLevels,
  calculateDepthMetrics
};
