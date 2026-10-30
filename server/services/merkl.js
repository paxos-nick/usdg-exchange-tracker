const axios = require('axios');

const MERKL_API = 'https://api.merkl.xyz/v4';
const CHAIN_ID  = 1; // Ethereum mainnet

// Opportunity types that count as USDG supply-side incentives on Aave v4
const USDG_SUPPLY_TYPES = new Set([
  'AAVE_V4_HUB_SUPPLY',
  'AAVE_V4_SPOKE_SUPPLY',
  'AAVE_V4_HUB_NET_LENDING', // new campaign type used from July 2026
  'AAVE_NET_LENDING',
  'ERC20LOGPROCESSOR', // wrapped aToken holders
]);

// Known campaign identifiers (Merkl rotates these on renewal; classify() falls back to the
// description, so a new id doesn't break tracking).
const CORE_CAMPAIGN_IDS  = new Set(['d1e44a399a02addd', '843cee7d4361af56']);
const PAXOS_CAMPAIGN_IDS = new Set(['3d7ecf5f1d83692f', '1ec4e06414fb00fe']);

/**
 * Fetch the current total daily USDG supply-side incentive spend from Merkl.
 * Returns USD value of rewards distributed per day across all live campaigns.
 */
async function getUsdgDailyRewards() {
  const response = await axios.get(`${MERKL_API}/opportunities`, {
    params: { chainId: CHAIN_ID, search: 'usdg' },
    timeout: 10000
  });

  const opportunities = Array.isArray(response.data) ? response.data : [];

  const liveUsdgSupply = opportunities.filter(opp =>
    opp.status === 'LIVE' && USDG_SUPPLY_TYPES.has(opp.type)
  );

  const totalDailyRewards = liveUsdgSupply.reduce((sum, opp) => {
    return sum + (opp.dailyRewards || 0);
  }, 0);

  // Merkl now names both hub campaigns "Lend USDG on Aave V4" and rotates their identifiers
  // when a campaign renews, so classify by (in order): explicit name, known identifier,
  // then the description's borrow-netting list. The Paxos Hub campaign nets only USDG/USDC
  // borrows; the Core Hub campaign nets the wider asset list (USDT, GHO, RLUSD, frxUSD...).
  const hubCampaigns = liveUsdgSupply.filter(opp =>
    opp.type === 'AAVE_V4_HUB_SUPPLY' || opp.type === 'AAVE_V4_HUB_NET_LENDING');
  const classify = (opp) => {
    const name = opp.name || '';
    if (name.includes('Paxos')) return 'paxos';
    if (name.includes('Core')) return 'core';
    if (PAXOS_CAMPAIGN_IDS.has(opp.identifier)) return 'paxos';
    if (CORE_CAMPAIGN_IDS.has(opp.identifier)) return 'core';
    const m = /net of ([^.]*?) borrows/i.exec(opp.description || '');
    if (m) {
      const assets = m[1].split(/,\s*/).map(a => a.trim().toUpperCase()).filter(Boolean);
      return assets.length <= 2 ? 'paxos' : 'core';
    }
    return null;
  };
  const coreCampaign  = hubCampaigns.find(opp => classify(opp) === 'core');
  const paxosCampaign = hubCampaigns.find(opp => classify(opp) === 'paxos');

  // opp.apr is the campaign's configured total supply APY (organic + incentive top-up).
  const aprOf = (opp) => (opp && opp.apr != null ? opp.apr : null);

  return {
    totalDailyRewards,
    coreDailyRewards:    coreCampaign?.dailyRewards ?? null,
    hubApr:              aprOf(coreCampaign),
    hubTvl:              coreCampaign?.tvl ?? null,
    paxosDailyRewards:   paxosCampaign?.dailyRewards ?? null,
    paxosHubApr:         aprOf(paxosCampaign),
    paxosHubTvl:         paxosCampaign?.tvl ?? null,
    breakdown: liveUsdgSupply.map(opp => ({
      name: opp.name,
      identifier: opp.identifier,
      hub: classify(opp),
      type: opp.type,
      dailyRewards: opp.dailyRewards || 0,
      apr: opp.apr || 0,
      tvl: opp.tvl || 0,
      campaignEnd: opp.latestCampaignEnd
        ? new Date(opp.latestCampaignEnd * 1000).toISOString().split('T')[0]
        : null
    }))
  };
}

module.exports = { getUsdgDailyRewards };
