import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { useAaveUsdg, useAaveUsdgHistory } from '../hooks/useVolumeData';

const AAVE_PURPLE = '#b6509e';
const SPOKE_COLORS = ['#00d4aa', '#f5a623', '#7c3aed', '#3b82f6'];

function formatUSD(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatUSDShort(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

const tooltipStyle = {
  contentStyle: { backgroundColor: '#1a1f2e', border: '1px solid #2f3542', borderRadius: 8, color: '#e7e9ea' },
  labelStyle: { color: '#71767b' }
};

export default function AaveUsdgTab() {
  const { data: live, loading: liveLoading, error: liveError, lastUpdated } = useAaveUsdg();
  const { data: hist, loading: histLoading } = useAaveUsdgHistory();

  const history = hist?.history || [];

  const chartData = history.map(row => ({
    date: row.date,
    displayDate: formatDate(row.date),
    totalDebt: row.total_debt,
    borrowApy: parseFloat(row.borrow_apy),
    dailyInterest: row.daily_interest,
  }));

  if (liveLoading && histLoading) return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <div className="loading">Loading Aave v4 data...</div>
    </div>
  );

  if (liveError) return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <div className="error">Error: {liveError}</div>
    </div>
  );

  const { totalVariableDebt, variableBorrowApy, dailyInterestCost, spokeBreakdown } = live || {};

  return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        USDG borrowing across all Aave v4 spokes on Ethereum mainnet · live data refreshes every 60s
      </p>

      {/* Live metrics */}
      {live && (
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
              value={`${variableBorrowApy?.toFixed(2)}%`}
              sub="APY"
            />
            <StatCard
              label="Daily Interest Cost"
              value={formatUSD(dailyInterestCost)}
              sub="total debt × annual rate ÷ 365"
            />
          </div>
        </section>
      )}

      {/* Spoke breakdown */}
      {spokeBreakdown && (
        <section className="wow-section">
          <h3>Debt by Spoke (current)</h3>
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
      )}

      {/* Historical: Total Debt */}
      {chartData.length > 0 && (
        <>
          <section className="chart-section">
            <h3>Total USDG Borrowed — Daily</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="aaveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={AAVE_PURPLE} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={AAVE_PURPLE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
                  <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
                  <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickFormatter={v => '$' + formatUSDShort(v)} width={75} />
                  <Tooltip {...tooltipStyle} formatter={v => [formatUSD(v), 'Total Borrowed']} />
                  <Area type="monotone" dataKey="totalDebt" stroke={AAVE_PURPLE} strokeWidth={2}
                    fill="url(#aaveGrad)" dot={false} activeDot={{ r: 4, fill: AAVE_PURPLE, strokeWidth: 0 }}
                    name="Total Borrowed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Historical: Borrow APY */}
          <section className="chart-section">
            <h3>Variable Borrow Rate — Daily</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="apyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
                  <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
                  <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickFormatter={v => v.toFixed(2) + '%'} width={60} />
                  <Tooltip {...tooltipStyle} formatter={v => [v.toFixed(4) + '%', 'Borrow APY']} />
                  <Area type="monotone" dataKey="borrowApy" stroke="#10b981" strokeWidth={2}
                    fill="url(#apyGrad)" dot={false} activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                    name="Borrow APY" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      {histLoading && !chartData.length && (
        <div className="loading">Loading historical data...</div>
      )}

      {/* Methodology note */}
      <section className="wow-section" style={{ background: 'transparent', border: '1px solid #2f3542', borderRadius: 8, padding: '16px 20px', marginTop: 8 }}>
        <p style={{ color: '#71767b', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: '#e7e9ea' }}>Methodology: </strong>
          Total debt = <code>getReserveTotalDebt(reserveId)</code> summed across Main, Gold, Forex, and USDG-Pendle spokes.
          Rate = <code>getAssetDrawnRate(8)</code> from{' '}
          <a href="https://etherscan.io/address/0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9"
            target="_blank" rel="noreferrer" style={{ color: AAVE_PURPLE }}>CORE_HUB</a>.
          Historical data queries on-chain archive at estimated block numbers (12s avg block time).
          Daily interest = totalDebt × annualRate ÷ 365.
        </p>
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Live data: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Historical from DB
        </div>
      )}
    </div>
  );
}
