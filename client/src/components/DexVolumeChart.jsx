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
import { useDexHistory } from '../hooks/useVolumeData';

function formatVolume(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CHAIN_COLORS = {
  solana: '#9945FF',
  ethereum: '#627EEA'
};

function ChainVolumeChart({ history }) {
  const chainNames = [...new Set(history.flatMap(s =>
    s.pools.map(p => p.chain || 'solana')
  ))];

  const chartData = history.map(snapshot => {
    const row = { date: snapshot.date, displayDate: formatDate(snapshot.date) };
    let total = 0;
    snapshot.pools.forEach(p => {
      const chain = p.chain || 'solana';
      row[chain] = (row[chain] || 0) + p.volume24h;
      total += p.volume24h;
    });
    row._total = total;
    return row;
  });

  return (
    <div className="dex-chart-section">
      <h3 className="defi-subsection-title">DEX Trading Volume by Chain</h3>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
            <XAxis
              dataKey="displayDate"
              stroke="#71767b"
              tick={{ fill: '#71767b', fontSize: 11 }}
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
              formatter={(value, name) => [`$${formatVolume(value)}`, name.charAt(0).toUpperCase() + name.slice(1)]}
              labelFormatter={(label, payload) => {
                const total = payload?.[0]?.payload?._total;
                return total != null
                  ? `${label}  —  Total: $${formatVolume(total)}`
                  : label;
              }}
            />
            <Legend
              wrapperStyle={{ color: '#e7e9ea' }}
              iconType="square"
              formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
            />
            {chainNames.map((chain, index) => (
              <Bar
                key={chain}
                dataKey={chain}
                stackId="volume"
                fill={CHAIN_COLORS[chain] || '#888'}
                radius={index === chainNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                name={chain}
              >
                {index === chainNames.length - 1 && (
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
    </div>
  );
}

export default function DexVolumeChart() {
  const { data, loading } = useDexHistory();

  if (loading) return <div className="loading">Loading DEX volume history...</div>;

  const history = data?.history || [];
  if (history.length === 0) {
    return (
      <div className="chart-empty-state">
        No DEX volume history yet. Daily snapshots will accumulate automatically.
      </div>
    );
  }

  return <ChainVolumeChart history={history} />;
}
