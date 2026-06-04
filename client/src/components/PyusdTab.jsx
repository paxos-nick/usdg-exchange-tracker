import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { usePyusdData } from '../hooks/useVolumeData';

const PAIR_COLORS = [
  '#00d4aa',
  '#3b82f6',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#10b981',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#8b5cf6',
  '#14b8a6',
  '#eab308'
];

const EXCHANGE_COLORS = {
  cryptocom: '#00d4aa',
  kraken: '#7132f5'
};

function formatVolume(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatVolumeShort(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatMonthLabel(month) {
  const [year, monthNum] = month.split('-');
  const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function PyusdTab() {
  const { data, loading, error, lastUpdated } = usePyusdData();

  if (loading) {
    return (
      <div className="weekly-trends">
        <h2>PYUSD Volume by Exchange</h2>
        <div className="loading">Loading PYUSD data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weekly-trends">
        <h2>PYUSD Volume by Exchange</h2>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (!data || !data.pairs || data.pairs.length === 0) {
    return (
      <div className="weekly-trends">
        <h2>PYUSD Volume by Exchange</h2>
        <div className="no-data">No PYUSD pairs found.</div>
      </div>
    );
  }

  const { pairs, totalByMonth, exchanges } = data;

  // Build chart data: one row per month with a key per pair for stacking
  const chartData = totalByMonth.map(m => {
    const row = {
      month: formatMonthLabel(m.month),
      monthKey: m.month,
      total: m.volume
    };
    for (const pair of pairs) {
      row[pair] = m.byPair[pair] || 0;
    }
    return row;
  });

  // Build exchange-totals chart data (stacked by exchange)
  const exchangeChartData = totalByMonth.map(m => {
    const row = { month: formatMonthLabel(m.month), monthKey: m.month };
    for (const ex of exchanges) {
      row[ex.displayName] = m.byExchange[ex.exchange] || 0;
    }
    return row;
  });

  const totalVolume = totalByMonth.reduce((sum, m) => sum + m.volume, 0);
  const avgMonthly = totalVolume / (totalByMonth.length || 1);
  const peakMonth = totalByMonth.reduce(
    (max, m) => (m.volume > max.volume ? m : max),
    { month: '', volume: 0 }
  );

  // Per-exchange totals across the 12 months
  const exchangeTotals = exchanges.map(ex => {
    const total = totalByMonth.reduce((sum, m) => sum + (m.byExchange[ex.exchange] || 0), 0);
    return { ...ex, total };
  });

  return (
    <div className="weekly-trends">
      <h2>PYUSD Volume by Exchange</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        Monthly trading volume across all PYUSD pairs on Crypto.com and Kraken (last 12 months)
      </p>

      {/* Summary Cards */}
      <section className="wow-section">
        <div className="comparison-grid">
          <div className="comparison-card">
            <div className="comparison-label">Total PYUSD Pairs</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">Across {exchanges.length} exchanges</span>
                <span className="value-number">{pairs.length}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">12-Month Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">Combined</span>
                <span className="value-number">{formatVolume(totalVolume)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">Avg Monthly Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">Mean</span>
                <span className="value-number">{formatVolume(avgMonthly)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">Peak Month</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">{peakMonth.month ? formatMonthLabel(peakMonth.month) : '—'}</span>
                <span className="value-number">{formatVolume(peakMonth.volume)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Per-exchange totals */}
      <section className="wow-section">
        <h3>Volume by Exchange (12-Month Total)</h3>
        <div className="comparison-grid">
          {exchangeTotals.map(ex => (
            <div key={ex.exchange} className="comparison-card">
              <div className="comparison-label" style={{ color: EXCHANGE_COLORS[ex.exchange] }}>
                {ex.displayName}
              </div>
              <div className="comparison-values">
                <div className="comparison-current">
                  <span className="value-label">{ex.pairs.length} pairs</span>
                  <span className="value-number">{formatVolume(ex.total)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pair list grouped by exchange */}
      <section className="wow-section">
        {exchanges.map(ex => (
          <div key={ex.exchange} style={{ marginBottom: 16 }}>
            <h4 style={{ color: EXCHANGE_COLORS[ex.exchange], marginBottom: 8 }}>
              {ex.displayName} ({ex.pairs.length})
            </h4>
            <div className="pairs-tags">
              {ex.pairs.map(pair => (
                <span key={pair} className="pair-tag">{pair}</span>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Stacked Monthly Volume Chart - by Exchange */}
      <section className="chart-section">
        <h3>Monthly Trading Volume by Exchange</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={exchangeChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
              <XAxis
                dataKey="month"
                stroke="#71767b"
                tick={{ fill: '#71767b', fontSize: 11 }}
                tickMargin={10}
              />
              <YAxis
                stroke="#71767b"
                tick={{ fill: '#71767b', fontSize: 11 }}
                tickFormatter={formatVolumeShort}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1f2e',
                  border: '1px solid #2f3542',
                  borderRadius: '8px',
                  color: '#e7e9ea'
                }}
                labelStyle={{ color: '#71767b' }}
                formatter={(value, name) => [formatVolume(value), name]}
              />
              <Legend wrapperStyle={{ color: '#e7e9ea' }} />
              {exchanges.map(ex => (
                <Bar
                  key={ex.exchange}
                  dataKey={ex.displayName}
                  stackId="ex"
                  fill={EXCHANGE_COLORS[ex.exchange] || '#888'}
                  name={ex.displayName}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Stacked Monthly Volume Chart - by Pair */}
      <section className="chart-section">
        <h3>Monthly Trading Volume by Pair</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
              <XAxis
                dataKey="month"
                stroke="#71767b"
                tick={{ fill: '#71767b', fontSize: 11 }}
                tickMargin={10}
              />
              <YAxis
                stroke="#71767b"
                tick={{ fill: '#71767b', fontSize: 11 }}
                tickFormatter={formatVolumeShort}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1f2e',
                  border: '1px solid #2f3542',
                  borderRadius: '8px',
                  color: '#e7e9ea'
                }}
                labelStyle={{ color: '#71767b' }}
                formatter={(value, name) => [formatVolume(value), name]}
              />
              <Legend wrapperStyle={{ color: '#e7e9ea', fontSize: 11 }} />
              {pairs.map((pair, idx) => (
                <Bar
                  key={pair}
                  dataKey={pair}
                  stackId="volume"
                  fill={PAIR_COLORS[idx % PAIR_COLORS.length]}
                  name={pair}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Per-exchange monthly table */}
      <section className="chart-section">
        <h3>Monthly Volume Breakdown</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="depth-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Month</th>
                {exchanges.map(ex => (
                  <th key={ex.exchange} style={{ textAlign: 'right', color: EXCHANGE_COLORS[ex.exchange] }}>
                    {ex.displayName}
                  </th>
                ))}
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {totalByMonth.map(m => (
                <tr key={m.month}>
                  <td style={{ textAlign: 'left' }}>{formatMonthLabel(m.month)}</td>
                  {exchanges.map(ex => (
                    <td key={ex.exchange} style={{ textAlign: 'right' }}>
                      {formatVolume(m.byExchange[ex.exchange] || 0)}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatVolume(m.volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (auto-refreshes every 6 hours)
        </div>
      )}
    </div>
  );
}
