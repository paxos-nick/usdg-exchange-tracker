const axios = require('axios');

const RPC_URL = 'https://ethereum-rpc.publicnode.com';
const PAXG_ADDRESS = '0x45804880De22913dAFE09f4980848ECE6EcbAf78';
const TOTAL_SUPPLY_SELECTOR = '0x18160ddd';
const PAXG_DECIMALS = 18;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function rpcCall(method, params) {
  const response = await axios.post(RPC_URL, {
    jsonrpc: '2.0',
    method,
    params,
    id: 1
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000
  });

  if (response.data.error) {
    throw new Error(`RPC error: ${response.data.error.message}`);
  }
  return response.data.result;
}

async function getCurrentBlockInfo() {
  const blockHex = await rpcCall('eth_blockNumber', []);
  const blockNumber = parseInt(blockHex, 16);
  const block = await rpcCall('eth_getBlockByNumber', [blockHex, false]);
  const timestamp = parseInt(block.timestamp, 16);
  return { blockNumber, timestamp };
}

// Estimate the block number closest to the start of a given UTC date.
// Uses a linear interpolation from a known reference point.
function estimateBlockForDate(targetDateStr, refBlockNumber, refTimestamp) {
  const targetTs = Math.floor(new Date(targetDateStr + 'T00:00:00Z').getTime() / 1000);
  const AVG_BLOCK_TIME = 12; // seconds
  const delta = Math.round((targetTs - refTimestamp) / AVG_BLOCK_TIME);
  return Math.max(1, refBlockNumber + delta);
}

async function getSupplyAtBlock(blockNumber) {
  const blockHex = '0x' + blockNumber.toString(16);
  const result = await rpcCall('eth_call', [
    { to: PAXG_ADDRESS, data: TOTAL_SUPPLY_SELECTOR },
    blockHex
  ]);
  return parseInt(result, 16) / Math.pow(10, PAXG_DECIMALS);
}

// Returns { supply, blockNumber } for a given YYYY-MM-DD date string
async function getSupplyForDate(dateStr, refBlockNumber, refTimestamp) {
  const blockNumber = estimateBlockForDate(dateStr, refBlockNumber, refTimestamp);
  const supply = await getSupplyAtBlock(blockNumber);
  return { supply, blockNumber };
}

// Returns current supply (latest block)
async function getCurrentSupply() {
  const result = await rpcCall('eth_call', [
    { to: PAXG_ADDRESS, data: TOTAL_SUPPLY_SELECTOR },
    'latest'
  ]);
  return parseInt(result, 16) / Math.pow(10, PAXG_DECIMALS);
}

module.exports = {
  getCurrentBlockInfo,
  estimateBlockForDate,
  getSupplyAtBlock,
  getSupplyForDate,
  getCurrentSupply
};
