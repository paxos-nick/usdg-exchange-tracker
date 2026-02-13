const axios = require('axios');

const BASE_URL = 'https://api.kraken.com/0/public';

// Rate limiting: 1 request per second
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check if a pair needs volume conversion (base currency is not a stablecoin)
function needsVolumeConversion(pairInfo) {
  const stablecoins = ['USDG', 'USDT', 'USDC', 'USD', 'EUR', 'ZUSD', 'ZEUR'];
  // Kraken prefixes some assets with Z or X
  const base = (pairInfo.base || '').toUpperCase();
  const cleanBase = base.replace(/^[XZ]/, '');
  return !stablecoins.includes(base) && !stablecoins.includes(cleanBase);
}

async function getUSDGPairs() {
  const response = await axios.get(`${BASE_URL}/AssetPairs`);

  if (response.data.error && response.data.error.length > 0) {
    throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
  }

  const allPairs = response.data.result;
  const usdgPairs = [];

  for (const [pairName, pairInfo] of Object.entries(allPairs)) {
    // Check if pair contains USDG (could be base or quote)
    if (pairName.includes('USDG') ||
        (pairInfo.base && pairInfo.base.includes('USDG')) ||
        (pairInfo.quote && pairInfo.quote.includes('USDG'))) {
      usdgPairs.push({
        symbol: pairName,
        wsname: pairInfo.wsname || pairName,
        base: pairInfo.base,
        quote: pairInfo.quote
      });
    }
  }

  return usdgPairs;
}

async function getDailyVolume(pair) {
  // interval=1440 is daily (1440 minutes = 24 hours)
  const response = await axios.get(`${BASE_URL}/OHLC`, {
    params: {
      pair: pair,
      interval: 1440
    }
  });

  if (response.data.error && response.data.error.length > 0) {
    throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
  }

  const result = response.data.result;
  // Get the first key that's not 'last'
  const dataKey = Object.keys(result).find(k => k !== 'last');

  if (!dataKey) {
    return [];
  }

  const candles = result[dataKey];

  // Each candle: [timestamp, open, high, low, close, vwap, volume, count]
  return candles.map(candle => {
    const close = parseFloat(candle[4]);
    const rawVolume = parseFloat(candle[6]);
    return {
      timestamp: candle[0] * 1000, // Convert to milliseconds
      date: new Date(candle[0] * 1000).toISOString().split('T')[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: close,
      vwap: parseFloat(candle[5]),
      rawVolume: rawVolume,
      volume: rawVolume, // Will be converted in aggregation if needed
      count: candle[7]
    };
  });
}

async function getAggregatedVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'kraken',
      pairs: [],
      dailyVolume: []
    };
  }

  // Map to aggregate volume by date
  const volumeByDate = new Map();
  const pairNames = [];

  for (const pair of pairs) {
    try {
      pairNames.push(pair.wsname || pair.symbol);
      const dailyData = await getDailyVolume(pair.symbol);
      const convertVolume = needsVolumeConversion(pair);

      for (const day of dailyData) {
        const existing = volumeByDate.get(day.date) || 0;
        // Convert to USD value if needed (volume * price)
        const usdVolume = convertVolume ? day.rawVolume * day.close : day.rawVolume;
        volumeByDate.set(day.date, existing + usdVolume);
      }

      // Rate limit: wait 1 second between requests
      await delay(1000);
    } catch (err) {
      console.error(`Error fetching volume for ${pair.symbol}:`, err.message);
    }
  }

  // Convert to sorted array
  const dailyVolume = Array.from(volumeByDate.entries())
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    exchange: 'kraken',
    pairs: pairNames,
    dailyVolume
  };
}

async function getPerPairVolume() {
  const pairs = await getUSDGPairs();

  if (pairs.length === 0) {
    return {
      exchange: 'kraken',
      pairs: [],
      volumeByPair: {}
    };
  }

  const volumeByPair = {};
  const pairNames = [];

  for (const pair of pairs) {
    try {
      const displayName = pair.wsname || pair.symbol;
      pairNames.push(displayName);
      const dailyData = await getDailyVolume(pair.symbol);
      const convertVolume = needsVolumeConversion(pair);

      volumeByPair[displayName] = dailyData.map(d => ({
        date: d.date,
        // Convert to USD value if needed (volume * price)
        volume: convertVolume ? d.rawVolume * d.close : d.rawVolume
      }));

      // Rate limit: wait 1 second between requests
      await delay(1000);
    } catch (err) {
      console.error(`Error fetching volume for ${pair.symbol}:`, err.message);
    }
  }

  return {
    exchange: 'kraken',
    pairs: pairNames,
    volumeByPair
  };
}

async function getOrderbook(pairSymbol) {
  const response = await axios.get(`${BASE_URL}/Depth`, {
    params: { pair: pairSymbol, count: 500 }
  });

  if (response.data.error && response.data.error.length > 0) {
    throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
  }

  const result = response.data.result;
  const dataKey = Object.keys(result).find(k => k !== 'last');

  if (!dataKey) {
    return { bids: [], asks: [] };
  }

  const raw = result[dataKey];
  return {
    bids: raw.bids.map(b => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: raw.asks.map(a => [parseFloat(a[0]), parseFloat(a[1])])
  };
}

module.exports = {
  getUSDGPairs,
  getDailyVolume,
  getAggregatedVolume,
  getPerPairVolume,
  getOrderbook
};
