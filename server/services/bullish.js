const axios = require('axios');

const BASE_URL = 'https://api.exchange.bullish.com/trading-api/v1';

// Rate limiting helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getUSDGPairs() {
  const response = await axios.get(`${BASE_URL}/markets`, {
    headers: { 'accept': 'application/json' }
  });

  const markets = response.data;
  const usdgPairs = [];

  // Filter for pairs containing USDG
  for (const market of markets) {
    const symbol = market.symbol || market.marketId || '';
    if (symbol.includes('USDG')) {
      usdgPairs.push({
        symbol: symbol,
        baseAsset: market.baseAsset || market.baseCurrency,
        quoteAsset: market.quoteAsset || market.quoteCurrency
      });
    }
  }

  return usdgPairs;
}

async function getDailyVolume(symbol, startDate, endDate) {
  // Format dates for the API
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default: 1 year ago
  const end = endDate || new Date();

  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const response = await axios.get(`${BASE_URL}/markets/${symbol}/candle`, {
    params: {
      'createdAtDatetime[gte]': startISO,
      'createdAtDatetime[lte]': endISO,
      'timeBucket': '1d'
    },
    headers: { 'accept': 'application/json' }
  });

  const candles = response.data;

  // Handle different response structures
  const candleArray = Array.isArray(candles) ? candles : (candles.data || candles.candles || []);

  return candleArray.map(candle => {
    // Bullish API returns createdAtDatetime (ISO string) and createdAtTimestamp (ms)
    const datetime = candle.createdAtDatetime || candle.datetime || candle.timestamp;
    const date = datetime ? datetime.split('T')[0] : null;
    const close = parseFloat(candle.close || 0);
    const rawVolume = parseFloat(candle.volume || 0);

    return {
      timestamp: candle.createdAtTimestamp || datetime,
      date: date,
      open: parseFloat(candle.open || 0),
      high: parseFloat(candle.high || 0),
      low: parseFloat(candle.low || 0),
      close: close,
      rawVolume: rawVolume,
      volume: rawVolume // Will be converted to USD in aggregation functions
    };
  }).filter(c => c.date); // Filter out entries without valid dates
}

// Check if a pair needs volume conversion (base currency is not a stablecoin)
function needsVolumeConversion(symbol) {
  // If the pair starts with a non-stablecoin asset, volume is in that asset and needs conversion
  // e.g., BTCUSDG -> volume is in BTC, needs conversion
  // e.g., USDGUSDC -> volume is in USDG, no conversion needed
  const stablecoins = ['USDG', 'USDT', 'USDC', 'USD', 'EUR'];
  const upperSymbol = symbol.toUpperCase();

  // Check if symbol starts with a stablecoin
  for (const stable of stablecoins) {
    if (upperSymbol.startsWith(stable)) {
      return false; // No conversion needed
    }
  }
  return true; // Needs conversion (e.g., BTCUSDG)
}

async function getAggregatedVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'bullish',
      pairs: [],
      dailyVolume: []
    };
  }

  // Map to aggregate volume by date
  const volumeByDate = new Map();
  const pairNames = [];

  for (const pair of pairs) {
    try {
      pairNames.push(pair.symbol);
      const dailyData = await getDailyVolume(pair.symbol);
      const convertVolume = needsVolumeConversion(pair.symbol);

      for (const day of dailyData) {
        if (day.date) {
          const existing = volumeByDate.get(day.date) || 0;
          // Convert to USD value if needed (volume * price)
          const usdVolume = convertVolume ? day.rawVolume * day.close : day.rawVolume;
          volumeByDate.set(day.date, existing + usdVolume);
        }
      }

      // Rate limit: wait between requests
      await delay(500);
    } catch (err) {
      console.error(`Error fetching volume for ${pair.symbol}:`, err.message);
    }
  }

  // Convert to sorted array
  const dailyVolume = Array.from(volumeByDate.entries())
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    exchange: 'bullish',
    pairs: pairNames,
    dailyVolume
  };
}

async function getPerPairVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'bullish',
      pairs: [],
      volumeByPair: {}
    };
  }

  const volumeByPair = {};
  const pairNames = [];

  for (const pair of pairs) {
    try {
      pairNames.push(pair.symbol);
      const dailyData = await getDailyVolume(pair.symbol);
      const convertVolume = needsVolumeConversion(pair.symbol);

      volumeByPair[pair.symbol] = dailyData.map(d => ({
        date: d.date,
        // Convert to USD value if needed (volume * price)
        volume: convertVolume ? d.rawVolume * d.close : d.rawVolume
      }));

      // Rate limit: wait between requests
      await delay(500);
    } catch (err) {
      console.error(`Error fetching volume for ${pair.symbol}:`, err.message);
    }
  }

  return {
    exchange: 'bullish',
    pairs: pairNames,
    volumeByPair
  };
}

module.exports = {
  getUSDGPairs,
  getDailyVolume,
  getAggregatedVolume,
  getPerPairVolume
};
