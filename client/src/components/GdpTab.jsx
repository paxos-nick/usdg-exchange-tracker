import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList
} from 'recharts';
import { useAaveUsdgHistory, useVolumeData, usePairVolumeData } from '../hooks/useVolumeData';

// ── Warm gold/amber palette — intentionally distinct from the rest of the dashboard ──
const GDP_BG        = 'linear-gradient(135deg, #1c1508 0%, #201a08 100%)';
const GDP_BORDER    = '#3d2e0a';
const GDP_CARD_BG   = '#241c09';

const C_AAVE_BORROW = '#f59e0b'; // amber-500
const C_AAVE_NIM    = '#b45309'; // amber-700
const C_OKX         = '#ea580c'; // orange-600
const C_BULLISH_STB = '#e11d48'; // rose-600
const C_BULLISH_RSK = '#9f1239'; // rose-900
const C_TOTAL_LINE  = '#fbbf24'; // amber-400
const C_MUTED       = '#92786b';
const C_TEXT        = '#f5e6c8';
const C_TEXT_DIM    = '#9d8a72';
const C_GRID        = '#2e2208';

const NIM_APY      = 0.031;
const STABLE_FEE   = 0.0002; // 2 bps
const RISK_FEE     = 0.0007; // 7 bps

// ── Data computation ──────────────────────────────────────────────────────────────

const GDP_KEYS = ['aaveBorrow', 'aaveNim', 'okxTrading', 'bullishStable', 'bullishRisk'];

function emptyRow(date) {
  return { date, aaveBorrow: 0, aaveNim: 0, okxTrading: 0, bullishStable: 0, bullishRisk: 0 };
}

function computeDaily(aaveHist, okxData, bullishPairs) {
  const byDate = {};

  // AAVE: borrow interest + NIM on idle supply
  for (const row of (aaveHist?.history || [])) {
    const idle = Math.max((row.total_supply || 0) - (row.total_debt || 0), 0);
    byDate[row.date] = {
      ...emptyRow(row.date),
      aaveBorrow: row.daily_interest || 0,
      aaveNim:    idle * NIM_APY / 365,
    };
  }

  // OKX: single stable/stable pair USDG-USDT
  for (const row of (okxData?.dailyVolume || [])) {
    if (!byDate[row.date]) byDate[row.date] = emptyRow(row.date);
    byDate[row.date].okxTrading = (row.volume || 0) * STABLE_FEE;
  }

  // Bullish: USDGUSDC (stable 2bps) + BTCUSDG (risk 7bps)
  const bpv = bullishPairs?.volumeByPair || {};
  for (const row of (bpv['USDGUSDC'] || [])) {
    if (!byDate[row.date]) byDate[row.date] = emptyRow(row.date);
    byDate[row.date].bullishStable = (row.volume || 0) * STABLE_FEE;
  }
  for (const row of (bpv['BTCUSDG'] || [])) {
    if (!byDate[row.date]) byDate[row.date] = emptyRow(row.date);
    byDate[row.date].bullishRisk = (row.volume || 0) * RISK_FEE;
  }

  return Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ ...r, total: GDP_KEYS.reduce((s, k) => s + r[k], 0) }));
}

function parseDate(d) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function aggregateBy(daily, unit) {
  const buckets = {};
  for (const row of daily) {
    const d = parseDate(row.date);
    let key, label, sort;
    if (unit === 'month') {
      key = row.date.slice(0, 7);
      label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      sort = key;
    } else {
      const y = d.getFullYear();
      const q = Math.ceil((d.getMonth() + 1) / 3);
      key = `${y}-Q${q}`;
      label = `Q${q} '${String(y).slice(2)}`;
      sort = `${y}-0${q}`;
    }
    if (!buckets[key]) {
      buckets[key] = { period: key, label, sort, ...emptyRow(key), total: 0 };
    }
    for (const k of [...GDP_KEYS, 'total']) {
      buckets[key][k] += row[k] || 0;
    }
  }
  return Object.values(buckets).sort((a, b) => a.sort.localeCompare(b.sort));
}

// ── Formatting ────────────────────────────────────────────────────────────────────

function fmtUSD(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtShort(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v?.toFixed(0) || 0}`;
}

function fmtDate(d, view) {
  const dt = parseDate(d);
  if (view === '30d') return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Stat tile ─────────────────────────────────────────────────────────────────────

function GdpTile({ label, value, sub, color }) {
  return (
    <div style={{ background: GDP_CARD_BG, border: `1px solid ${GDP_BORDER}`, borderRadius: 10,
      padding: '14px 18px', minWidth: 140 }}>
      <div style={{ color: C_TEXT_DIM, fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || C_TOTAL_LINE, fontSize: 22, fontWeight: 700 }}>{fmtUSD(value)}</div>
      {sub && <div style={{ color: C_TEXT_DIM, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────────

function GdpTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const rows = [
    { label: 'AAVE borrow interest', key: 'aaveBorrow', color: C_AAVE_BORROW },
    { label: 'AAVE NIM (idle supply)', key: 'aaveNim',   color: C_AAVE_NIM    },
    { label: 'OKX trading (2bps)',    key: 'okxTrading', color: C_OKX         },
    { label: 'Bullish stable (2bps)', key: 'bullishStable', color: C_BULLISH_STB },
    { label: 'Bullish risk (7bps)',   key: 'bullishRisk',   color: C_BULLISH_RSK },
  ].filter(row => r[row.key] > 0);

  return (
    <div style={{ background: '#1c1508', border: `1px solid ${GDP_BORDER}`, borderRadius: 8,
      padding: '10px 14px', color: C_TEXT, minWidth: 220 }}>
      <div style={{ color: C_TEXT_DIM, marginBottom: 8, fontSize: 12 }}>{label}</div>
      {rows.map(row => (
        <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between',
          gap: 16, fontSize: 12, padding: '1px 0' }}>
          <span style={{ color: row.color }}>{row.label}</span>
          <span style={{ color: C_TEXT }}>{fmtUSD(r[row.key])}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${GDP_BORDER}`, marginTop: 6, paddingTop: 6,
        display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 12 }}>
        <span style={{ color: C_TOTAL_LINE }}>Total GDP</span>
        <span style={{ color: C_TOTAL_LINE }}>{fmtUSD(r.total)}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────────

const VIEWS = [
  { id: '30d', label: '30 Days' },
  { id: '12m', label: '12 Months' },
  { id: '4q',  label: '4 Quarters' },
];

export default function GdpTab() {
  const [view, setView] = useState('30d');

  const { data: aaveHist,     loading: aaveLoading }    = useAaveUsdgHistory();
  const { data: okxData,      loading: okxLoading }     = useVolumeData('okx');
  const { data: bullishPairs, loading: bullishLoading } = usePairVolumeData('bullish');

  const loading = aaveLoading || okxLoading || bullishLoading;

  const daily = useMemo(
    () => computeDaily(aaveHist, okxData, bullishPairs),
    [aaveHist, okxData, bullishPairs]
  );

  const chartData = useMemo(() => {
    if (!daily.length) return [];
    if (view === '30d') {
      return daily.slice(-30).map(r => ({ ...r, displayDate: fmtDate(r.date, '30d') }));
    }
    const periods = view === '12m'
      ? aggregateBy(daily, 'month').slice(-12)
      : aggregateBy(daily, 'quarter').slice(-4);
    return periods.map(r => ({ ...r, displayDate: r.label }));
  }, [daily, view]);

  // Summary totals for the selected window
  const windowTotal = useMemo(() => {
    const zero = { total: 0, aaveBorrow: 0, aaveNim: 0, okxTrading: 0, bullishStable: 0, bullishRisk: 0 };
    return chartData.reduce((acc, r) => {
      for (const k of [...GDP_KEYS, 'total']) acc[k] += r[k] || 0;
      return acc;
    }, zero);
  }, [chartData]);

  const periodLabel = view === '30d' ? 'last 30 days' : view === '12m' ? 'last 12 months' : 'last 4 quarters';

  return (
    <div style={{ background: GDP_BG, borderRadius: 16, padding: 24,
      border: `1px solid ${GDP_BORDER}`, fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: C_TOTAL_LINE, margin: 0, fontSize: 22, fontWeight: 700 }}>
          USDG GDP
        </h2>
        <p style={{ color: C_TEXT_DIM, margin: '4px 0 0', fontSize: 13 }}>
          Economic value generated by USDG across venues — borrow interest, NIM on idle supply, and estimated trading fees.
        </p>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, background: '#1a1208', borderRadius: 8,
        padding: 4, width: 'fit-content', marginBottom: 20, border: `1px solid ${GDP_BORDER}` }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{ padding: '5px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: 'none', fontWeight: view === v.id ? 600 : 400,
              background: view === v.id ? '#3d2a06' : 'transparent',
              color:      view === v.id ? C_TOTAL_LINE : C_TEXT_DIM }}>
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: C_TEXT_DIM, padding: 40, textAlign: 'center' }}>Loading GDP data…</div>
      ) : (
        <>
          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <GdpTile label={`Total GDP (${periodLabel})`} value={windowTotal.total} color={C_TOTAL_LINE} />
            <GdpTile label="AAVE (borrow + NIM)" value={windowTotal.aaveBorrow + windowTotal.aaveNim}
              sub={`borrow ${fmtUSD(windowTotal.aaveBorrow)} · NIM ${fmtUSD(windowTotal.aaveNim)}`}
              color={C_AAVE_BORROW} />
            <GdpTile label="OKX (USDG/USDT, 2bps)" value={windowTotal.okxTrading} color={C_OKX} />
            <GdpTile label="Bullish (stable + risk)"
              value={windowTotal.bullishStable + windowTotal.bullishRisk}
              sub={`stable ${fmtUSD(windowTotal.bullishStable)} · risk ${fmtUSD(windowTotal.bullishRisk)}`}
              color={C_BULLISH_STB} />
          </div>

          {/* Chart */}
          <div style={{ height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
                <XAxis dataKey="displayDate" stroke={C_MUTED} tick={{ fill: C_TEXT_DIM, fontSize: 11 }}
                  tickMargin={8} interval="preserveStartEnd" />
                <YAxis stroke={C_MUTED} tick={{ fill: C_TEXT_DIM, fontSize: 11 }}
                  tickFormatter={fmtShort} width={65} />
                <Tooltip content={<GdpTooltip />} cursor={{ fill: 'rgba(251,191,36,0.05)' }} />
                <Legend iconType="square" wrapperStyle={{ color: C_TEXT_DIM, fontSize: 12 }}
                  formatter={v => ({
                    aaveBorrow:    'AAVE borrow',
                    aaveNim:       'AAVE NIM',
                    okxTrading:    'OKX (2bps)',
                    bullishStable: 'Bullish stable (2bps)',
                    bullishRisk:   'Bullish risk (7bps)',
                  }[v] || v)} />

                <Bar dataKey="aaveBorrow"    stackId="gdp" fill={C_AAVE_BORROW} isAnimationActive={false} />
                <Bar dataKey="aaveNim"       stackId="gdp" fill={C_AAVE_NIM}    isAnimationActive={false} />
                <Bar dataKey="okxTrading"    stackId="gdp" fill={C_OKX}         isAnimationActive={false} />
                <Bar dataKey="bullishStable" stackId="gdp" fill={C_BULLISH_STB} isAnimationActive={false} />
                <Bar dataKey="bullishRisk"   stackId="gdp" fill={C_BULLISH_RSK}
                  radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {view === '30d' && (
                    <LabelList dataKey="total" position="top"
                      formatter={v => v > 0 ? fmtShort(v) : ''}
                      style={{ fill: C_TEXT_DIM, fontSize: 9 }} />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Methodology footnote */}
          <div style={{ marginTop: 12, padding: '10px 14px', background: GDP_CARD_BG,
            border: `1px solid ${GDP_BORDER}`, borderRadius: 8, fontSize: 12, color: C_TEXT_DIM,
            lineHeight: 1.6 }}>
            <strong style={{ color: C_TEXT }}>Methodology: </strong>
            AAVE = daily borrow interest + NIM on idle USDG (supply − borrow) at {(NIM_APY * 100).toFixed(1)}% APY.
            OKX = USDG/USDT volume × 2bps. Bullish stable (USDGUSDC) × 2bps, risk (BTCUSDG) × 7bps.
            Prototype — additional venues, custody rewards, and market-making GDP TBD.
          </div>
        </>
      )}
    </div>
  );
}
