import { useState } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { useBinancePaxg } from '../hooks/useVolumeData';

const PAXG_COLOR = '#f5a623';
const XAUT_COLOR = '#c9d1d9';
const TEAL = '#00d4aa';

function formatUSD(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatUSDShort(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

function formatDate(dateStr, range) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (range === '1y') return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function filterAndAggregate(combinedVolume, range) {
  if (!combinedVolume?.length) return [];
  const now = new Date();
  const cutoff = range === '30d'
    ? new Date(now.getTime() - 30 * 86400000)
    : new Date(now.getTime() - 365 * 86400000);

  const filtered = combinedVolume.filter(d => parseDate(d.date) >= cutoff);

  if (range === '30d') {
    return filtered.map(d => ({ ...d, displayDate: formatDate(d.date, range) }));
  }

  // Aggregate to monthly
  const monthly = new Map();
  filtered.forEach(d => {
    const key = d.date.slice(0, 7);
    if (!monthly.has(key)) monthly.set(key, { paxg: 0, xaut: 0 });
    monthly.get(key).paxg += d.paxg;
    monthly.get(key).xaut += d.xaut;
  });
  return Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      date: `${month}-01`,
      paxg: v.paxg,
      xaut: v.xaut,
      displayDate: formatDate(`${month}-01`, '1y')
    }));
}

function DepthTable({ symbol, depth, color }) {
  return (
    <div>
      <h4 style={{ color, marginBottom: 8 }}>{symbol}</h4>
      <p style={{ color: '#71767b', fontSize: 11, marginTop: -4, marginBottom: 12 }}>
        <span style={{ color: TEAL }}>Bid: {formatUSD(depth.bestBid)}</span>
        &nbsp;·&nbsp;
        <span style={{ color: '#ef4444' }}>Ask: {formatUSD(depth.bestAsk)}</span>
        &nbsp;·&nbsp; Spread: {depth.spreadBps.toFixed(2)} bps
      </p>
      <table className="depth-table">
        <thead>
          <tr>
            <th>Level</th>
            <th style={{ textAlign: 'right', color: TEAL }}>Bid</th>
            <th style={{ textAlign: 'right', color: '#ef4444' }}>Ask</th>
          </tr>
        </thead>
        <tbody>
          {depth.bpsLevels.map(bps => (
            <tr key={bps}>
              <td>{bps} bps</td>
              <td style={{ textAlign: 'right' }}>{formatUSD(depth.bidDepth[bps] || 0)}</td>
              <td style={{ textAlign: 'right' }}>{formatUSD(depth.askDepth[bps] || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BinancePaxgTab() {
  const { data, loading, error, lastUpdated } = useBinancePaxg();
  const [range, setRange] = useState('30d');

  if (loading) return (
    <div className="weekly-trends">
      <h2>Binance Gold Markets</h2>
      <div className="loading">Loading Binance data...</div>
    </div>
  );

  if (error) return (
    <div className="weekly-trends">
      <h2>Binance Gold Markets</h2>
      <div className="error">Error: {error}</div>
    </div>
  );

  if (!data) return null;

  const { paxg, xaut, combinedVolume } = data;
  const chartData = filterAndAggregate(combinedVolume, range);

  const paxg30d = paxg.dailyVolume.slice(-30).reduce((s, d) => s + d.volume, 0);
  const xaut30d = xaut.dailyVolume.slice(-30).reduce((s, d) => s + d.volume, 0);
  const paxgLatest = paxg.dailyVolume[paxg.dailyVolume.length - 1];
  const xautLatest = xaut.dailyVolume[xaut.dailyVolume.length - 1];

  return (
    <div className="weekly-trends">
      <h2>Binance Gold Markets</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        PAXG/USDT and XAUT/USDT trading volume and orderbook depth on Binance
      </p>

      {/* Summary cards */}
      <section className="wow-section">
        <div className="comparison-grid">
          <div className="comparison-card">
            <div className="comparison-label" style={{ color: PAXG_COLOR }}>PAXG/USDT Price</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">Current</span>
                <span className="value-number">{formatUSD(paxgLatest?.close || 0)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label" style={{ color: PAXG_COLOR }}>PAXG 30-Day Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">USDT</span>
                <span className="value-number">{formatUSD(paxg30d)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label" style={{ color: XAUT_COLOR }}>XAUT/USDT Price</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">Current</span>
                <span className="value-number">{formatUSD(xautLatest?.close || 0)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label" style={{ color: XAUT_COLOR }}>XAUT 30-Day Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">USDT</span>
                <span className="value-number">{formatUSD(xaut30d)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Volume chart */}
      <section className="chart-section">
        <div className="section-header" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Trading Volume (USDT)</h3>
          <div className="section-controls">
            {['30d', '1y'].map(r => (
              <button
                key={r}
                className={`tab-btn ${range === r ? 'active' : ''}`}
                style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => setRange(r)}
              >
                {r === '30d' ? '30 Days' : '1 Year'}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
              <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
              <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickFormatter={formatUSDShort} width={70} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #2f3542', borderRadius: 8, color: '#e7e9ea' }}
                labelStyle={{ color: '#71767b' }}
                formatter={(v, name) => [formatUSD(v), name]}
              />
              <Legend wrapperStyle={{ color: '#e7e9ea' }} />
              <Bar dataKey="paxg" stackId="vol" fill={PAXG_COLOR} name="PAXG/USDT" />
              <Bar dataKey="xaut" stackId="vol" fill={XAUT_COLOR} name="XAUT/USDT" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Depth tables side by side */}
      <section className="chart-section">
        <h3>Orderbook Depth</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          <DepthTable symbol="PAXG/USDT" depth={paxg.depth} color={PAXG_COLOR} />
          <DepthTable symbol="XAUT/USDT" depth={xaut.depth} color={XAUT_COLOR} />
        </div>
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (auto-refreshes every 5 min)
        </div>
      )}
    </div>
  );
}
