const axios = require('axios');

const BASE_URL = 'https://api.bitget.com/api/v2/spot/market';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Bitget candles: [ts(ms), open, high, low, close, baseVol, quoteVol(USDT)]
// Returns up to 1000 candles per request; paginates using endTime parameter.
async function getDailyVolumeUsdt(symbol) {
  const all = [];
  let endTime = Date.now();

  for (let page = 0; page < 10; page++) {
    const response = await axios.get(`${BASE_URL}/candles`, {
      params: { symbol, granularity: '1day', limit: 200, endTime }
    });
    if (response.data.code !== '00000') throw new Error(`Bitget error: ${response.data.msg}`);
    const batch = response.data.data || [];
    if (!batch.length) break;
    all.push(...batch);
    // batch is oldest-first; paginate backwards from the oldest candle
    const oldest = parseInt(batch[0][0]);
    if (oldest <= endTime - 200 * 86400000) break; // no more history
    endTime = oldest - 1;
    await delay(200);
  }

  const byDate = new Map();
  for (const c of all) {
    const date = new Date(parseInt(c[0])).toISOString().split('T')[0];
    byDate.set(date, { date, volume: parseFloat(c[6]) }); // c[6] = USDT quote volume
  }
  return Array.from(byDate.values()).filter(d => d.volume > 0).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { getDailyVolumeUsdt };
