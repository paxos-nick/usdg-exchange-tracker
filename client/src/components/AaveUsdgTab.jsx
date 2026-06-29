import {
  ComposedChart, AreaChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Bar, BarChart
} from 'recharts';
import { useAaveUsdg, useAaveUsdgHistory } from '../hooks/useVolumeData';

const AAVE_PURPLE = '#b6509e';
const APY_GREEN   = '#10b981';
const SPOKE_COLORS = ['#00d4aa', '#f5a623', '#7c3aed', '#3b82f6'];

function formatUSD(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatUSDShort(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
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

const tooltipBase = {
  contentStyle: { backgroundColor: '#1a1f2e', border: '1px solid #2f3542', borderRadius: 8, color: '#e7e9ea' },
  labelStyle: { color: '#71767b' }
};

function CombinedTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const debt = payload.find(p => p.dataKey === 'totalDebt');
  const apy  = payload.find(p => p.dataKey === 'borrowApy');
  return (
    <div style={{ ...tooltipBase.contentStyle, padding: '10px 14px' }}>
      <div style={{ color: '#71767b', marginBottom: 6, fontSize: 12 }}>{label}</div>
      {debt && <div style={{ color: AAVE_PURPLE }}>{formatUSD(debt.value)} borrowed</div>}
      {apy  && <div style={{ color: APY_GREEN  }}>{apy.value.toFixed(4)}% APY</div>}
    </div>
  );
}

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
            <StatCard label="Total USDG Borrowed" value={formatUSD(totalVariableDebt)} sub="across all spokes" color={AAVE_PURPLE} />
            <StatCard label="Variable Borrow Rate" value={`${variableBorrowApy?.toFixed(2)}%`} sub="APY" color={APY_GREEN} />
            <StatCard label="Daily Interest Cost" value={formatUSD(dailyInterestCost)} sub="total debt × annual rate ÷ 365" />
          </div>
        </section>
      )}

      {/* Spoke breakdown */}
      {spokeBreakdown && (
        <section className="wow-section">
          <h3>Debt by Spoke (current)</h3>
          <div className="comparison-grid">
            {spokeBreakdown.map((spoke, i) => (
              <StatCard key={spoke.name} label={spoke.name + ' Spoke'} value={formatUSD(spoke.debt)}
                sub={totalVariableDebt > 0 ? ((spoke.debt / totalVariableDebt) * 100).toFixed(1) + '% of total' : ''}
                color={SPOKE_COLORS[i % SPOKE_COLORS.length]} />
            ))}
          </div>
        </section>
      )}

      {/* Chart 1: Borrowed + APY on dual axes */}
      {chartData.length > 0 && (
        <>
          <section className="chart-section">
            <h3>Total Borrowed & Variable Borrow Rate</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 60, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={AAVE_PURPLE} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={AAVE_PURPLE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
                  <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
                  <YAxis yAxisId="debt" orientation="left"
                    stroke={AAVE_PURPLE} tick={{ fill: AAVE_PURPLE, fontSize: 11 }}
                    tickFormatter={formatUSDShort} width={75}
                    label={{ value: 'Borrowed', angle: -90, position: 'insideLeft', fill: AAVE_PURPLE, fontSize: 11, dx: -8 }} />
                  <YAxis yAxisId="apy" orientation="right"
                    stroke={APY_GREEN} tick={{ fill: APY_GREEN, fontSize: 11 }}
                    tickFormatter={v => v.toFixed(1) + '%'} width={55}
                    label={{ value: 'APY', angle: 90, position: 'insideRight', fill: APY_GREEN, fontSize: 11, dx: 8 }} />
                  <Tooltip content={<CombinedTooltip />} />
                  <Legend wrapperStyle={{ color: '#e7e9ea' }}
                    formatter={v => v === 'totalDebt' ? 'Total Borrowed' : 'Borrow APY'} />
                  <Area yAxisId="debt" type="monotone" dataKey="totalDebt"
                    stroke={AAVE_PURPLE} strokeWidth={2} fill="url(#debtGrad)"
                    dot={false} activeDot={{ r: 4, fill: AAVE_PURPLE, strokeWidth: 0 }} name="totalDebt" />
                  <Line yAxisId="apy" type="monotone" dataKey="borrowApy"
                    stroke={APY_GREEN} strokeWidth={2} dot={false}
                    activeDot={{ r: 4, fill: APY_GREEN, strokeWidth: 0 }} name="borrowApy" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Chart 2: Daily interest cost */}
          <section className="chart-section">
            <h3>Daily Borrow Interest Paid</h3>
            <p style={{ color: '#71767b', fontSize: 12, marginTop: -8, marginBottom: 12 }}>
              totalDebt × annualRate ÷ 365 — interest accrued per day across all borrowers
            </p>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
                  <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
                  <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }}
                    tickFormatter={v => '$' + (v >= 1000 ? (v/1000).toFixed(1) + 'K' : v.toFixed(0))} width={70} />
                  <Tooltip {...tooltipBase} formatter={v => [formatUSD(v), 'Daily Interest']} />
                  <Bar dataKey="dailyInterest" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Daily Interest" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      {histLoading && !chartData.length && <div className="loading">Loading historical data...</div>}

      <section className="wow-section" style={{ background: 'transparent', border: '1px solid #2f3542', borderRadius: 8, padding: '16px 20px', marginTop: 8 }}>
        <p style={{ color: '#71767b', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: '#e7e9ea' }}>Methodology: </strong>
          Total debt = <code>getReserveTotalDebt(reserveId)</code> summed across Main, Gold, Forex, and USDG-Pendle spokes.
          Rate = <code>getAssetDrawnRate(8)</code> from{' '}
          <a href="https://etherscan.io/address/0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9"
            target="_blank" rel="noreferrer" style={{ color: AAVE_PURPLE }}>CORE_HUB</a>.
          Daily interest = totalDebt × annualRate ÷ 365. Historical data queries on-chain archive at estimated block numbers.
        </p>
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Live: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Historical from DB
        </div>
      )}
    </div>
  );
}
