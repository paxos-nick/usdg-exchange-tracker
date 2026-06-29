import { useAaveUsdg } from '../hooks/useVolumeData';

const AAVE_PURPLE = '#b6509e';
const SPOKE_COLORS = ['#00d4aa', '#f5a623', '#7c3aed', '#3b82f6'];

function formatUSD(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="comparison-card">
      <div className="comparison-label">{label}</div>
      <div className="comparison-values">
        <div className="comparison-current">
          {sub && <span className="value-label">{sub}</span>}
          <span className="value-number" style={color ? { color } : {}}>{value}</span>
        </div>
      </div>
    </div>
  );
}

export default function AaveUsdgTab() {
  const { data, loading, error, lastUpdated } = useAaveUsdg();

  if (loading) return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <div className="loading">Loading Aave v4 data...</div>
    </div>
  );

  if (error) return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <div className="error">Error: {error}</div>
    </div>
  );

  if (!data) return null;

  const { totalVariableDebt, variableBorrowApy, dailyInterestCost, spokeBreakdown } = data;

  return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        USDG borrowing across all Aave v4 spokes on Ethereum mainnet · refreshes every 60s
      </p>

      {/* Primary metrics */}
      <section className="wow-section">
        <div className="comparison-grid">
          <StatCard
            label="Total USDG Borrowed"
            value={formatUSD(totalVariableDebt)}
            sub="across all spokes"
            color={AAVE_PURPLE}
          />
          <StatCard
            label="Variable Borrow Rate"
            value={`${variableBorrowApy.toFixed(2)}%`}
            sub="APY"
          />
          <StatCard
            label="Daily Interest Cost"
            value={formatUSD(dailyInterestCost)}
            sub="total debt × annual rate ÷ 365"
          />
        </div>
      </section>

      {/* Spoke breakdown */}
      <section className="wow-section">
        <h3>Debt by Spoke</h3>
        <div className="comparison-grid">
          {spokeBreakdown.map((spoke, i) => (
            <StatCard
              key={spoke.name}
              label={spoke.name + ' Spoke'}
              value={formatUSD(spoke.debt)}
              sub={totalVariableDebt > 0 ? ((spoke.debt / totalVariableDebt) * 100).toFixed(1) + '% of total' : ''}
              color={SPOKE_COLORS[i % SPOKE_COLORS.length]}
            />
          ))}
        </div>
      </section>

      {/* Context */}
      <section className="wow-section" style={{ background: 'transparent', border: '1px solid #2f3542', borderRadius: 8, padding: '16px 20px' }}>
        <p style={{ color: '#71767b', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: '#e7e9ea' }}>How this is calculated: </strong>
          Total borrowed = sum of <code>getReserveTotalDebt(reserveId)</code> across all spokes.
          Borrow rate = <code>getAssetDrawnRate(assetId)</code> from CORE_HUB (assetId 8), expressed as compounded APY.
          Daily interest = totalDebt × annualRate ÷ 365.
          Data sourced directly from on-chain via{' '}
          <a href="https://etherscan.io/address/0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9"
            target="_blank" rel="noreferrer" style={{ color: AAVE_PURPLE }}>
            Aave v4 CORE_HUB
          </a>.
        </p>
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}
    </div>
  );
}
