import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

function formatVolume(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatTooltipValue(value) {
  return `$${formatVolume(value)}`;
}

function formatDate(dateStr, timeRange) {
  const date = new Date(dateStr);
  if (timeRange === '1y') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function aggregateToMonthly(data) {
  const monthlyMap = new Map();

  data.forEach(d => {
    const monthKey = d.date.substring(0, 7); // YYYY-MM
    const existing = monthlyMap.get(monthKey) || 0;
    monthlyMap.set(monthKey, existing + d.volume);
  });

  return Array.from(monthlyMap.entries())
    .map(([month, volume]) => ({
      date: `${month}-01`,
      volume
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function filterDataByTimeRange(data, timeRange) {
  if (!data || data.length === 0) return [];

  const now = new Date();

  switch (timeRange) {
    case '30d': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return data.filter(d => new Date(d.date) >= thirtyDaysAgo);
    }
    case '1y': {
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const filtered = data.filter(d => new Date(d.date) >= oneYearAgo);
      return aggregateToMonthly(filtered);
    }
    default:
      return data.slice(-30);
  }
}

export default function VolumeChart({ data, timeRange = '30d' }) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-container">
        <div className="loading">No volume data available</div>
      </div>
    );
  }

  const filteredData = filterDataByTimeRange(data, timeRange);

  const chartData = filteredData.map(d => ({
    ...d,
    displayDate: formatDate(d.date, timeRange)
  }));

  if (chartData.length === 0) {
    return (
      <div className="chart-container">
        <div className="loading">No data for selected time range</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
          <XAxis
            dataKey="displayDate"
            stroke="#71767b"
            tick={{ fill: '#71767b', fontSize: 11 }}
            interval="preserveStartEnd"
            tickMargin={10}
          />
          <YAxis
            stroke="#71767b"
            tick={{ fill: '#71767b', fontSize: 11 }}
            tickFormatter={formatVolume}
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
            formatter={formatTooltipValue}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Bar
            dataKey="volume"
            fill="#00d4aa"
            radius={[4, 4, 0, 0]}
            name="Volume"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
