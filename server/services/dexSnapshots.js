const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { getAllPools: getOrcaPools } = require('./orca');
const { getAllPools: getCurvePools } = require('./curve');
const { getLendingData: getKaminoLending } = require('./kamino');
const { getLendingData: getAaveLending } = require('./aave');

const SNAPSHOT_FILE = path.join(__dirname, '..', 'logs', 'dex-snapshots.jsonl');

function loadSnapshots() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return [];
  const lines = fs.readFileSync(SNAPSHOT_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

function getHistory() {
  return loadSnapshots().sort((a, b) => a.date.localeCompare(b.date));
}

async function takeSnapshot() {
  const today = new Date().toISOString().split('T')[0];
  const existing = loadSnapshots();

  if (existing.some(s => s.date === today)) {
    console.log(`[DexSnapshot] Already have snapshot for ${today}, skipping`);
    return null;
  }

  const [orcaPools, curvePools] = await Promise.all([
    getOrcaPools(),
    getCurvePools()
  ]);
  const allPools = [...orcaPools, ...curvePools];

  const lendingResults = [];
  try {
    const kamino = await getKaminoLending();
    if (kamino) lendingResults.push(kamino);
  } catch (err) {
    console.error('[DexSnapshot] Error fetching Kamino lending:', err.message);
  }
  try {
    const aave = await getAaveLending();
    if (aave) lendingResults.push(aave);
  } catch (err) {
    console.error('[DexSnapshot] Error fetching AAVE lending:', err.message);
  }

  const snapshot = {
    date: today,
    pools: allPools.map(p => ({
      address: p.address,
      name: p.name,
      type: p.type,
      chain: p.chain,
      venue: p.venue || (p.chain === 'ethereum' ? 'Curve' : 'Orca'),
      volume24h: p.stats['24h'].volume,
      fees24h: p.stats['24h'].fees,
      tvl: p.tvlUsd,
      usdgBalance: p.usdgBalance,
      yield24h: p.stats['24h'].yieldOverTvl,
      price: p.price
    })),
    lending: lendingResults.map(l => ({
      name: l.name,
      chain: l.chain,
      venue: l.venue || (l.chain === 'ethereum' ? 'AAVE' : 'Kamino'),
      depositTvl: l.depositTvl,
      totalBorrows: l.totalBorrows,
      supplyAPY: l.supplyAPY
    }))
  };

  // Ensure logs directory exists
  const logsDir = path.dirname(SNAPSHOT_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  fs.appendFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot) + '\n');
  console.log(`[DexSnapshot] Saved snapshot for ${today}: ${allPools.length} pools, ${snapshot.lending.length} lending reserves`);
  return snapshot;
}

function startScheduler() {
  // Attempt snapshot every hour — dedup logic in takeSnapshot prevents multiple writes per day
  cron.schedule('5 * * * *', async () => {
    console.log('[DexSnapshot] Running hourly snapshot check...');
    try {
      await takeSnapshot();
    } catch (err) {
      console.error('[DexSnapshot] Error taking snapshot:', err.message);
    }
  }, { timezone: 'UTC' });

  // Take initial snapshot on startup if today hasn't been captured
  setTimeout(async () => {
    try {
      await takeSnapshot();
    } catch (err) {
      console.error('[DexSnapshot] Error taking initial snapshot:', err.message);
    }
  }, 5000);

  console.log('[DexSnapshot] Scheduler started. Snapshot checks run hourly (once per day written).');
}

module.exports = { takeSnapshot, getHistory, loadSnapshots, startScheduler };
