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

const PAXG_COLOR = '#f5a623';
const XAUT_COLOR = '#c9d1d9';

function colorFor(key) { return EXCHANGE_COLORS[key] || '#71767b'; }

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

// Filter + aggregate daily combined-by-date data to chart rows
function buildExchangeChartData(combined, range, activeExchanges) {
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
    .map(d => ({ ...d, displayDate: formatDateLabel(d.date, '1y') }));
}

// Build token chart data: sum each token across selected exchanges, keyed as 'paxg'/'xaut'
function buildTokenChartData(paxgCombined, xautCombined, range, activeExchanges, showToken) {
  const now = new Date();
  const cutoff = range === '30d'
    ? new Date(now.getTime() - 30 * 86400000)
    : new Date(now.getTime() - 365 * 86400000);

  // Collect all dates from both series
  const dateSet = new Set();
  if (showToken !== 'xaut') (paxgCombined || []).forEach(d => dateSet.add(d.date));
  if (showToken !== 'paxg') (xautCombined || []).forEach(d => dateSet.add(d.date));

  const paxgByDate = new Map((paxgCombined || []).map(d => [d.date, d]));
  const xautByDate = new Map((xautCombined || []).map(d => [d.date, d]));

  const filtered = Array.from(dateSet)
    .filter(date => parseDate(date) >= cutoff)
    .sort()
    .map(date => {
      const pRow = paxgByDate.get(date) || {};
      const xRow = xautByDate.get(date) || {};
      const paxg = showToken !== 'xaut' ? activeExchanges.reduce((s, ex) => s + (pRow[ex] || 0), 0) : 0;
      const xaut = showToken !== 'paxg' ? activeExchanges.reduce((s, ex) => s + (xRow[ex] || 0), 0) : 0;
      return { date, paxg, xaut };
    });

  if (range === '30d') {
    return filtered.map(d => ({ ...d, displayDate: formatDateLabel(d.date, range) }));
  }

  const monthly = new Map();
  for (const d of filtered) {
    const key = d.date.slice(0, 7);
    if (!monthly.has(key)) monthly.set(key, { date: `${key}-01`, paxg: 0, xaut: 0 });
    monthly.get(key).paxg += d.paxg;
    monthly.get(key).xaut += d.xaut;
  }
  return Array.from(monthly.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, displayDate: formatDateLabel(d.date, '1y') }));
}

function mergeBoth(paxgCombined, xautCombined, exchanges) {
  const map = new Map();
  for (const d of (paxgCombined || [])) {
    map.set(d.date, { date: d.date });
    for (const ex of exchanges) map.get(d.date)[ex] = (d[ex] || 0);
  }
  for (const d of (xautCombined || [])) {
    if (!map.has(d.date)) map.set(d.date, { date: d.date });
    for (const ex of exchanges) map.get(d.date)[ex] = (map.get(d.date)[ex] || 0) + (d[ex] || 0);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function ExchangePills({ exchanges, active, onToggle, onAll, onNone }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {exchanges.map(ex => {
        const on = active.includes(ex.key);
        return (
          <button key={ex.key} onClick={() => onToggle(ex.key)}
            style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
              border: `2px solid ${colorFor(ex.key)}`,
              background: on ? colorFor(ex.key) : 'transparent',
              color: on ? '#0f1419' : colorFor(ex.key), fontWeight: 600 }}>
            {ex.displayName}
          </button>
        );
      })}
      <button onClick={onAll} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid #2f3542', background: 'transparent', color: '#71767b' }}>All</button>
      <button onClick={onNone} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid #2f3542', background: 'transparent', color: '#71767b' }}>None</button>
    </div>
  );
}

function RangePills({ range, setRange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {['30d', '1y'].map(r => (
        <button key={r} className={`tab-btn ${range === r ? 'active' : ''}`}
          style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setRange(r)}>
          {r === '30d' ? '30 Days' : '1 Year'}
        </button>
      ))}
    </div>
  );
}

function TokenPills({ token, setToken }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: '#1a1f2e', borderRadius: 6, padding: 3 }}>
      {[['paxg','PAXG'],['xaut','XAUT'],['both','Both']].map(([k, label]) => (
        <button key={k} onClick={() => setToken(k)}
          style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: 'none',
            background: token === k ? '#2f3542' : 'transparent',
            color: token === k ? '#e7e9ea' : '#71767b' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function PaxgVolumeTab() {
  const { data, loading, error, lastUpdated } = usePaxgVolume();

  // Chart 1: volume by exchange
  const [c1Token, setC1Token] = useState('paxg');
  const [c1View, setC1View]   = useState('aggregate');
  const [c1Sel, setC1Sel]     = useState(null);
  const [c1Range, setC1Range] = useState('30d');

  // Chart 2: volume by token
  const [c2Token, setC2Token] = useState('both');
  const [c2Sel, setC2Sel]     = useState(null);
  const [c2Range, setC2Range] = useState('30d');

  const exchanges = data?.exchanges || [];
  const allKeys = exchanges.map(e => e.key);

  const c1Active = useMemo(() => c1Sel ?? allKeys, [c1Sel, allKeys]);
  const c2Active = useMemo(() => c2Sel ?? allKeys, [c2Sel, allKeys]);

  function toggle(sel, setSel, key) {
    const cur = sel ?? allKeys;
    setSel(cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]);
  }

  // Chart 1 combined data
  const c1Combined = useMemo(() => {
    if (!data) return [];
    if (c1Token === 'paxg') return data.paxg?.combined || [];
    if (c1Token === 'xaut') return data.xaut?.combined || [];
    return mergeBoth(data.paxg?.combined, data.xaut?.combined, allKeys);
  }, [data, c1Token, allKeys]);

  const c1Data = useMemo(
    () => buildExchangeChartData(c1Combined, c1Range, c1Active),
    [c1Combined, c1Range, c1Active]
  );

  // Chart 2 token data
  const c2Data = useMemo(
    () => buildTokenChartData(data?.paxg?.combined, data?.xaut?.combined, c2Range, c2Active, c2Token),
    [data, c2Range, c2Active, c2Token]
  );

  if (loading) return <div className="weekly-trends"><h2>Gold Token Exchange Volume</h2><div className="loading">Loading...</div></div>;
  if (error)   return <div className="weekly-trends"><h2>Gold Token Exchange Volume</h2><div className="error">Error: {error}</div></div>;
  if (!data)   return null;

  // Summary stats
  function tokenStats(combined30, activeEx) {
    const total = combined30.reduce((s, d) => s + activeEx.reduce((ss, ex) => ss + (d[ex] || 0), 0), 0);
    const peak  = combined30.reduce((max, d) => {
      const v = activeEx.reduce((s, ex) => s + (d[ex] || 0), 0);
      return v > max.v ? { date: d.date, v } : max;
    }, { date: '', v: 0 });
    return { total, avg: total / 30, peak };
  }
  const paxgStats = tokenStats((data.paxg?.combined || []).slice(-30), allKeys);
  const xautStats = tokenStats((data.xaut?.combined || []).slice(-30), allKeys);

  const tooltipStyle = { contentStyle: { backgroundColor: '#1a1f2e', border: '1px solid #2f3542', borderRadius: 8, color: '#e7e9ea' }, labelStyle: { color: '#71767b' } };

  return (
    <div className="weekly-trends">
      <h2>Gold Token Exchange Volume</h2>
      <p style={{ color: '#71767b', marginTop: -8, marginBottom: 24 }}>PAXG and XAUT trading volume across exchanges</p>

      {/* Summary cards */}
      <section className="wow-section">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: '30-Day Volume',    paxg: formatUSD(paxgStats.total), xaut: formatUSD(xautStats.total) },
            { label: 'Avg Daily Volume', paxg: formatUSD(paxgStats.avg),   xaut: formatUSD(xautStats.avg)   },
            { label: 'Peak Day (30d)',   paxg: formatUSD(paxgStats.peak.v), xaut: formatUSD(xautStats.peak.v) }
          ].map(({ label, paxg, xaut }) => (
            <div key={label} className="comparison-card">
              <div className="comparison-label">{label}</div>
              <div style={{ marginTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ color: PAXG_COLOR, fontSize: 11, fontWeight: 600 }}>PAXG</span>
                  <span className="value-number">{paxg}</span>
                </div>
                <div style={{ height: 1, background: '#2f3542', marginBottom: 6 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: XAUT_COLOR, fontSize: 11, fontWeight: 600 }}>XAUT</span>
                  <span className="value-number">{xaut}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Chart 1: Volume by Exchange ─────────────────────────────────── */}
      <section className="chart-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Volume by Exchange</h3>
            <p style={{ color: '#71767b', fontSize: 12, margin: '2px 0 0' }}>How much is trading on each venue</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <TokenPills token={c1Token} setToken={setC1Token} />
            {['aggregate','select'].map(v => (
              <button key={v} className={`tab-btn ${c1View === v ? 'active' : ''}`}
                style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setC1View(v)}>
                {v === 'aggregate' ? 'All Exchanges' : 'Select Exchanges'}
              </button>
            ))}
            <RangePills range={c1Range} setRange={setC1Range} />
          </div>
        </div>

        {c1View === 'select' && (
          <ExchangePills exchanges={exchanges} active={c1Active}
            onToggle={k => toggle(c1Sel, setC1Sel, k)}
            onAll={() => setC1Sel(allKeys)} onNone={() => setC1Sel([])} />
        )}

        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={c1Data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
              <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
              <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickFormatter={formatUSDShort} width={70} />
              <Tooltip {...tooltipStyle} formatter={(v, name) => [formatUSD(v), name]} />
              <Legend wrapperStyle={{ color: '#e7e9ea' }} />
              {c1Active.map((key, i) => {
                const ex = exchanges.find(e => e.key === key);
                return (
                  <Bar key={key} dataKey={key} stackId="vol" fill={colorFor(key)}
                    name={ex?.displayName || key}
                    radius={i === c1Active.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Chart 2: Volume by Token ─────────────────────────────────────── */}
      <section className="chart-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Volume by Token</h3>
            <p style={{ color: '#71767b', fontSize: 12, margin: '2px 0 0' }}>How much PAXG vs XAUT is trading</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <TokenPills token={c2Token} setToken={setC2Token} />
            <RangePills range={c2Range} setRange={setC2Range} />
          </div>
        </div>

        <ExchangePills exchanges={exchanges} active={c2Active}
          onToggle={k => toggle(c2Sel, setC2Sel, k)}
          onAll={() => setC2Sel(allKeys)} onNone={() => setC2Sel([])} />

        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={c2Data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
              <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
              <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickFormatter={formatUSDShort} width={70} />
              <Tooltip {...tooltipStyle} formatter={(v, name) => [formatUSD(v), name]} />
              <Legend wrapperStyle={{ color: '#e7e9ea' }} />
              {c2Token !== 'xaut' && (
                <Bar dataKey="paxg" stackId="vol" fill={PAXG_COLOR} name="PAXG"
                  radius={c2Token === 'paxg' ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              )}
              {c2Token !== 'paxg' && (
                <Bar dataKey="xaut" stackId="vol" fill={XAUT_COLOR} name="XAUT" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Last updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (auto-refreshes every 6 hours)
        </div>
      )}
    </div>
  );
}
