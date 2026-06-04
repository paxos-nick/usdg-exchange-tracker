import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { usePaxgSupply } from '../hooks/useVolumeData';

const PAXG_GOLD = '#f5a623';

function formatSupply(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatDate(dateStr, range) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (range === '1y' || range === '3y') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function filterHistory(history, range) {
  if (!history || history.length === 0) return [];
  const now = new Date();
  const cutoffs = {
    '90d': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
    '1y': new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
    '3y': new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000)
  };
  const cutoff = cutoffs[range] || cutoffs['3y'];
  return history.filter(d => parseDate(d.date) >= cutoff);
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const supply = payload[0]?.value;
  return (
    <div style={{
      backgroundColor: '#1a1f2e',
      border: '1px solid #2f3542',
      borderRadius: '8px',
      padding: '10px 14px',
      color: '#e7e9ea'
    }}>
      <div style={{ color: '#71767b', marginBottom: 4, fontSize: 12 }}>{label}</div>
      <div style={{ color: PAXG_GOLD, fontWeight: 600 }}>
        {formatSupply(supply)} PAXG
      </div>
      <div style={{ color: '#71767b', fontSize: 11 }}>
        ≈ {supply?.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} at $1 = 1 oz gold
      </div>
    </div>
  );
};

export default function PaxgSupplyTab() {
  const { data, loading, error, lastUpdated } = usePaxgSupply();
  const [range, setRange] = useState('3y');

  if (loading) {
    return (
      <div className="weekly-trends">
        <h2>PAXG Circulating Supply</h2>
        <div className="loading">Loading PAXG supply data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weekly-trends">
        <h2>PAXG Circulating Supply</h2>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (!data || !data.history || data.history.length === 0) {
    return (
      <div className="weekly-trends">
        <h2>PAXG Circulating Supply</h2>
        <div className="no-data">No supply data available. Run the backfill script to populate historical data.</div>
      </div>
    );
  }

  const filtered = filterHistory(data.history, range);
  const chartData = filtered.map(d => ({
    ...d,
    displayDate: formatDate(d.date, range)
  }));

  const latest = data.history[data.history.length - 1];
  const yearAgoEntry = data.history.find(d => {
    const diff = parseDate(latest.date) - parseDate(d.date);
    return diff >= 364 * 24 * 60 * 60 * 1000 && diff <= 366 * 24 * 60 * 60 * 1000;
  });
  const allTimeHigh = data.history.reduce((max, d) => d.supply > max.supply ? d : max, data.history[0]);
  const allTimeLow = data.history.reduce((min, d) => d.supply < min.supply ? d : min, data.history[0]);

  const yoyChange = yearAgoEntry
    ? ((latest.supply - yearAgoEntry.supply) / yearAgoEntry.supply * 100).toFixed(1)
    : null;

  // Determine Y axis domain with 5% padding
  const supplies = filtered.map(d => d.supply);
  const minSupply = Math.min(...supplies);
  const maxSupply = Math.max(...supplies);
  const padding = (maxSupply - minSupply) * 0.05;
  const yDomain = [Math.floor(minSupply - padding), Math.ceil(maxSupply + padding)];

  return (
    <div className="weekly-trends">
      <h2>PAXG Circulating Supply</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        Daily on-chain circulating supply of PAX Gold (PAXG) — each token backed by 1 troy oz of gold
      </p>

      {/* Summary cards */}
      <section className="wow-section">
        <div className="comparison-grid">
          <div className="comparison-card">
            <div className="comparison-label">Current Supply</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">{latest.date}</span>
                <span className="value-number" style={{ color: PAXG_GOLD }}>{formatSupply(latest.supply)}</span>
              </div>
            </div>
          </div>
          {yoyChange !== null && (
            <div className="comparison-card">
              <div className="comparison-label">Year-over-Year Change</div>
              <div className="comparison-values">
                <div className="comparison-current">
                  <span className="value-label">{yearAgoEntry?.date} → {latest.date}</span>
                  <span className={`value-number ${parseFloat(yoyChange) >= 0 ? 'change-indicator positive' : 'change-indicator negative'}`}>
                    {parseFloat(yoyChange) >= 0 ? '+' : ''}{yoyChange}%
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="comparison-card">
            <div className="comparison-label">3-Year High</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">{allTimeHigh.date}</span>
                <span className="value-number">{formatSupply(allTimeHigh.supply)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">3-Year Low</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">{allTimeLow.date}</span>
                <span className="value-number">{formatSupply(allTimeLow.supply)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Chart */}
      <section className="chart-section">
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Supply Over Time</h3>
          <div className="section-controls">
            {['90d', '1y', '3y'].map(r => (
              <button
                key={r}
                className={`tab-btn ${range === r ? 'active' : ''}`}
                style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => setRange(r)}
              >
                {r === '90d' ? '90 Days' : r === '1y' ? '1 Year' : '3 Years'}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="paxgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PAXG_GOLD} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={PAXG_GOLD} stopOpacity={0.02} />
                </linearGradient>
              </defs>
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
                tickFormatter={formatSupply}
                domain={yDomain}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              {allTimeHigh.supply === maxSupply && (
                <ReferenceLine
                  y={allTimeHigh.supply}
                  stroke={PAXG_GOLD}
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                  label={{ value: 'ATH', fill: PAXG_GOLD, fontSize: 10, opacity: 0.6 }}
                />
              )}
              <Area
                type="monotone"
                dataKey="supply"
                stroke={PAXG_GOLD}
                strokeWidth={2}
                fill="url(#paxgGradient)"
                dot={false}
                activeDot={{ r: 4, fill: PAXG_GOLD, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div style={{ color: '#71767b', fontSize: 11, marginTop: 8 }}>
        Source: on-chain via PublicNode Ethereum RPC · contract{' '}
        <a
          href="https://etherscan.io/token/0x45804880De22913dAFE09f4980848ECE6EcbAf78"
          target="_blank"
          rel="noreferrer"
          style={{ color: PAXG_GOLD }}
        >
          0x4580...af78
        </a>
        {lastUpdated && ` · updated ${lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
      </div>
    </div>
  );
}
