/**
 * USDG circulating supply by chain.
 * Circulating = totalSupply() - balanceOf(supplyControlAddress) on EVM chains.
 * On Solana: getTokenSupply on the mint (no supply control address provided).
 * USDG uses 6 decimals on all EVM chains.
 */

const axios = require('axios');

const DECIMALS = 1e6; // USDG = 6 decimals

const CHAINS = [
  {
    name: 'ethereum',
    rpc: 'https://eth.drpc.org',
    tokenAddress:         '0xe343167631d89B6Ffc58B88d6b7fB0228795491D',
    supplyControlAddress: '0x9a7164112029b81c07636AB7b59fA813E0883BBF',
    type: 'evm',
  },
  {
    name: 'arbitrum',
    rpc: 'https://arb1.arbitrum.io/rpc',
    tokenAddress:         '0x004B506865409877C9fA29bfb1ebA929984B9bbC',
    supplyControlAddress: '0x359a1Ee087abD3042151b93eC8EA462D6B27bcb6',
    type: 'evm',
  },
  {
    name: 'robinhood',
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    tokenAddress:         '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    supplyControlAddress: '0xdf5FfF9cb88B3cAb50572FAE73E2EB08599D25D4',
    type: 'evm',
  },
  {
    name: 'ink',
    rpc: 'https://rpc-gel.inkonchain.com',
    tokenAddress:         '0xe343167631d89B6Ffc58B88d6b7fB0228795491D',
    supplyControlAddress: '0x9a7164112029b81c07636AB7b59fA813E0883BBF',
    type: 'evm',
  },
  {
    name: 'xlayer',
    rpc: 'https://rpc.xlayer.tech',
    tokenAddress:         '0x4ae46a509F6b1D9056937BA4500cb143933D2dc8',
    supplyControlAddress: '0x046Ca5A59D53448BF63E0BEE1D552c84Ad8BEB70',
    type: 'evm',
  },
  {
    name: 'solana',
    rpc: 'https://api.mainnet-beta.solana.com',
    mintAddress: '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH',
    type: 'solana',
  },
];

// ERC20 selectors
const SEL_TOTAL_SUPPLY = '0x18160ddd';
const SEL_BALANCE_OF   = '0x70a08231';

function pad32(address) {
  return address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

async function evmCall(rpc, to, data) {
  const r = await axios.post(rpc, {
    jsonrpc: '2.0', method: 'eth_call',
    params: [{ to, data }, 'latest'], id: 1,
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 12000 });
  if (r.data.error) throw new Error(r.data.error.message);
  return r.data.result;
}

async function getEvmCirculating(chain) {
  const [totalHex, controlHex] = await Promise.all([
    evmCall(chain.rpc, chain.tokenAddress, SEL_TOTAL_SUPPLY),
    evmCall(chain.rpc, chain.tokenAddress, SEL_BALANCE_OF + pad32(chain.supplyControlAddress)),
  ]);
  const total       = Number(BigInt('0x' + totalHex.slice(2))) / DECIMALS;
  const controlled  = Number(BigInt('0x' + controlHex.slice(2))) / DECIMALS;
  return {
    chain:           chain.name,
    totalSupply:     total,
    supplyControlled: controlled,
    circulating:     Math.max(total - controlled, 0),
  };
}

async function getSolanaCirculating(chain) {
  const r = await axios.post(chain.rpc, {
    jsonrpc: '2.0', id: 1,
    method: 'getTokenSupply',
    params: [chain.mintAddress],
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 12000 });
  if (r.data.error) throw new Error(r.data.error.message);
  const amount = parseFloat(r.data.result?.value?.uiAmount || 0);
  return {
    chain:           'solana',
    totalSupply:     amount,
    supplyControlled: 0, // no supply control address for Solana
    circulating:     amount,
  };
}

async function getAllChainSupply() {
  const results = [];
  await Promise.all(CHAINS.map(async chain => {
    try {
      const data = chain.type === 'solana'
        ? await getSolanaCirculating(chain)
        : await getEvmCirculating(chain);
      results.push(data);
    } catch (err) {
      console.error(`[UsdgSupply] ${chain.name}: ${err.message}`);
      results.push({ chain: chain.name, totalSupply: null, supplyControlled: null, circulating: null });
    }
  }));
  return results;
}

module.exports = { getAllChainSupply, CHAINS };
