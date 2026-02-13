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

// Color palette for different pairs
const COLORS = [
  '#00d4aa', '#7c3aed', '#f59e0b', '#ef4444',
  '#3b82f6', '#ec4899', '#10b981', '#f97316'
];

function formatVolume(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatTooltipValue(value) {
  return `$${formatVolume(value)}`;
}

// Parse date string without timezone issues
function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateStr, timeRange) {
  const date = parseDate(dateStr);
  if (timeRange === '1y') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function aggregateToMonthly(dates, volumeByPair, selectedPairs) {
  const monthlyData = new Map();

  dates.forEach(date => {
    const monthKey = date.substring(0, 7); // YYYY-MM

    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, {});
    }

    selectedPairs.forEach(pair => {
      const pairData = volumeByPair[pair] || [];
      const dayData = pairData.find(d => d.date === date);
      if (dayData) {
        const existing = monthlyData.get(monthKey)[pair] || 0;
        monthlyData.get(monthKey)[pair] = existing + dayData.volume;
      }
    });
  });

  return Array.from(monthlyData.entries())
    .map(([month, volumes]) => ({
      date: `${month}-01`,
      ...volumes
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function filterDatesByTimeRange(dates, timeRange) {
  if (!dates || dates.length === 0) return [];

  const now = new Date();
  const sortedDates = [...dates].sort();

  switch (timeRange) {
    case '30d': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return sortedDates.filter(d => parseDate(d) >= thirtyDaysAgo);
    }
    case '1y': {
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return sortedDates.filter(d => parseDate(d) >= oneYearAgo);
    }
    default:
      return sortedDates.slice(-30);
  }
}

export default function PairVolumeChart({ volumeByPair, selectedPairs, timeRange = '30d' }) {
  if (!selectedPairs || selectedPairs.length === 0) {
    return (
      <div className="chart-container">
        <div className="loading">Select one or more pairs to view trading volume data</div>
      </div>
    );
  }

  // Build chart data: merge all dates from selected pairs
  const dateSet = new Set();
  selectedPairs.forEach(pair => {
    const pairData = volumeByPair[pair] || [];
    pairData.forEach(d => dateSet.add(d.date));
  });

  const allDates = Array.from(dateSet);
  const filteredDates = filterDatesByTimeRange(allDates, timeRange);

  let chartData;

  if (timeRange === '1y') {
    // Aggregate to monthly
    chartData = aggregateToMonthly(filteredDates, volumeByPair, selectedPairs);
    chartData = chartData.map(row => ({
      ...row,
      displayDate: formatDate(row.date, timeRange)
    }));
  } else {
    // Daily data
    chartData = filteredDates.map(date => {
      const row = { date, displayDate: formatDate(date, timeRange) };
      selectedPairs.forEach(pair => {
        const pairData = volumeByPair[pair] || [];
        const dayData = pairData.find(d => d.date === date);
        row[pair] = dayData ? dayData.volume : 0;
      });
      return row;
    });
  }

  if (chartData.length === 0) {
    return (
      <div className="chart-container">
        <div className="loading">No trading volume data available for selected pairs</div>
      </div>
    );
  }

  // Sort pairs by total volume (descending) so largest is at bottom of stack
  const sortedPairs = [...selectedPairs].sort((a, b) => {
    const totalA = chartData.reduce((sum, d) => sum + (d[a] || 0), 0);
    const totalB = chartData.reduce((sum, d) => sum + (d[b] || 0), 0);
    return totalB - totalA; // Descending - largest first (bottom of stack)
  });

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
          {sortedPairs.length > 1 && (
            <Legend
              wrapperStyle={{ color: '#e7e9ea' }}
              iconType="square"
            />
          )}
          {sortedPairs.map((pair, index) => (
            <Bar
              key={pair}
              dataKey={pair}
              stackId="volume"
              fill={COLORS[selectedPairs.indexOf(pair) % COLORS.length]}
              radius={index === sortedPairs.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              name={pair}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
