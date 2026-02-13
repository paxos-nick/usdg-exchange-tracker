import { useState, useEffect } from 'react';
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
import TimeRangeSelector from './TimeRangeSelector';
import { useAggregatedData } from '../hooks/useVolumeData';

// Color palette for exchanges
const EXCHANGE_COLORS = {
  kraken: '#7c3aed',
  bullish: '#00d4aa',
  gate: '#f59e0b',
  kucoin: '#3b82f6',
  bitmart: '#ec4899',
  okx: '#10b981'
};

const EXCHANGE_NAMES = {
  kraken: 'Kraken',
  bullish: 'Bullish',
  gate: 'Gate.io',
  kucoin: 'Kucoin',
  bitmart: 'Bitmart',
  okx: 'OKX'
};

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
  // Parse date parts directly to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed
  if (timeRange === '1y') {
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    // Add asterisk for current (incomplete) month
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth() + 1) {
      return `${label}*`;
    }
    return label;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function aggregateToMonthly(data, selectedExchanges) {
  const monthlyMap = new Map();

  data.forEach(d => {
    const monthKey = d.date.substring(0, 7);
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { date: `${monthKey}-01` });
      selectedExchanges.forEach(ex => {
        monthlyMap.get(monthKey)[ex] = 0;
      });
    }
    selectedExchanges.forEach(ex => {
      monthlyMap.get(monthKey)[ex] += (d.byExchange?.[ex] || 0);
    });
  });

  return Array.from(monthlyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Parse date string without timezone issues
function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function filterDataByTimeRange(data, timeRange, selectedExchanges) {
  if (!data || data.length === 0) return [];

  const now = new Date();
  let filtered;

  switch (timeRange) {
    case '30d': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = data.filter(d => parseDate(d.date) >= thirtyDaysAgo);
      break;
    }
    case '1y': {
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filtered = data.filter(d => parseDate(d.date) >= oneYearAgo);
      return aggregateToMonthly(filtered, selectedExchanges);
    }
    default:
      filtered = data.slice(-30);
  }

  return filtered.map(d => {
    const row = { date: d.date };
    selectedExchanges.forEach(ex => {
      row[ex] = d.byExchange?.[ex] || 0;
    });
    return row;
  });
}

export default function AggregatedExchangeChart() {
  const { data, loading, error } = useAggregatedData();
  const [timeRange, setTimeRange] = useState('30d');
  const [selectedExchanges, setSelectedExchanges] = useState([]);

  // Initialize selected exchanges when data loads
  useEffect(() => {
    if (data?.exchanges && selectedExchanges.length === 0) {
      setSelectedExchanges([...data.exchanges]);
    }
  }, [data?.exchanges]);

  const handleToggleExchange = (exchange) => {
    if (selectedExchanges.includes(exchange)) {
      setSelectedExchanges(selectedExchanges.filter(e => e !== exchange));
    } else {
      setSelectedExchanges([...selectedExchanges, exchange]);
    }
  };

  const handleSelectAll = () => {
    if (data?.exchanges) {
      if (selectedExchanges.length === data.exchanges.length) {
        setSelectedExchanges([]);
      } else {
        setSelectedExchanges([...data.exchanges]);
      }
    }
  };

  if (loading) {
    return (
      <section className="exchange-section">
        <div className="section-header">
          <h2>All Exchanges Trading Volume</h2>
        </div>
        <div className="loading">Loading exchange data...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="exchange-section">
        <div className="section-header">
          <h2>All Exchanges Trading Volume</h2>
        </div>
        <div className="error">Error: {error}</div>
      </section>
    );
  }

  const chartData = filterDataByTimeRange(data?.dailyVolume || [], timeRange, selectedExchanges);
  const formattedData = chartData.map(d => ({
    ...d,
    displayDate: formatDate(d.date, timeRange)
  }));

  // Sort exchanges by total volume (descending) so largest is at bottom of stack
  const sortedExchanges = [...selectedExchanges].sort((a, b) => {
    const totalA = chartData.reduce((sum, d) => sum + (d[a] || 0), 0);
    const totalB = chartData.reduce((sum, d) => sum + (d[b] || 0), 0);
    return totalB - totalA; // Descending - largest first (bottom of stack)
  });

  return (
    <section className="exchange-section">
      <div className="section-header">
        <h2>All Exchanges Trading Volume</h2>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {selectedExchanges.length === 0 ? (
        <div className="chart-container">
          <div className="loading">Select at least one exchange to view trading volume</div>
        </div>
      ) : formattedData.length === 0 ? (
        <div className="chart-container">
          <div className="loading">No trading volume data available</div>
        </div>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
              <Legend
                wrapperStyle={{ color: '#e7e9ea' }}
                iconType="square"
                formatter={(value) => EXCHANGE_NAMES[value] || value}
              />
              {sortedExchanges.map((exchange, index) => (
                <Bar
                  key={exchange}
                  dataKey={exchange}
                  stackId="volume"
                  fill={EXCHANGE_COLORS[exchange] || '#888'}
                  radius={index === sortedExchanges.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  name={exchange}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {timeRange === '1y' && (
        <div className="chart-footnote">
          *Month in progress (as of {new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })})
        </div>
      )}

      {data?.exchanges && (
        <div className="exchange-toggle-section">
          <div className="pair-selector-header">
            <span className="pair-selector-label">Select exchanges to display:</span>
            <button className="select-all-btn" onClick={handleSelectAll}>
              {selectedExchanges.length === data.exchanges.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="pair-chips">
            {data.exchanges.map(exchange => (
              <button
                key={exchange}
                className={`pair-chip ${selectedExchanges.includes(exchange) ? 'selected' : ''}`}
                onClick={() => handleToggleExchange(exchange)}
                style={{
                  borderColor: selectedExchanges.includes(exchange) ? EXCHANGE_COLORS[exchange] : undefined,
                  color: selectedExchanges.includes(exchange) ? EXCHANGE_COLORS[exchange] : undefined,
                  backgroundColor: selectedExchanges.includes(exchange) ? `${EXCHANGE_COLORS[exchange]}20` : undefined
                }}
              >
                {EXCHANGE_NAMES[exchange] || exchange}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
