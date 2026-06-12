import { useState } from 'react';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { useBinancePaxg } from '../hooks/useVolumeData';

const GOLD = '#f5a623';
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

function filterAndAggregate(dailyVolume, range) {
  if (!dailyVolume?.length) return [];
  const now = new Date();
  const cutoff = range === '30d'
    ? new Date(now.getTime() - 30 * 86400000)
    : new Date(now.getTime() - 365 * 86400000);

  const filtered = dailyVolume.filter(d => parseDate(d.date) >= cutoff);

  if (range === '30d') {
    return filtered.map(d => ({ ...d, displayDate: formatDate(d.date, range) }));
  }

  // Aggregate to monthly
  const monthly = new Map();
  filtered.forEach(d => {
    const key = d.date.slice(0, 7);
    monthly.set(key, (monthly.get(key) || 0) + d.volume);
  });
  return Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, volume]) => ({
      date: `${month}-01`,
      volume,
      displayDate: formatDate(`${month}-01`, '1y')
    }));
}

function DepthBar({ label, bid, ask, maxVal }) {
  const bidPct = maxVal > 0 ? (bid / maxVal) * 100 : 0;
  const askPct = maxVal > 0 ? (ask / maxVal) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#71767b', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: TEAL }}>{formatUSD(bid)}</span>
        <span style={{ fontWeight: 600, color: '#e7e9ea' }}>{label}</span>
        <span style={{ color: '#ef4444' }}>{formatUSD(ask)}</span>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#2f3542' }}>
        <div style={{ width: `${bidPct}%`, background: TEAL, marginLeft: 'auto' }} />
        <div style={{ width: 2, background: '#1a1f2e' }} />
        <div style={{ width: `${askPct}%`, background: '#ef4444' }} />
      </div>
    </div>
  );
}

export default function BinancePaxgTab() {
  const { data, loading, error, lastUpdated } = useBinancePaxg();
  const [range, setRange] = useState('30d');

  if (loading) return (
    <div className="weekly-trends">
      <h2>Binance PAXG/USDT</h2>
      <div className="loading">Loading Binance PAXG data...</div>
    </div>
  );

  if (error) return (
    <div className="weekly-trends">
      <h2>Binance PAXG/USDT</h2>
      <div className="error">Error: {error}</div>
    </div>
  );

  if (!data) return null;

  const { dailyVolume, depth } = data;
  const chartData = filterAndAggregate(dailyVolume, range);
  const total30d = dailyVolume.slice(-30).reduce((s, d) => s + d.volume, 0);
  const avgDaily30d = total30d / 30;
  const latest = dailyVolume[dailyVolume.length - 1];

  const maxDepth = Math.max(...depth.bpsLevels.map(b => Math.max(depth.bidDepth[b] || 0, depth.askDepth[b] || 0)));

  return (
    <div className="weekly-trends">
      <h2>Binance PAXG/USDT</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        PAX Gold trading volume and orderbook depth on Binance
      </p>

      {/* Summary cards */}
      <section className="wow-section">
        <div className="comparison-grid">
          <div className="comparison-card">
            <div className="comparison-label">Current Price</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">PAXG/USDT</span>
                <span className="value-number" style={{ color: GOLD }}>{formatUSD(latest?.close || 0)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">30-Day Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">USDT</span>
                <span className="value-number">{formatUSD(total30d)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">Avg Daily Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">30-day avg</span>
                <span className="value-number">{formatUSD(avgDaily30d)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">Spread</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">Best bid/ask</span>
                <span className="value-number">{depth.spreadBps.toFixed(2)} bps</span>
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
                formatter={(v) => [formatUSD(v), 'Volume (USDT)']}
              />
              <Bar dataKey="volume" fill={GOLD} radius={[4, 4, 0, 0]} name="Volume (USDT)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Depth & Spread */}
      <section className="chart-section">
        <h3>Orderbook Depth</h3>
        <p style={{ color: '#71767b', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
          Cumulative bid (teal) and ask (red) liquidity at each depth level from mid price ${depth.midPrice.toFixed(2)}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          {/* Visual bars */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#71767b', fontSize: 11, marginBottom: 8 }}>
              <span style={{ color: TEAL }}>← Bids</span>
              <span>Level</span>
              <span style={{ color: '#ef4444' }}>Asks →</span>
            </div>
            {depth.bpsLevels.map(bps => (
              <DepthBar
                key={bps}
                label={`${bps} bps`}
                bid={depth.bidDepth[bps] || 0}
                ask={depth.askDepth[bps] || 0}
                maxVal={maxDepth}
              />
            ))}
          </div>

          {/* Numeric table */}
          <table className="depth-table" style={{ alignSelf: 'start' }}>
            <thead>
              <tr>
                <th>Level</th>
                <th style={{ textAlign: 'right', color: TEAL }}>Bid Depth</th>
                <th style={{ textAlign: 'right', color: '#ef4444' }}>Ask Depth</th>
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
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (auto-refreshes every 5 min)
        </div>
      )}
    </div>
  );
}
