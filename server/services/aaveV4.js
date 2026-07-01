/**
 * Aave v4 USDG borrowing analytics.
 *
 * Architecture: Aave v4 uses a Hub + Spoke model (not the v3 Pool/DataProvider pattern).
 * - CORE_HUB holds assets and interest rates. USDG = assetId 8.
 * - Multiple Spokes each have their own reserveId for the same asset.
 * - Total USDG borrowed = sum of getReserveTotalDebt() across all spokes.
 * - Borrow rate = getAssetDrawnRate(assetId) from the Hub (same rate for all spokes).
 *
 * Uses PublicNode free Ethereum archive RPC (same pattern as paxg.js).
 */

const axios = require('axios');

// Use dRPC free tier for archive access (PublicNode rate-limits on high backfill volume)
const RPC_URL = 'https://eth.drpc.org';

// Aave v4 CORE_HUB on Ethereum mainnet
const CORE_HUB = '0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9';

// USDG assetId in CORE_HUB (index 8, verified on-chain)
const USDG_ASSET_ID = 8;

// v4 Spokes that have USDG borrowing (verified on-chain with reserveIds)
const USDG_SPOKES = [
  { name: 'Main',        address: '0x94e7A5dCbE816e498b89aB752661904E2F56c485', reserveId: 11 },
  { name: 'Gold',        address: '0x65407b940966954b23dfA3caA5C0702bB42984DC', reserveId: 3  },
  { name: 'Forex',       address: '0xD8B93635b8C6d0fF98CbE90b5988E3F2d1Cd9da1', reserveId: 4  },
  { name: 'USDG-Pendle', address: '0x956d8e0A89cfa3744428C4641b5a53B56167a7f9', reserveId: 3  },
];

// Selectors (keccak256 of function signatures)
const SEL_GET_ASSET_DRAWN_RATE      = '0x8accc4a3'; // getAssetDrawnRate(uint256)
const SEL_GET_RESERVE_TOTAL_DEBT    = '0x1cdc762c'; // getReserveTotalDebt(uint256)
const SEL_GET_RESERVE_SUPPLIED      = '0x2fd00527'; // getReserveSuppliedAssets(uint256)

const RAY             = BigInt('1000000000000000000000000000'); // 1e27
const SECONDS_PER_YEAR = 31536000;
const USDG_DECIMALS   = 6;

async function rpcCall(method, params) {
  const r = await axios.post(RPC_URL, {
    jsonrpc: '2.0', method, params, id: 1
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
  if (r.data.error) throw new Error(`RPC error: ${r.data.error.message}`);
  return r.data.result;
}

function hex32(n) {
  return n.toString(16).padStart(64, '0');
}

// Get current block number and timestamp for reference (used in block estimation)
async function getCurrentBlockInfo() {
  const blockHex = await rpcCall('eth_blockNumber', []);
  const blockNumber = parseInt(blockHex, 16);
  const block = await rpcCall('eth_getBlockByNumber', [blockHex, false]);
  const timestamp = parseInt(block.timestamp, 16);
  return { blockNumber, timestamp };
}

// Estimate the block number at the start of a given UTC date
function estimateBlockForDate(dateStr, refBlockNumber, refTimestamp) {
  const targetTs = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
  const delta = Math.round((targetTs - refTimestamp) / 12); // ~12s avg block time
  return Math.max(1, refBlockNumber + delta);
}

// Query total USDG debt and borrow rate at a specific block
async function getUsdgReserveDataAtBlock(blockNumber) {
  const blockHex = '0x' + blockNumber.toString(16);

  const drawnRateHex = await rpcCall('eth_call', [
    { to: CORE_HUB, data: SEL_GET_ASSET_DRAWN_RATE + hex32(USDG_ASSET_ID) }, blockHex
  ]);
  const drawnRate = BigInt('0x' + drawnRateHex.slice(2));
  const ratePerSec = Number(drawnRate) / Number(RAY) / SECONDS_PER_YEAR;
  const variableBorrowApy = (Math.pow(1 + ratePerSec, SECONDS_PER_YEAR) - 1) * 100;

  const spokeDebts = await Promise.all(USDG_SPOKES.map(async (spoke) => {
    try {
      const debtHex = await rpcCall('eth_call', [
        { to: spoke.address, data: SEL_GET_RESERVE_TOTAL_DEBT + hex32(spoke.reserveId) }, blockHex
      ]);
      const rawDebt = Number(BigInt('0x' + debtHex.slice(2)));
      return { name: spoke.name, debt: rawDebt / Math.pow(10, USDG_DECIMALS) };
    } catch {
      return { name: spoke.name, debt: 0 };
    }
  }));

  const totalVariableDebt = spokeDebts.reduce((s, d) => s + d.debt, 0);
  const annualRate        = Number(drawnRate) / Number(RAY);
  const dailyInterestCost = totalVariableDebt * annualRate / 365;

  // Supply TVL — only MAIN spoke has meaningful USDG supply currently
  let totalSupply = 0;
  try {
    const supplyHex = await rpcCall('eth_call', [
      { to: USDG_SPOKES[0].address, data: SEL_GET_RESERVE_SUPPLIED + hex32(USDG_SPOKES[0].reserveId) }, blockHex
    ]);
    totalSupply = Number(BigInt('0x' + supplyHex.slice(2))) / Math.pow(10, USDG_DECIMALS);
  } catch { /* ignore */ }

  // Organic supply APY = borrowAPY × utilization (liquidityFee = 0)
  const utilization = totalSupply > 0 ? totalVariableDebt / totalSupply : 0;
  const supplyApy   = variableBorrowApy * utilization;

  return { totalVariableDebt, variableBorrowApy, dailyInterestCost, spokeBreakdown: spokeDebts, blockNumber, totalSupply, supplyApy };
}

async function getUsdgReserveData() {
  // 1. Get the current drawn rate (borrow APY) from the Hub
  const drawnRateHex = await rpcCall('eth_call', [
    { to: CORE_HUB, data: SEL_GET_ASSET_DRAWN_RATE + hex32(USDG_ASSET_ID) }, 'latest'
  ]);
  const drawnRate = BigInt('0x' + drawnRateHex.slice(2));
  const ratePerSec = Number(drawnRate) / Number(RAY) / SECONDS_PER_YEAR;
  const variableBorrowApy = (Math.pow(1 + ratePerSec, SECONDS_PER_YEAR) - 1) * 100;

  // 2. Sum total USDG borrowed across all spokes
  const spokeDebts = await Promise.all(USDG_SPOKES.map(async (spoke) => {
    try {
      const debtHex = await rpcCall('eth_call', [
        { to: spoke.address, data: SEL_GET_RESERVE_TOTAL_DEBT + hex32(spoke.reserveId) }, 'latest'
      ]);
      const rawDebt = Number(BigInt('0x' + debtHex.slice(2)));
      return { name: spoke.name, debt: rawDebt / Math.pow(10, USDG_DECIMALS) };
    } catch (err) {
      console.error(`[AaveV4] Error fetching debt for ${spoke.name} spoke:`, err.message);
      return { name: spoke.name, debt: 0 };
    }
  }));

  const totalVariableDebt = spokeDebts.reduce((s, d) => s + d.debt, 0);
  const annualRate        = Number(drawnRate) / Number(RAY);
  const dailyInterestCost = totalVariableDebt * annualRate / 365;

  return {
    totalVariableDebt,
    variableBorrowApy,
    dailyInterestCost,
    spokeBreakdown: spokeDebts
  };
}

module.exports = {
  getUsdgReserveData,
  getUsdgReserveDataAtBlock,
  getCurrentBlockInfo,
  estimateBlockForDate
};
