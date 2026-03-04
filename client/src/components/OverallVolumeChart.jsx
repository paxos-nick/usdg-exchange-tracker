import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList
} from 'recharts';
import TimeRangeSelector from './TimeRangeSelector';
import { useAggregatedData, useDefiPools } from '../hooks/useVolumeData';

const SOURCE_COLORS = {
  kraken: '#7c3aed',
  bullish: '#00d4aa',
  gate: '#f59e0b',
  kucoin: '#3b82f6',
  bitmart: '#ec4899',
  okx: '#10b981',
  orca: '#ff6b35'
};

const SOURCE_NAMES = {
  kraken: 'Kraken',
  bullish: 'Bullish',
  gate: 'Gate.io',
  kucoin: 'Kucoin',
  bitmart: 'Bitmart',
  okx: 'OKX',
  orca: 'Orca (DEX)'
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
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (timeRange === '1y') {
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth() + 1) {
      return `${label}*`;
    }
    return label;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function aggregateToMonthly(data, sources) {
  const monthlyMap = new Map();
  data.forEach(d => {
    const monthKey = d.date.substring(0, 7);
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { date: `${monthKey}-01` });
      sources.forEach(s => { monthlyMap.get(monthKey)[s] = 0; });
    }
    sources.forEach(s => {
      monthlyMap.get(monthKey)[s] += (d[s] || 0);
    });
  });
  return Array.from(monthlyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function filterDataByTimeRange(data, timeRange, sources) {
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
      return aggregateToMonthly(filtered, sources);
    }
    default:
      filtered = data.slice(-30);
  }

  return filtered.map(d => {
    const row = { date: d.date };
    sources.forEach(s => { row[s] = d[s] || 0; });
    return row;
  });
}

export default function OverallVolumeChart() {
  const { data: cexData, loading: cexLoading } = useAggregatedData();
  const { data: dexData, loading: dexLoading } = useDefiPools();
  const [timeRange, setTimeRange] = useState('30d');

  const loading = cexLoading || dexLoading;

  if (loading) {
    return (
      <section className="exchange-section">
        <div className="section-header"><h2>Overall USDG Volume (CEX + DEX)</h2></div>
        <div className="loading">Loading volume data...</div>
      </section>
    );
  }

  // Merge CEX daily volume with DEX 24h volume on today's date
  const cexDaily = cexData?.dailyVolume || [];
  const allSources = [...(cexData?.exchanges || []), 'orca'];

  // Add Orca 24h volume to today's entry
  const today = new Date().toISOString().split('T')[0];
  const orcaVolume24h = (dexData?.pools || []).reduce((sum, p) => sum + (p.stats?.['24h']?.volume || 0), 0);

  const mergedData = cexDaily.map(d => {
    const row = { date: d.date, byExchange: d.byExchange };
    (cexData?.exchanges || []).forEach(ex => {
      row[ex] = d.byExchange?.[ex] || 0;
    });
    // Add Orca volume for today only
    row.orca = d.date === today ? orcaVolume24h : 0;
    return row;
  });

  const chartData = filterDataByTimeRange(mergedData, timeRange, allSources);
  const formattedData = chartData.map(d => {
    const total = allSources.reduce((sum, s) => sum + (d[s] || 0), 0);
    return { ...d, displayDate: formatDate(d.date, timeRange), _total: total };
  });

  // Sort by total volume descending (largest at bottom of stack)
  const sortedSources = [...allSources].sort((a, b) => {
    const totalA = chartData.reduce((sum, d) => sum + (d[a] || 0), 0);
    const totalB = chartData.reduce((sum, d) => sum + (d[b] || 0), 0);
    return totalB - totalA;
  });

  return (
    <section className="exchange-section">
      <div className="section-header">
        <h2>Overall USDG Volume (CEX + DEX)</h2>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {formattedData.length === 0 ? (
        <div className="chart-container">
          <div className="loading">No volume data available</div>
        </div>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedData} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
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
                labelFormatter={(label, payload) => {
                  const total = payload?.[0]?.payload?._total;
                  return total != null
                    ? `Date: ${label}  —  Total: $${formatVolume(total)}`
                    : `Date: ${label}`;
                }}
              />
              <Legend
                wrapperStyle={{ color: '#e7e9ea' }}
                iconType="square"
                formatter={(value) => SOURCE_NAMES[value] || value}
              />
              {sortedSources.map((source, index) => (
                <Bar
                  key={source}
                  dataKey={source}
                  stackId="volume"
                  fill={SOURCE_COLORS[source] || '#888'}
                  radius={index === sortedSources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  name={source}
                >
                  {index === sortedSources.length - 1 && (
                    <LabelList
                      dataKey="_total"
                      position="top"
                      formatter={(val) => `$${formatVolume(val)}`}
                      style={{ fill: '#a0a4aa', fontSize: 10, fontWeight: 500 }}
                    />
                  )}
                </Bar>
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
    </section>
  );
}
