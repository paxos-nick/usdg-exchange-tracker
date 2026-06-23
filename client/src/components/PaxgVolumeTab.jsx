import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { usePaxgVolume } from '../hooks/useVolumeData';

const EXCHANGE_COLORS = {
  binance: '#f5a623',
  kraken: '#7c3aed',
  coinbase: '#0052ff',
  okx: '#10b981',
  gate: '#3b82f6',
  kucoin: '#ec4899',
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

function filterAndAggregate(combinedByDate, range, selectedExchanges) {
  if (!combinedByDate?.length) return [];
  const now = new Date();
  const cutoff = range === '30d'
    ? new Date(now.getTime() - 30 * 86400000)
    : new Date(now.getTime() - 365 * 86400000);

  const filtered = combinedByDate.filter(d => parseDate(d.date) >= cutoff);

  if (range === '30d') {
    return filtered.map(d => ({
      ...d,
      displayDate: formatDateLabel(d.date, range),
      total: selectedExchanges.reduce((s, ex) => s + (d[ex] || 0), 0)
    }));
  }

  // Monthly aggregation
  const monthly = new Map();
  for (const d of filtered) {
    const key = d.date.slice(0, 7);
    if (!monthly.has(key)) monthly.set(key, { date: `${key}-01` });
    const row = monthly.get(key);
    for (const ex of selectedExchanges) {
      row[ex] = (row[ex] || 0) + (d[ex] || 0);
    }
  }
  return Array.from(monthly.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      displayDate: formatDateLabel(d.date, '1y'),
      total: selectedExchanges.reduce((s, ex) => s + (d[ex] || 0), 0)
    }));
}

export default function PaxgVolumeTab() {
  const { data, loading, error, lastUpdated } = usePaxgVolume();
  const [range, setRange] = useState('30d');
  const [view, setView] = useState('aggregate'); // 'aggregate' | 'select'
  const [selected, setSelected] = useState(null); // null = all; initialized on first data load

  const exchanges = data?.exchanges || [];
  const activeExchanges = useMemo(() => {
    if (!exchanges.length) return [];
    if (selected === null) return exchanges.map(e => e.key);
    return selected;
  }, [exchanges, selected]);

  function toggleExchange(key) {
    const current = selected ?? exchanges.map(e => e.key);
    setSelected(
      current.includes(key)
        ? current.filter(k => k !== key)
        : [...current, key]
    );
  }

  if (loading) return (
    <div className="weekly-trends">
      <h2>PAXG Exchange Volume</h2>
      <div className="loading">Loading PAXG volume data...</div>
    </div>
  );

  if (error) return (
    <div className="weekly-trends">
      <h2>PAXG Exchange Volume</h2>
      <div className="error">Error: {error}</div>
    </div>
  );

  if (!data?.combinedByDate?.length) return (
    <div className="weekly-trends">
      <h2>PAXG Exchange Volume</h2>
      <div className="no-data">No data available.</div>
    </div>
  );

  const { combinedByDate } = data;
  const chartData = filterAndAggregate(combinedByDate, range, activeExchanges);

  // Summary stats (all exchanges, 30d)
  const last30 = combinedByDate.slice(-30);
  const total30d = last30.reduce((s, d) => s + (d.total || 0), 0);
  const avgDaily = total30d / 30;
  const peakDay = last30.reduce((max, d) => d.total > max.total ? d : max, { date: '', total: 0 });

  return (
    <div className="weekly-trends">
      <h2>PAXG Exchange Volume</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>
        PAXG/USDT trading volume across exchanges
      </p>

      {/* Summary cards */}
      <section className="wow-section">
        <div className="comparison-grid">
          <div className="comparison-card">
            <div className="comparison-label">30-Day Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">All exchanges</span>
                <span className="value-number">{formatUSD(total30d)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">Avg Daily Volume</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">30-day avg</span>
                <span className="value-number">{formatUSD(avgDaily)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">Peak Day (30d)</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">{peakDay.date || '—'}</span>
                <span className="value-number">{formatUSD(peakDay.total)}</span>
              </div>
            </div>
          </div>
          <div className="comparison-card">
            <div className="comparison-label">Exchanges Tracked</div>
            <div className="comparison-values">
              <div className="comparison-current">
                <span className="value-label">Active sources</span>
                <span className="value-number">{exchanges.length}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* View + range controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['aggregate', 'select'].map(v => (
            <button
              key={v}
              className={`tab-btn ${view === v ? 'active' : ''}`}
              style={{ padding: '4px 14px', fontSize: 13 }}
              onClick={() => setView(v)}
            >
              {v === 'aggregate' ? 'Aggregate' : 'By Exchange'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
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

      {/* Exchange selector (shown in 'select' view) */}
      {view === 'select' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {exchanges.map(ex => {
            const on = activeExchanges.includes(ex.key);
            return (
              <button
                key={ex.key}
                onClick={() => toggleExchange(ex.key)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  cursor: 'pointer',
                  border: `2px solid ${colorFor(ex.key)}`,
                  background: on ? colorFor(ex.key) : 'transparent',
                  color: on ? '#0f1419' : colorFor(ex.key),
                  fontWeight: 600
                }}
              >
                {ex.displayName}
              </button>
            );
          })}
          <button
            onClick={() => setSelected(exchanges.map(e => e.key))}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid #2f3542', background: 'transparent', color: '#71767b' }}
          >
            All
          </button>
          <button
            onClick={() => setSelected([])}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid #2f3542', background: 'transparent', color: '#71767b' }}
          >
            None
          </button>
        </div>
      )}

      {/* Volume chart */}
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
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="vol"
                  fill={colorFor(key)}
                  name={ex?.displayName || key}
                  radius={i === activeExchanges.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
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
