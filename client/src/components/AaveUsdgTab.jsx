import { useState } from 'react';
import {
  ComposedChart, Area, Line, Bar,
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

function DivergingTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const tracked = r.oopNeg != null;
  const positiveTotal = (r.demand ?? 0) + (r.nimRevenue ?? 0);
  const net = tracked ? positiveTotal - r.outOfPocket : null;
  const coverage = tracked && r.outOfPocket ? (positiveTotal / r.outOfPocket) * 100 : null;
  const positive = net != null && net >= 0;

  return (
    <div style={{ ...tooltipBase.contentStyle, padding: '10px 14px', minWidth: 240 }}>
      <div style={{ color: '#71767b', marginBottom: 8, fontSize: 12 }}>{label}</div>

      <TipRow color={DEMAND_COLOR} label="Borrow interest" value={r.demand} />
      <TipRow color={NIM_SUB_COLOR} label={`NIM share (idle × ${(NIM_APY * 100).toFixed(1)}%)`} value={r.nimRevenue} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600,
        color: '#e7e9ea', paddingTop: 4, marginTop: 4, borderTop: '1px solid #2f3542' }}>
        <span>Total above $0</span>
        <span>{formatUSD(positiveTotal)}/day</span>
      </div>

      {tracked ? (
        <>
          <div style={{ marginTop: 8 }}>
            <TipRow color={DEFICIT_COLOR} label="Out-of-pocket incentives" value={r.outOfPocket} />
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #2f3542',
            display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600,
            color: positive ? SURPLUS_COLOR : DEFICIT_COLOR }}>
            <span>{positive ? 'Net positive' : 'Net cost'}{coverage != null ? ` · ${coverage.toFixed(0)}% covered` : ''}</span>
            <span>{positive ? '+' : '−'}{formatUSD(Math.abs(net))}/day</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: '#71767b', fontStyle: 'italic', marginTop: 6 }}>
          Out-of-pocket not tracked before Merkl coverage began.
        </div>
      )}
    </div>
  );
}

function DivergingBarChart({ chartData }) {
  const [lookback, setLookback] = useState(30);
  const filtered = lookback === null ? chartData : chartData.slice(-lookback);
  const dollarTick = v => (v < 0 ? '−' : '') + '$' +
    (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'K' : Math.abs(v).toFixed(0));

  const trackedIdx = filtered.findIndex(d => d.oopNeg != null);
  const trackingStart = trackedIdx >= 0 ? filtered[trackedIdx] : null;
  const untrackedFrom = trackedIdx > 0 ? filtered[0] : null;

  const latest = [...filtered].reverse().find(d => d.oopNeg != null);
  const positiveTotal = latest ? (latest.demand ?? 0) + (latest.nimRevenue ?? 0) : null;
  const net = latest ? positiveTotal - latest.outOfPocket : null;
  const coverage = latest && latest.outOfPocket ? (positiveTotal / latest.outOfPocket) * 100 : null;
  const positive = net != null && net >= 0;
  const statusColor = positive ? SURPLUS_COLOR : DEFICIT_COLOR;

  return (
    <section className="chart-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>Daily incentive position</h3>
          <p style={{ color: '#71767b', fontSize: 12, margin: '2px 0 0', maxWidth: 640 }}>
            Above $0 → flows to suppliers: borrow interest + NIM share from idle USDG.
            Below $0 → out-of-pocket incentive spend. Break-even when the positive stack clears $0.
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

      {net != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', margin: '12px 0 8px' }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: statusColor }}>
            {net < 0 ? '−' : '+'}{formatUSD(Math.abs(net))}/day
          </span>
          <span style={{ color: '#c4c8cc', fontSize: 13 }}>
            net · {formatUSD(positiveTotal)}/day positive vs {formatUSD(latest.outOfPocket)}/day out-of-pocket
          </span>
          {coverage != null && (
            <span style={{ color: '#71767b', fontSize: 12 }}>· {coverage.toFixed(0)}% covered · goal: 100%</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '4px 0 10px', fontSize: 12, color: '#a9b1ba' }}>
        <LegendChip color={DEMAND_COLOR} label="Borrow interest" />
        <LegendChip color={NIM_SUB_COLOR} label={`NIM share (idle USDG × ${(NIM_APY * 100).toFixed(1)}%)`} />
        <LegendChip color={DEFICIT_COLOR} label="Out-of-pocket incentives" />
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filtered} margin={{ top: 10, right: 30, left: 20, bottom: 5 }} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
            <XAxis dataKey="displayDate" stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" />
            <YAxis stroke="#71767b" tick={{ fill: '#71767b', fontSize: 11 }} tickFormatter={dollarTick} width={70} />
            <Tooltip content={<DivergingTooltip />} />

            {untrackedFrom && trackingStart && (
              <ReferenceArea x1={untrackedFrom.displayDate} x2={trackingStart.displayDate}
                fill="#71767b" fillOpacity={0.08} stroke="none"
                label={{ value: 'out-of-pocket not tracked', fill: '#71767b', fontSize: 10, position: 'insideTopLeft' }} />
            )}

            {/* Break-even line — the finish */}
            <ReferenceLine y={0} stroke="#e7e9ea" strokeWidth={1.5}
              label={{ value: '← break-even', fill: '#e7e9ea', fontSize: 11, position: 'insideBottomLeft' }} />

            {/* Positive stack: borrow interest (base) + NIM share (top) */}
            <Bar dataKey="demand"     stackId="pos" fill={DEMAND_COLOR}   fillOpacity={0.85} isAnimationActive={false} />
            <Bar dataKey="nimRevenue" stackId="pos" fill={NIM_SUB_COLOR}  fillOpacity={0.65} radius={[3, 3, 0, 0]} isAnimationActive={false} />

            {/* Negative bar: out-of-pocket spend */}
            <Bar dataKey="oopNeg" fill={DEFICIT_COLOR} fillOpacity={0.75} radius={[0, 0, 3, 3]} isAnimationActive={false} />
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

    // Diverging bar chart framing:
    //   above $0: borrow interest (demand) + NIM share — both flow to suppliers
    //   below $0: out-of-pocket incentives — actual cash cost
    //   break-even: positive stack = negative bar depth
    // Out-of-pocket is UNKNOWN before Merkl tracking begins — not zero.
    const demand     = row.daily_interest;
    const oopTracked = merklRewards != null;
    const oopArea    = oopTracked ? outOfPocket : null;
    const totalSubsidy = (nimRevenue != null && oopTracked) ? nimRevenue + outOfPocket : null;
    const oopNeg = oopTracked ? -outOfPocket : null;

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
      oopNeg,
      demand,
      oopArea,
      totalSubsidy,
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

          {/* Chart 2: Daily incentive position — diverging bar */}
          <DivergingBarChart chartData={chartData} />

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
