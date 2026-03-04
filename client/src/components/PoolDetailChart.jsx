import { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useDexHistory } from '../hooks/useVolumeData';

function formatUsd(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PoolDetailChart() {
  const { data, loading } = useDexHistory();
  const [selectedPool, setSelectedPool] = useState(null);

  if (loading) return <div className="loading">Loading pool history...</div>;

  const history = data?.history || [];
  if (history.length === 0) {
    return (
      <div className="chart-empty-state">
        No pool history yet. Daily snapshots will accumulate automatically.
      </div>
    );
  }

  const poolNames = [...new Set(history.flatMap(s =>
    s.pools.map(p => p.venue ? `${p.name} (${p.venue})` : p.name)
  ))];
  const activePool = selectedPool || poolNames[0];

  const chartData = history.map(snapshot => {
    const pool = snapshot.pools.find(p => {
      const key = p.venue ? `${p.name} (${p.venue})` : p.name;
      return key === activePool;
    });
    return {
      date: snapshot.date,
      displayDate: formatDate(snapshot.date),
      tvl: pool?.tvl || 0,
      apy: (pool?.yield24h || 0) * 365 * 100
    };
  });

  return (
    <div className="dex-chart-section">
      <div className="pool-detail-header">
        <h3 className="defi-subsection-title">Pool Detail — TVL & Yield</h3>
        <select
          value={activePool}
          onChange={e => setSelectedPool(e.target.value)}
          className="pool-selector"
        >
          {poolNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
            <XAxis
              dataKey="displayDate"
              stroke="#71767b"
              tick={{ fill: '#71767b', fontSize: 11 }}
              tickMargin={10}
            />
            <YAxis
              yAxisId="tvl"
              stroke="#71767b"
              tick={{ fill: '#71767b', fontSize: 11 }}
              tickFormatter={(v) => formatUsd(v)}
              width={70}
            />
            <YAxis
              yAxisId="apy"
              orientation="right"
              stroke="#f59e0b"
              tick={{ fill: '#f59e0b', fontSize: 11 }}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1f2e',
                border: '1px solid #2f3542',
                borderRadius: '8px',
                color: '#e7e9ea'
              }}
              labelStyle={{ color: '#71767b' }}
              formatter={(value, name) => {
                if (name === 'TVL') return formatUsd(value);
                return `${value.toFixed(2)}%`;
              }}
            />
            <Legend wrapperStyle={{ color: '#e7e9ea' }} />
            <Bar
              yAxisId="tvl"
              dataKey="tvl"
              fill="#3b82f6"
              name="TVL"
              radius={[4, 4, 0, 0]}
              opacity={0.8}
            />
            <Line
              yAxisId="apy"
              dataKey="apy"
              stroke="#f59e0b"
              name="APY (annualized)"
              dot={{ fill: '#f59e0b', r: 3 }}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
