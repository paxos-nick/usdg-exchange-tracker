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

  // The Hub campaign is the primary Paxos-funded campaign.
  // Merkl's API rounds the APR (returns 6.0 when the actual Aave-shown target is 6.18%).
  // Update CAMPAIGN_TARGET_APR here when a new campaign with a different target launches.
  const CAMPAIGN_TARGET_APR = 6.18;

  const hubCampaign = liveUsdgSupply.find(opp =>
    opp.type === 'AAVE_V4_HUB_SUPPLY' || opp.type === 'AAVE_V4_HUB_NET_LENDING'
  );

  return {
    totalDailyRewards,
    hubApr: hubCampaign ? CAMPAIGN_TARGET_APR : null,  // authoritative target, not Merkl's rounded value
    hubTvl: hubCampaign?.tvl ?? null,   // Merkl-tracked eligible TVL at time of query
    breakdown: liveUsdgSupply.map(opp => ({
      name: opp.name,
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
