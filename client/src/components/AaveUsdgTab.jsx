import { useState } from 'react';
import {
  ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, ReferenceArea
} from 'recharts';
import { useAaveUsdg, useAaveUsdgHistory } from '../hooks/useVolumeData';

const AAVE_PURPLE = '#b6509e';
const APY_GREEN   = '#10b981';
const SPOKE_COLORS = ['#00d4aa', '#f5a623', '#7c3aed', '#3b82f6'];

function formatUSD(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatUSDShort(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="comparison-card">
      <div className="comparison-label">{label}</div>
      <div className="comparison-values">
        <div className="comparison-current">
          {sub && <span className="value-label">{sub}</span>}
          <span className="value-number" style={color ? { color } : {}}>{value}</span>
        </div>
      </div>
    </div>
  );
}

const INTEREST_COLOR = '#f59e0b';
const MERKL_COLOR    = '#b6509e';
const NIM_COLOR      = '#8b5cf6'; // NIM-funded portion of incentives
const OOP_COLOR      = '#ec4899'; // out-of-pocket incentive spend

// Demand-vs-Subsidy palette
const DEMAND_COLOR   = '#22d3ee'; // borrower interest (organic demand) — the hero line
const NIM_SUB_COLOR  = '#8b5cf6'; // sustainable subsidy (NIM share)
const OOP_SUB_COLOR  = '#fb923c'; // unsustainable subsidy (out-of-pocket)
const DEFICIT_COLOR  = '#ef4444'; // subsidy exceeds demand (bootstrapping)
const SURPLUS_COLOR  = '#22c55e'; // demand exceeds subsidy (self-sustaining)

// Revenue-share rate earned on idle USDG sitting on Aave (supply TVL − borrow TVL).
// This "NIM share" funds part of the Merkl incentives; anything above it is out-of-pocket.
const NIM_APY = 0.031; // 3.1% APY

const tooltipBase = {
  contentStyle: { backgroundColor: '#1a1f2e', border: '1px solid #2f3542', borderRadius: 8, color: '#e7e9ea' },
  labelStyle: { color: '#71767b' }
};

// CSV export: column header + accessor for each field of the daily dataset.
const CSV_COLUMNS = [
  ['date',                        r => r.date],
  ['total_borrowed_usd',          r => r.totalDebt],
  ['borrow_apy_pct',              r => r.borrowApy],
  ['daily_interest_usd',          r => r.dailyInterest],
  ['total_supply_usd',            r => r.totalSupply],
  ['supply_apy_pct',              r => r.supplyApy],
  ['idle_usdg',                   r => r.idle],
  ['nim_revenue_usd',             r => r.nimRevenue],
  ['merkl_incentives_usd',        r => r.merklRewards],
  ['nim_funded_incentive_usd',    r => r.nimFunded],
  ['out_of_pocket_incentive_usd', r => r.outOfPocket],
];

function toCsv(rows) {
  const header = CSV_COLUMNS.map(c => c[0]).join(',');
  const lines = rows.map(r =>
    CSV_COLUMNS.map(([, accessor]) => {
      const v = accessor(r);
      return v == null ? '' : v;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

function downloadCsv(rows, lookback) {
  const slice = lookback == null ? rows : rows.slice(-lookback);
  const blob = new Blob([toCsv(slice)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aave-usdg-daily-${lookback == null ? 'all' : lookback + 'd'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SUPPLY_COLOR = '#3b82f6';

function SupplyChart({ chartData }) {
  const [lookback, setLookback] = useState(30);

  const filtered = lookback === null ? chartData : chartData.slice(-lookback);
  const hasSupply = filtered.some(d => d.totalSupply != null);

  return (
    <section className="chart-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>Supply TVL & Organic Supply Rate</h3>
          <p style={{ color: '#71767b', fontSize: 12, margin: '2px 0 0' }}>
            Total USDG supplied (left) and organic supply APY = borrowAPY × utilization (right)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#1a1f2e', borderRadius: 6, padding: 3 }}>
          {LOOKBACKS.map(({ label, days }) => (
            <button key={label} onClick={() => setLookback(days)}
              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: 'none',
                background: lookback === days ? '#2f3542' : 'transparent',
                color: lookback === days ? '#e7e9ea' : '#71767b' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!hasSupply ? (
        <div className="no-data" style={{ padding: 20 }}>Supply data is being populated — check back shortly.</div>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filtered} margin={{ top: 10, right: 60, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="supplyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={SUPPLY_COLOR} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={SUPPLY_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
              <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
              <YAxis yAxisId="supply" orientation="left"
                stroke={SUPPLY_COLOR} tick={{ fill: SUPPLY_COLOR, fontSize: 11 }}
                tickFormatter={formatUSDShort} width={75}
                label={{ value: 'Supplied', angle: -90, position: 'insideLeft', fill: SUPPLY_COLOR, fontSize: 11, dx: -8 }} />
              <YAxis yAxisId="apy" orientation="right"
                stroke={APY_GREEN} tick={{ fill: APY_GREEN, fontSize: 11 }}
                tickFormatter={v => v.toFixed(2) + '%'} width={60}
                label={{ value: 'Supply APY', angle: 90, position: 'insideRight', fill: APY_GREEN, fontSize: 11, dx: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #2f3542', borderRadius: 8, color: '#e7e9ea' }}
                labelStyle={{ color: '#71767b' }}
                formatter={(v, name) => {
                  if (name === 'totalSupply') return [v != null ? formatUSD(v) : '—', 'Supply TVL'];
                  if (name === 'supplyApy')  return [v != null ? v.toFixed(4) + '%' : '—', 'Supply APY'];
                  return [v, name];
                }}
              />
              <Legend wrapperStyle={{ color: '#e7e9ea' }}
                formatter={v => v === 'totalSupply' ? 'Supply TVL' : 'Supply APY'} />
              <Area yAxisId="supply" type="monotone" dataKey="totalSupply"
                stroke={SUPPLY_COLOR} strokeWidth={2} fill="url(#supplyGrad)"
                dot={false} activeDot={{ r: 4, fill: SUPPLY_COLOR, strokeWidth: 0 }} name="totalSupply" />
              <Line yAxisId="apy" type="monotone" dataKey="supplyApy"
                stroke={APY_GREEN} strokeWidth={2} dot={false}
                activeDot={{ r: 4, fill: APY_GREEN, strokeWidth: 0 }} name="supplyApy" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

const LOOKBACKS = [
  { label: '7 Days',  days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: 'All',     days: null },
];

function DownloadControl({ chartData }) {
  const RANGES = [
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: 'All',     days: null },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color: '#71767b', fontSize: 13 }}>Download daily data:</span>
      <div style={{ display: 'flex', gap: 4, background: '#1a1f2e', borderRadius: 6, padding: 3 }}>
        {RANGES.map(({ label, days }) => (
          <button key={label} onClick={() => downloadCsv(chartData, days)}
            disabled={!chartData.length}
            style={{ padding: '5px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              cursor: chartData.length ? 'pointer' : 'not-allowed', border: 'none',
              background: 'transparent', color: '#00d4aa' }}>
            ⬇ {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TipRow({ color, label, value, dim }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, padding: '1px 0' }}>
      <span style={{ color: dim ? '#8b95a1' : color }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 6 }} />
        {label}
      </span>
      <span style={{ color: '#e7e9ea' }}>{value != null ? formatUSD(value) : '—'}</span>
    </div>
  );
}

function LegendChip({ color, line, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-block', width: line ? 14 : 10, height: line ? 3 : 10,
        borderRadius: line ? 2 : 2, background: color }} />
      {label}
    </span>
  );
}

function DsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  if (r.demand == null) return null;
  const tracked = r.totalSubsidy != null; // out-of-pocket known this day
  const net = tracked ? r.demand - r.totalSubsidy : null;
  const coverage = tracked && r.totalSubsidy ? (r.demand / r.totalSubsidy) * 100 : null;
  const positive = net != null && net >= 0;

  return (
    <div style={{ ...tooltipBase.contentStyle, padding: '10px 14px', minWidth: 258 }}>
      <div style={{ color: '#71767b', marginBottom: 8, fontSize: 12 }}>{label}</div>

      <TipRow color={DEMAND_COLOR} label="Demand — borrower interest" value={r.demand} />

      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16,
          fontWeight: 600, fontSize: 12, color: '#e7e9ea',
          borderBottom: '1px solid #2f3542', paddingBottom: 4, marginBottom: 4 }}>
          <span>Subsidy {tracked ? '(total)' : ''}</span>
          <span>{tracked ? formatUSD(r.totalSubsidy) : '—'}</span>
        </div>
        <div style={{ paddingLeft: 10 }}>
          <TipRow color={NIM_SUB_COLOR} label="NIM share" value={r.nimRevenue} />
          <TipRow color={OOP_SUB_COLOR}
            label={tracked ? 'Out-of-pocket' : 'Out-of-pocket (not tracked)'}
            value={tracked ? r.outOfPocket : null} dim={!tracked} />
        </div>
      </div>

      {tracked ? (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #2f3542' }}>
          {r.netOoP != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11, color: '#8b95a1', marginBottom: 4 }}>
              <span>Net excl. NIM (demand − out-of-pocket)</span>
              <span>{r.netOoP >= 0 ? '+' : '−'}{formatUSD(Math.abs(r.netOoP))}/day</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, fontWeight: 600,
            color: positive ? SURPLUS_COLOR : DEFICIT_COLOR }}>
            <span>{positive ? 'Self-sustaining' : 'Net subsidy'}{coverage != null ? ` · ${coverage.toFixed(0)}% covered` : ''}</span>
            <span>{positive ? '+' : '−'}{formatUSD(Math.abs(net))}/day</span>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #2f3542', fontSize: 11, color: '#71767b' }}>
          Out-of-pocket incentives not tracked before Merkl coverage began — total subsidy unknown.
        </div>
      )}
    </div>
  );
}

// Net daily cash flow chart. mode 'two' also plots demand − out-of-pocket (the NIM-cushion
// reading); mode 'single' shows only the total net line. Goal in both: the line crosses $0.
function NetCashFlowChart({ chartData, mode, optionTag }) {
  const twoLine = mode === 'two';
  const [lookback, setLookback] = useState(30);
  const filtered = lookback === null ? chartData : chartData.slice(-lookback);

  const netTick = v => (v < 0 ? '−' : '') + '$' +
    (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'K' : Math.abs(v).toFixed(0));

  // Out-of-pocket only tracked from a certain day (Merkl API lookback) — shade the unknown span.
  const trackedIdx = filtered.findIndex(d => d.netTotal != null);
  const trackingStart = trackedIdx >= 0 ? filtered[trackedIdx] : null;
  const untrackedFrom = trackedIdx > 0 ? filtered[0] : null;

  const latest = [...filtered].reverse().find(d => d.netTotal != null);
  const net = latest ? latest.netTotal : null;
  const coverage = latest && latest.totalSubsidy ? (latest.demand / latest.totalSubsidy) * 100 : null;
  const positive = net != null && net >= 0;
  const statusColor = positive ? SURPLUS_COLOR : DEFICIT_COLOR;

  // Mark the start of the current self-sustaining streak, if we're above water now.
  let crossover = null;
  if (positive) {
    for (let i = filtered.length - 1; i >= 0 && filtered[i].netTotal >= 0; i--) crossover = filtered[i];
  }

  return (
    <section className="chart-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>
            {optionTag && <span style={{ color: '#00d4aa', marginRight: 8 }}>{optionTag}</span>}
            Net cash flow — {twoLine ? 'two lines (keeps NIM vs out-of-pocket)' : 'single line'}
          </h3>
          <p style={{ color: '#71767b', fontSize: 12, margin: '2px 0 0', maxWidth: 680 }}>
            Borrower interest minus subsidy, per day. Below $0 we're paying to bootstrap; the market is
            self-sustaining once the line crosses above $0.
            {twoLine
              ? ' Solid = demand − total subsidy (full goal); dashed = demand − out-of-pocket only (the gap between them is the NIM share).'
              : ' Line = demand − total subsidy (NIM share + out-of-pocket).'}
            {trackingStart && ` Out-of-pocket tracked from ${trackingStart.displayDate}.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#1a1f2e', borderRadius: 6, padding: 3 }}>
          {LOOKBACKS.map(({ label, days }) => (
            <button key={label} onClick={() => setLookback(days)}
              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: 'none',
                background: lookback === days ? '#2f3542' : 'transparent',
                color: lookback === days ? '#e7e9ea' : '#71767b' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Headline — net position in dollars + how far to break-even */}
      {net != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', margin: '12px 0 6px' }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: statusColor }}>
            {net < 0 ? '−' : '+'}{formatUSD(Math.abs(net))}/day
          </span>
          <span style={{ color: '#e7e9ea', fontSize: 13 }}>
            net cash flow{coverage != null ? ` · demand covers ${coverage.toFixed(0)}% of subsidy` : ''}
          </span>
          <span style={{ color: '#71767b', fontSize: 12 }}>· goal: reach $0 {positive ? '✓ self-sustaining' : ''}</span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0', fontSize: 12, color: '#a9b1ba' }}>
        <LegendChip color="#e7e9ea" line label="Net: demand − total subsidy" />
        {twoLine && <LegendChip color={NIM_SUB_COLOR} line label="Net excl. NIM: demand − out-of-pocket" />}
        <LegendChip color={SURPLUS_COLOR} label="Above $0 (self-sustaining)" />
        <LegendChip color={DEFICIT_COLOR} label="Below $0 (net cost)" />
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filtered} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
            <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
            <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickFormatter={netTick} width={70}
              domain={[min => Math.min(0, min) * 1.1, max => Math.max(0, max) * 1.1]} />
            <Tooltip content={<DsTooltip />} />

            {untrackedFrom && trackingStart && (
              <ReferenceArea x1={untrackedFrom.displayDate} x2={trackingStart.displayDate}
                fill="#71767b" fillOpacity={0.08} stroke="none"
                label={{ value: 'out-of-pocket not tracked', fill: '#71767b', fontSize: 10, position: 'insideTop' }} />
            )}

            {/* Sign-colored fill to the $0 baseline: red below, green above */}
            <Area dataKey="netNeg" baseValue={0} stroke="none" fill={DEFICIT_COLOR} fillOpacity={0.22} isAnimationActive={false} connectNulls={false} />
            <Area dataKey="netPos" baseValue={0} stroke="none" fill={SURPLUS_COLOR} fillOpacity={0.22} isAnimationActive={false} connectNulls={false} />

            {/* The goal: break-even at $0 */}
            <ReferenceLine y={0} stroke={SURPLUS_COLOR} strokeWidth={1.5}
              label={{ value: 'break-even ($0)', fill: SURPLUS_COLOR, fontSize: 11, position: 'insideTopLeft' }} />

            {twoLine && (
              <Line dataKey="netOoP" type="monotone" stroke={NIM_SUB_COLOR} strokeWidth={1.5}
                strokeDasharray="5 3" dot={{ r: 2, fill: NIM_SUB_COLOR, strokeWidth: 0 }}
                isAnimationActive={false} connectNulls={false} activeDot={{ r: 4 }} />
            )}
            <Line dataKey="netTotal" type="monotone" stroke="#e7e9ea" strokeWidth={2.5}
              dot={{ r: 2.5, fill: '#e7e9ea', strokeWidth: 0 }} isAnimationActive={false}
              connectNulls={false} activeDot={{ r: 4, fill: '#e7e9ea', strokeWidth: 0 }} />

            {crossover && (
              <ReferenceLine x={crossover.displayDate} stroke={SURPLUS_COLOR} strokeDasharray="4 3"
                label={{ value: 'break-even', fill: SURPLUS_COLOR, fontSize: 11, position: 'insideTopRight' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function CombinedTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const debt = payload.find(p => p.dataKey === 'totalDebt');
  const apy  = payload.find(p => p.dataKey === 'borrowApy');
  return (
    <div style={{ ...tooltipBase.contentStyle, padding: '10px 14px' }}>
      <div style={{ color: '#71767b', marginBottom: 6, fontSize: 12 }}>{label}</div>
      {debt && <div style={{ color: AAVE_PURPLE }}>{formatUSD(debt.value)} borrowed</div>}
      {apy  && <div style={{ color: APY_GREEN  }}>{apy.value.toFixed(4)}% APY</div>}
    </div>
  );
}

export default function AaveUsdgTab() {
  const { data: live, loading: liveLoading, error: liveError, lastUpdated } = useAaveUsdg();
  const { data: hist, loading: histLoading } = useAaveUsdgHistory();

  const history = hist?.history || [];
  // Merkl daily rewards are captured sparsely (API lookback limits). Once the campaign
  // is tracked, forward-fill a missing daily snapshot so a data hole doesn't read as
  // "subsidy paused" (which would draw a spurious surplus). Rows before the first tracked
  // day stay null → treated as no out-of-pocket campaign yet.
  let _lastMerkl = null;
  const chartData = history.map(row => {
    const totalDebt   = row.total_debt;
    const totalSupply = row.total_supply ?? null;
    const rawMerkl = row.merkl_daily_rewards ?? null;
    if (rawMerkl != null) _lastMerkl = rawMerkl;
    const merklRewards = rawMerkl != null ? rawMerkl : _lastMerkl; // null until first tracked day

    // Idle USDG = supply that isn't currently borrowed. This is what earns the NIM share.
    const idle = totalSupply != null && totalDebt != null
      ? Math.max(totalSupply - totalDebt, 0)
      : null;
    // Daily revenue thrown off by the idle USDG at the NIM rate.
    // This is computable for every day we have supply + debt — no Merkl data required,
    // so it extends as far back as the idle-USDG history goes.
    const nimRevenue = idle != null ? idle * NIM_APY / 365 : null;

    let nimFunded = null;   // portion of the day's incentives covered by NIM revenue
    let outOfPocket = null; // incremental spend on top of NIM revenue
    if (merklRewards != null && nimRevenue != null) {
      nimFunded   = Math.min(nimRevenue, merklRewards);
      outOfPocket = Math.max(merklRewards - nimRevenue, 0);
    }

    // ── Demand vs Subsidy framing ──────────────────────────────────────────
    // Demand  = what borrowers voluntarily pay (organic).
    // Subsidy = NIM share (sustainable) + out-of-pocket incentives (unsustainable).
    // The story is the signed gap between them: deficit while we're bootstrapping,
    // surplus once the market pays its own way.
    //
    // Out-of-pocket is UNKNOWN before Merkl tracking begins (the API has no lookback) —
    // NOT zero. So total subsidy / deficit / coverage are only defined once it's tracked;
    // earlier days show demand + NIM as context but make no self-sustaining claim.
    const demand       = row.daily_interest;
    const oopTracked   = merklRewards != null;
    const oopArea      = oopTracked ? outOfPocket : null;
    const totalSubsidy = (nimRevenue != null && oopTracked) ? nimRevenue + outOfPocket : null;

    // Net daily cash flow: what the market throws off minus what we spend. Goal is to cross 0.
    //   netTotal = demand − (NIM + out-of-pocket)   → full self-sustaining when ≥ 0
    //   netOoP   = demand − out-of-pocket            → covers the *unsustainable* spend when ≥ 0
    // The vertical gap between the two lines is the sustainable NIM cushion.
    let netTotal = null, netOoP = null, netNeg = null, netPos = null;
    if (demand != null && totalSubsidy != null) {
      netTotal = demand - totalSubsidy;
      netNeg   = Math.min(netTotal, 0); // red fill (below break-even)
      netPos   = Math.max(netTotal, 0); // green fill (above break-even)
    }
    if (demand != null && oopTracked) {
      netOoP = demand - outOfPocket;
    }

    return {
      date: row.date,
      displayDate: formatDate(row.date),
      totalDebt,
      borrowApy: parseFloat(row.borrow_apy),
      dailyInterest: row.daily_interest,
      merklRewards,
      totalSupply,
      supplyApy: row.supply_apy != null ? parseFloat(row.supply_apy) : null,
      idle,
      nimRevenue,
      nimFunded,
      outOfPocket,
      demand,
      oopArea,
      totalSubsidy,
      netTotal,
      netOoP,
      netNeg,
      netPos,
    };
  });

  if (liveLoading && histLoading) return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <div className="loading">Loading Aave v4 data...</div>
    </div>
  );

  if (liveError) return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <div className="error">Error: {liveError}</div>
    </div>
  );

  const { totalVariableDebt, variableBorrowApy, dailyInterestCost, spokeBreakdown } = live || {};

  // Most recent day with a computable incentive split, for the summary cards.
  const latestIncentive = [...chartData].reverse().find(d => d.nimFunded != null) || null;

  return (
    <div className="weekly-trends">
      <h2>USDG — Aave v4</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginTop: -8, marginBottom: 24 }}>
        <p style={{ color: '#71767b', margin: 0 }}>
          USDG borrowing across all Aave v4 spokes on Ethereum mainnet · live data refreshes every 60s
        </p>
        <DownloadControl chartData={chartData} />
      </div>

      {/* Live metrics */}
      {live && (
        <section className="wow-section">
          <div className="comparison-grid">
            <StatCard label="Total USDG Borrowed" value={formatUSD(totalVariableDebt)} sub="across all spokes" color={AAVE_PURPLE} />
            <StatCard label="Variable Borrow Rate" value={`${variableBorrowApy?.toFixed(2)}%`} sub="APY" color={APY_GREEN} />
            <StatCard label="Daily Interest Cost" value={formatUSD(dailyInterestCost)} sub="total debt × annual rate ÷ 365" />
          </div>
        </section>
      )}

      {/* Spoke breakdown */}
      {spokeBreakdown && (
        <section className="wow-section">
          <h3>Debt by Spoke (current)</h3>
          <div className="comparison-grid">
            {spokeBreakdown.map((spoke, i) => (
              <StatCard key={spoke.name} label={spoke.name + ' Spoke'} value={formatUSD(spoke.debt)}
                sub={totalVariableDebt > 0 ? ((spoke.debt / totalVariableDebt) * 100).toFixed(1) + '% of total' : ''}
                color={SPOKE_COLORS[i % SPOKE_COLORS.length]} />
            ))}
          </div>
        </section>
      )}

      {/* Incentive funding breakdown */}
      {latestIncentive && (
        <section className="wow-section">
          <h3>Incentive Funding (latest: {latestIncentive.displayDate})</h3>
          <div className="comparison-grid">
            <StatCard label="Total Merkl Incentives" value={formatUSD(latestIncentive.merklRewards)} sub="distributed per day" color={MERKL_COLOR} />
            <StatCard label="NIM-funded Portion" value={formatUSD(latestIncentive.nimFunded)}
              sub={`idle USDG × ${(NIM_APY * 100).toFixed(1)}% ÷ 365`} color={NIM_COLOR} />
            <StatCard label="Out-of-pocket Spend" value={formatUSD(latestIncentive.outOfPocket)}
              sub="incentive cost above NIM revenue" color={OOP_COLOR} />
            <StatCard label="Idle USDG on Aave" value={formatUSD(latestIncentive.idle)}
              sub="supply TVL − borrowed" color={SUPPLY_COLOR} />
          </div>
        </section>
      )}

      {/* Chart 1: Borrowed + APY on dual axes */}
      {chartData.length > 0 && (
        <>
          <section className="chart-section">
            <h3>Total Borrowed & Variable Borrow Rate</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 60, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={AAVE_PURPLE} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={AAVE_PURPLE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
                  <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
                  <YAxis yAxisId="debt" orientation="left"
                    stroke={AAVE_PURPLE} tick={{ fill: AAVE_PURPLE, fontSize: 11 }}
                    tickFormatter={formatUSDShort} width={75}
                    label={{ value: 'Borrowed', angle: -90, position: 'insideLeft', fill: AAVE_PURPLE, fontSize: 11, dx: -8 }} />
                  <YAxis yAxisId="apy" orientation="right"
                    stroke={APY_GREEN} tick={{ fill: APY_GREEN, fontSize: 11 }}
                    tickFormatter={v => v.toFixed(1) + '%'} width={55}
                    label={{ value: 'APY', angle: 90, position: 'insideRight', fill: APY_GREEN, fontSize: 11, dx: 8 }} />
                  <Tooltip content={<CombinedTooltip />} />
                  <Legend wrapperStyle={{ color: '#e7e9ea' }}
                    formatter={v => v === 'totalDebt' ? 'Total Borrowed' : 'Borrow APY'} />
                  <Area yAxisId="debt" type="monotone" dataKey="totalDebt"
                    stroke={AAVE_PURPLE} strokeWidth={2} fill="url(#debtGrad)"
                    dot={false} activeDot={{ r: 4, fill: AAVE_PURPLE, strokeWidth: 0 }} name="totalDebt" />
                  <Line yAxisId="apy" type="monotone" dataKey="borrowApy"
                    stroke={APY_GREEN} strokeWidth={2} dot={false}
                    activeDot={{ r: 4, fill: APY_GREEN, strokeWidth: 0 }} name="borrowApy" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Chart 2: Net cash flow — two candidate designs to compare, then keep one */}
          <div style={{ margin: '8px 0 -8px', padding: '8px 12px', border: '1px dashed #2f3542', borderRadius: 8,
            color: '#71767b', fontSize: 12, background: 'rgba(0,212,170,0.04)' }}>
            🔍 Two candidate designs below — same data, different framing. Tell me which to keep and I'll remove the other.
          </div>
          <NetCashFlowChart chartData={chartData} mode="two"    optionTag="Option A" />
          <NetCashFlowChart chartData={chartData} mode="single" optionTag="Option B" />

          {/* Chart 3: Supply amount + supply rate */}
          <SupplyChart chartData={chartData} />
        </>
      )}

      {histLoading && !chartData.length && <div className="loading">Loading historical data...</div>}

      <section className="wow-section" style={{ background: 'transparent', border: '1px solid #2f3542', borderRadius: 8, padding: '16px 20px', marginTop: 8 }}>
        <p style={{ color: '#71767b', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: '#e7e9ea' }}>Methodology: </strong>
          Total debt = <code>getReserveTotalDebt(reserveId)</code> summed across Main, Gold, Forex, and USDG-Pendle spokes.
          Rate = <code>getAssetDrawnRate(8)</code> from{' '}
          <a href="https://etherscan.io/address/0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9"
            target="_blank" rel="noreferrer" style={{ color: AAVE_PURPLE }}>CORE_HUB</a>.
          Daily interest = totalDebt × annualRate ÷ 365. Historical data queries on-chain archive at estimated block numbers.
        </p>
      </section>

      {lastUpdated && (
        <div className="refresh-info">
          Live: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Historical from DB
        </div>
      )}
    </div>
  );
}
