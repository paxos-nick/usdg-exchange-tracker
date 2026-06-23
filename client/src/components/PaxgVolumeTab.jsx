import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { usePaxgVolume } from '../hooks/useVolumeData';

const EXCHANGE_COLORS = {
  binance: '#f5a623',
  kraken:  '#7c3aed',
  coinbase:'#0052ff',
  okx:     '#10b981',
  gate:    '#3b82f6',
  kucoin:  '#ec4899',
  bitget:  '#00d4aa',
};

function colorFor(key) {
  return EXCHANGE_COLORS[key] || '#71767b';
}

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

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateLabel(s, range) {
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (range === '1y') return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildChartData(combined, range, activeExchanges) {
  if (!combined?.length) return [];
  const now = new Date();
  const cutoff = range === '30d'
    ? new Date(now.getTime() - 30 * 86400000)
    : new Date(now.getTime() - 365 * 86400000);

  const filtered = combined.filter(d => parseDate(d.date) >= cutoff);

  if (range === '30d') {
    return filtered.map(d => ({
      ...d,
      displayDate: formatDateLabel(d.date, range),
      total: activeExchanges.reduce((s, ex) => s + (d[ex] || 0), 0)
    }));
  }

  const monthly = new Map();
  for (const d of filtered) {
    const key = d.date.slice(0, 7);
    if (!monthly.has(key)) monthly.set(key, { date: `${key}-01` });
    const row = monthly.get(key);
    for (const ex of activeExchanges) row[ex] = (row[ex] || 0) + (d[ex] || 0);
  }
  return Array.from(monthly.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      displayDate: formatDateLabel(d.date, '1y'),
      total: activeExchanges.reduce((s, ex) => s + (d[ex] || 0), 0)
    }));
}

// Merge two combined arrays (paxg + xaut) by date for the "Both" view
function mergeBoth(paxgCombined, xautCombined, exchanges) {
  const map = new Map();
  for (const d of (paxgCombined || [])) {
    map.set(d.date, { date: d.date });
    for (const ex of exchanges) map.get(d.date)[ex] = (d[ex] || 0);
  }
  for (const d of (xautCombined || [])) {
    if (!map.has(d.date)) map.set(d.date, { date: d.date });
    for (const ex of exchanges) {
      map.get(d.date)[ex] = (map.get(d.date)[ex] || 0) + (d[ex] || 0);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export default function PaxgVolumeTab() {
  const { data, loading, error, lastUpdated } = usePaxgVolume();
  const [range, setRange] = useState('30d');
  const [view, setView] = useState('aggregate');
  const [token, setToken] = useState('paxg');   // 'paxg' | 'xaut' | 'both'
  const [selected, setSelected] = useState(null);

  const exchanges = data?.exchanges || [];

  const activeExchanges = useMemo(() => {
    if (!exchanges.length) return [];
    return selected ?? exchanges.map(e => e.key);
  }, [exchanges, selected]);

  function toggleExchange(key) {
    const current = selected ?? exchanges.map(e => e.key);
    setSelected(current.includes(key) ? current.filter(k => k !== key) : [...current, key]);
  }

  const combined = useMemo(() => {
    if (!data) return [];
    const exKeys = exchanges.map(e => e.key);
    if (token === 'paxg') return data.paxg?.combined || [];
    if (token === 'xaut') return data.xaut?.combined || [];
    return mergeBoth(data.paxg?.combined, data.xaut?.combined, exKeys);
  }, [data, token, exchanges]);

  const chartData = useMemo(
    () => buildChartData(combined, range, activeExchanges),
    [combined, range, activeExchanges]
  );

  if (loading) return (
    <div className="weekly-trends">
      <h2>Gold Token Exchange Volume</h2>
      <div className="loading">Loading volume data...</div>
    </div>
  );

  if (error) return (
    <div className="weekly-trends">
      <h2>Gold Token Exchange Volume</h2>
      <div className="error">Error: {error}</div>
    </div>
  );

  if (!data) return null;


  // Always-visible per-token stats (computed independently of token toggle)
  function tokenStats(combined30) {
    const total = combined30.reduce((s, d) => s + activeExchanges.reduce((ss, ex) => ss + (d[ex] || 0), 0), 0);
    const avg = total / 30;
    const peak = combined30.reduce((max, d) => {
      const v = activeExchanges.reduce((s, ex) => s + (d[ex] || 0), 0);
      return v > max.v ? { date: d.date, v } : max;
    }, { date: '', v: 0 });
    return { total, avg, peak };
  }
  const paxgStats = tokenStats((data.paxg?.combined || []).slice(-30));
  const xautStats = tokenStats((data.xaut?.combined || []).slice(-30));

  return (
    <div className="weekly-trends">
      <h2>Gold Token Exchange Volume</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        PAXG and XAUT trading volume across exchanges
      </p>

      {/* Always-visible comparison stats */}
      <section className="wow-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[{ label: 'PAXG', stats: paxgStats, color: '#f5a623' }, { label: 'XAUT', stats: xautStats, color: '#c9d1d9' }].map(({ label, stats, color }) => (
            <div key={label}>
              <div style={{ color, fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: '0.05em' }}>{label}</div>
              <div className="comparison-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="comparison-card">
                  <div className="comparison-label">30-Day Volume</div>
                  <div className="comparison-values">
                    <div className="comparison-current">
                      <span className="value-label">All exchanges</span>
                      <span className="value-number">{formatUSD(stats.total)}</span>
                    </div>
                  </div>
                </div>
                <div className="comparison-card">
                  <div className="comparison-label">Avg Daily Volume</div>
                  <div className="comparison-values">
                    <div className="comparison-current">
                      <span className="value-label">30-day avg</span>
                      <span className="value-number">{formatUSD(stats.avg)}</span>
                    </div>
                  </div>
                </div>
                <div className="comparison-card">
                  <div className="comparison-label">Peak Day (30d)</div>
                  <div className="comparison-values">
                    <div className="comparison-current">
                      <span className="value-label">{stats.peak.date || '—'}</span>
                      <span className="value-number">{formatUSD(stats.peak.v)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* Controls row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        {/* Left: token + view toggles */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Token toggle */}
          <div style={{ display: 'flex', gap: 4, background: '#1a1f2e', borderRadius: 6, padding: 3 }}>
            {[['paxg','PAXG'],['xaut','XAUT'],['both','Both']].map(([k, label]) => (
              <button key={k} onClick={() => setToken(k)}
                style={{ padding: '3px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: 'none',
                  background: token === k ? '#2f3542' : 'transparent', color: token === k ? '#e7e9ea' : '#71767b' }}>
                {label}
              </button>
            ))}
          </div>
          {/* View toggle */}
          {['aggregate','select'].map(v => (
            <button key={v} className={`tab-btn ${view === v ? 'active' : ''}`}
              style={{ padding: '4px 14px', fontSize: 13 }} onClick={() => setView(v)}>
              {v === 'aggregate' ? 'Aggregate' : 'By Exchange'}
            </button>
          ))}
        </div>
        {/* Right: range */}
        <div style={{ display: 'flex', gap: 8 }}>
          {['30d','1y'].map(r => (
            <button key={r} className={`tab-btn ${range === r ? 'active' : ''}`}
              style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setRange(r)}>
              {r === '30d' ? '30 Days' : '1 Year'}
            </button>
          ))}
        </div>
      </div>

      {/* Exchange selector (By Exchange view) */}
      {view === 'select' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {exchanges.map(ex => {
            const on = activeExchanges.includes(ex.key);
            return (
              <button key={ex.key} onClick={() => toggleExchange(ex.key)}
                style={{ padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                  border: `2px solid ${colorFor(ex.key)}`,
                  background: on ? colorFor(ex.key) : 'transparent',
                  color: on ? '#0f1419' : colorFor(ex.key), fontWeight: 600 }}>
                {ex.displayName}
              </button>
            );
          })}
          <button onClick={() => setSelected(exchanges.map(e => e.key))}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid #2f3542', background: 'transparent', color: '#71767b' }}>
            All
          </button>
          <button onClick={() => setSelected([])}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid #2f3542', background: 'transparent', color: '#71767b' }}>
            None
          </button>
        </div>
      )}

      {/* Chart */}
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
            {activeExchanges.map((key, i) => {
              const ex = exchanges.find(e => e.key === key);
              return (
                <Bar key={key} dataKey={key} stackId="vol" fill={colorFor(key)}
                  name={ex?.displayName || key}
                  radius={i === activeExchanges.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {lastUpdated && (
        <div className="refresh-info" style={{ marginTop: 8 }}>
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (auto-refreshes every 6 hours)
        </div>
      )}
    </div>
  );
}
