import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useMonthlyMetrics } from '../hooks/useVolumeData';

function formatVolume(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
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

function formatPercentChange(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function ChangeIndicator({ value, isPercent = false }) {
  if (value === 0) {
    return <span className="change-neutral">—</span>;
  }

  const isPositive = value > 0;
  const displayValue = isPercent ? formatPercentChange(value) : (value > 0 ? `+${value}` : value);

  return (
    <span className={`change-indicator ${isPositive ? 'positive' : 'negative'}`}>
      {displayValue}
    </span>
  );
}

function ComparisonCard({ label, current, previous, change, isVolume = false, percentChange }) {
  return (
    <div className="comparison-card">
      <div className="comparison-label">{label}</div>
      <div className="comparison-values">
        <div className="comparison-current">
          <span className="value-label">This Month</span>
          <span className="value-number">{isVolume ? formatVolume(current) : current}</span>
        </div>
        <div className="comparison-previous">
          <span className="value-label">Last Month</span>
          <span className="value-number">{isVolume ? formatVolume(previous) : previous}</span>
        </div>
        <div className="comparison-change">
          <span className="value-label">Change</span>
          <ChangeIndicator value={percentChange !== undefined ? percentChange : change} isPercent={percentChange !== undefined} />
        </div>
      </div>
    </div>
  );
}

export default function MonthlyTrends() {
  const { data, loading, error } = useMonthlyMetrics();

  if (loading) {
    return (
      <div className="weekly-trends">
        <h2>Monthly Trends</h2>
        <div className="loading">Loading monthly metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weekly-trends">
        <h2>Monthly Trends</h2>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (!data || !data.monthly || data.monthly.length === 0) {
    return (
      <div className="weekly-trends">
        <h2>Monthly Trends</h2>
        <div className="no-data">No historical metrics available yet. Data will appear after the first daily log.</div>
      </div>
    );
  }

  const { monthly, changes } = data;

  // Prepare data for line chart (exchanges by threshold)
  const exchangeThresholdData = monthly.map(m => ({
    month: formatMonthLabel(m.month),
    monthKey: m.month,
    '$1M-$5M': m.metrics.exchangeThresholds['1Mto5M'],
    '$5M-$25M': m.metrics.exchangeThresholds['5Mto25M'],
    '>$25M': m.metrics.exchangeThresholds['over25M'],
    'Total Active': m.metrics.activeExchanges
  }));

  // Prepare data for volume bar chart (use volume30Day, fallback to volume7Day for older data)
  const volumeData = monthly.map(m => ({
    month: formatMonthLabel(m.month),
    monthKey: m.month,
    volume: m.metrics.volume30Day || m.metrics.volume7Day
  }));

  return (
    <div className="weekly-trends">
      <h2>Monthly Trends</h2>

      {/* Month-over-Month Comparison */}
      {changes && (
        <section className="wow-section">
          <h3>Month-over-Month Comparison</h3>
          <div className="comparison-grid">
            <ComparisonCard
              label="30-Day Volume"
              current={changes.volume30Day?.current || 0}
              previous={changes.volume30Day?.previous || 0}
              change={changes.volume30Day?.change || 0}
              percentChange={changes.volume30Day?.percentChange}
              isVolume={true}
            />
            <ComparisonCard
              label="Active Exchanges"
              current={changes.activeExchanges.current}
              previous={changes.activeExchanges.previous}
              change={changes.activeExchanges.change}
            />
            <ComparisonCard
              label="Total Pairs"
              current={changes.totalPairs.current}
              previous={changes.totalPairs.previous}
              change={changes.totalPairs.change}
            />
          </div>

          <h4 className="threshold-subheader">Exchange Threshold Distribution</h4>
          <div className="comparison-grid threshold-comparison">
            <ComparisonCard
              label="$1M-$5M/day"
              current={changes.thresholds['1Mto5M'].current}
              previous={changes.thresholds['1Mto5M'].previous}
              change={changes.thresholds['1Mto5M'].change}
            />
            <ComparisonCard
              label="$5M-$25M/day"
              current={changes.thresholds['5Mto25M'].current}
              previous={changes.thresholds['5Mto25M'].previous}
              change={changes.thresholds['5Mto25M'].change}
            />
            <ComparisonCard
              label=">$25M/day"
              current={changes.thresholds['over25M'].current}
              previous={changes.thresholds['over25M'].previous}
              change={changes.thresholds['over25M'].change}
            />
          </div>
        </section>
      )}

      {/* Exchange Threshold Line Chart */}
      <section className="chart-section">
        <h3>Exchanges by Volume Threshold</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={exchangeThresholdData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1f2e',
                  border: '1px solid #2f3542',
                  borderRadius: '8px',
                  color: '#e7e9ea'
                }}
                labelStyle={{ color: '#71767b' }}
              />
              <Legend
                wrapperStyle={{ color: '#e7e9ea' }}
              />
              <Line
                type="monotone"
                dataKey="$1M-$5M"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="$5M-$25M"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey=">$25M"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="Total Active"
                stroke="#71767b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#71767b', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 30-Day Volume Bar Chart */}
      <section className="chart-section">
        <h3>30-Day Trading Volume by Month</h3>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={volumeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1f2e',
                  border: '1px solid #2f3542',
                  borderRadius: '8px',
                  color: '#e7e9ea'
                }}
                labelStyle={{ color: '#71767b' }}
                formatter={(value) => [formatVolume(value), '30-Day Volume']}
                labelFormatter={(label) => label}
              />
              <Bar
                dataKey="volume"
                fill="#00d4aa"
                radius={[4, 4, 0, 0]}
                name="30-Day Volume"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
