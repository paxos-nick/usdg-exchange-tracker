import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList
} from 'recharts';
import { useAaveUsdgHistory, useVolumeData, usePairVolumeData, useUsdgSupply, useHoodVolumeHistory } from '../hooks/useVolumeData';

// ── Paxos brand palette ───────────────────────────────────────────────────────────
const GDP_BG      = '#f6f8fb';           // Paxos light background
const GDP_BORDER  = '#e2e2e4';
const GDP_CARD_BG = '#ffffff';           // white card backgrounds
const GDP_BTN_ACT = '#19282f';           // Paxos dark navy

const C_BORROW   = '#c7e36c'; // Paxos lime green — borrower interest
const C_TRADING  = '#0094d8'; // Paxos blue — trading fees
const C_REWARDS  = '#314012'; // Paxos dark green — GDN rewards
const C_AAVE     = '#c7e36c'; // lime green
const C_OKX      = '#0094d8'; // blue
const C_BULLISH  = '#43494e'; // Paxos dark gray
const C_TOTAL    = '#19282f'; // Paxos dark navy
const C_TEXT     = '#19282f'; // dark text on white
const C_DIM      = '#828385'; // Paxos mid gray
const C_GRID     = '#e8ecf0';
const C_CURSOR   = 'rgba(25,40,47,0.04)';

const NIM_APY    = 0.031;
const STABLE_FEE = 0.0002;
const RISK_FEE   = 0.0007;
const HOOD_FEE   = 0.0001; // ETH/USDG v3 pool on-chain fee: 1 bps (0.01%), confirmed via fee() call

const VENUES = ['aave', 'okx', 'bullish', 'kraken', 'gate', 'kucoin', 'uniswap_hood'];

// Chain-level GDN reward breakdown
const CHAIN_KEYS   = ['ethereum', 'solana', 'xlayer', 'robinhood', 'ink', 'arbitrum'];
const CHAIN_LABELS = { ethereum: 'Ethereum', solana: 'Solana', xlayer: 'xLayer',
  robinhood: 'Robinhood', ink: 'Ink', arbitrum: 'Arbitrum' };
const CHAIN_COLORS = { ethereum: '#0094d8', solana: '#9945FF', xlayer: '#43494e',
  robinhood: '#c7e36c', ink: '#19282f', arbitrum: '#28a0f0' };
const VENUE_LABELS = { aave: 'AAVE', okx: 'OKX', bullish: 'Bullish',
  kraken: 'Kraken', gate: 'Gate', kucoin: 'KuCoin', uniswap_hood: 'Hood (Uniswap)' };
const VENUE_COLORS = { aave: C_AAVE, okx: C_OKX, bullish: C_BULLISH,
  kraken: '#5741d9', gate: '#0ba5ec', kucoin: '#29a784', uniswap_hood: '#ff007a' };

// ── Data computation ──────────────────────────────────────────────────────────────

// Build daily GDN rewards broken down by chain from supply history
function buildChainGdnDaily(supplyHistory) {
  const byDate = {};
  for (const row of (supplyHistory || [])) {
    if (!row.circulating || !row.chain) continue;
    if (!byDate[row.date]) byDate[row.date] = { date: row.date };
    byDate[row.date][row.chain] = (row.circulating || 0) * NIM_APY / 365;
  }
  return Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ ...r, total: CHAIN_KEYS.reduce((s, k) => s + (r[k] || 0), 0) }));
}

function aggregateChainBy(daily, unit) {
  const buckets = {};
  for (const row of daily) {
    const d = parseDate(row.date);
    let key, label, sort;
    if (unit === 'month') {
      key = row.date.slice(0, 7);
      label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      sort  = key;
    } else {
      const y = d.getFullYear(), q = Math.ceil((d.getMonth() + 1) / 3);
      key = `${y}-Q${q}`; label = `Q${q} '${String(y).slice(2)}`; sort = `${y}-0${q}`;
    }
    if (!buckets[key]) {
      buckets[key] = { period: key, label, sort, total: 0 };
      CHAIN_KEYS.forEach(k => { buckets[key][k] = 0; });
    }
    for (const k of [...CHAIN_KEYS, 'total']) buckets[key][k] += row[k] || 0;
  }
  return Object.values(buckets).sort((a, b) => a.sort.localeCompare(b.sort));
}

// Build a date→totalCirculating lookup from supply history snapshots
function buildSupplyByDate(supplyHistory) {
  const byDate = {};
  for (const row of (supplyHistory || [])) {
    if (!byDate[row.date]) byDate[row.date] = 0;
    if (row.circulating != null) byDate[row.date] += row.circulating;
  }
  return byDate;
}

function computeDaily(aaveHist, okxData, bullishPairs, bullishTotal, supplyByDate,
  krakenData, gateData, kucoinPairs, kucoinTotal, hoodOhlcv) {
  const byDate = {};
  const add = (date, patch) => {
    if (!byDate[date]) byDate[date] = { date, aaveBorrow: 0, aaveNim: 0, okxTrading: 0,
      bullishStable: 0, bullishRisk: 0, krakenTrading: 0, gateTrading: 0,
      kucoinStable: 0, kucoinRisk: 0, uniswapHoodTrading: 0 };
    Object.assign(byDate[date], patch);
  };

  for (const row of (aaveHist?.history || [])) {
    const idle = Math.max((row.total_supply || 0) - (row.total_debt || 0), 0);
    add(row.date, { aaveBorrow: row.daily_interest || 0, aaveNim: idle * NIM_APY / 365 });
  }
  for (const row of (okxData?.dailyVolume || []))
    add(row.date, { okxTrading: (row.volume || 0) * STABLE_FEE });

  // Bullish: stable/risk split with total fallback
  const bpv = bullishPairs?.volumeByPair || {};
  if ((bpv['USDGUSDC']?.length || 0) > 0 || (bpv['BTCUSDG']?.length || 0) > 0) {
    for (const row of (bpv['USDGUSDC'] || []))
      add(row.date, { bullishStable: (row.volume || 0) * STABLE_FEE });
    for (const row of (bpv['BTCUSDG'] || []))
      add(row.date, { bullishRisk: (row.volume || 0) * RISK_FEE });
  } else {
    for (const row of (bullishTotal?.dailyVolume || []))
      add(row.date, { bullishStable: (row.volume || 0) * STABLE_FEE });
  }

  // Kraken: USDG/USD, USDG/USDC, USDG/USDT — all stable/fiat (2bps)
  for (const row of (krakenData?.dailyVolume || []))
    add(row.date, { krakenTrading: (row.volume || 0) * STABLE_FEE });

  // Gate: USDG/USDT — stable (2bps)
  for (const row of (gateData?.dailyVolume || []))
    add(row.date, { gateTrading: (row.volume || 0) * STABLE_FEE });

  // KuCoin: USDG/USDT (2bps) + BTC/USDG (7bps); total fallback at stable rate
  const kpv = kucoinPairs?.volumeByPair || {};
  if ((kpv['USDG/USDT']?.length || 0) > 0 || (kpv['BTC/USDG']?.length || 0) > 0) {
    for (const row of (kpv['USDG/USDT'] || []))
      add(row.date, { kucoinStable: (row.volume || 0) * STABLE_FEE });
    for (const row of (kpv['BTC/USDG'] || []))
      add(row.date, { kucoinRisk: (row.volume || 0) * RISK_FEE });
  } else {
    for (const row of (kucoinTotal?.dailyVolume || []))
      add(row.date, { kucoinStable: (row.volume || 0) * STABLE_FEE });
  }

  // Uniswap Hood: OHLCV-accurate daily volumes; ETH/USDG v3 pool fee = 1 bps (confirmed on-chain)
  for (const row of (hoodOhlcv?.history || []))
    if (row.volume > 0) add(row.date, { uniswapHoodTrading: (row.volume || 0) * HOOD_FEE });

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(r => {
    const borrowerInterest = r.aaveBorrow;
    const tradingFees = r.okxTrading + r.bullishStable + r.bullishRisk
      + r.krakenTrading + r.gateTrading + r.kucoinStable + r.kucoinRisk + r.uniswapHoodTrading;
    const chainSupply = supplyByDate?.[r.date];
    const gdnRewards  = chainSupply != null ? chainSupply * NIM_APY / 365 : r.aaveNim;
    return {
      ...r,
      borrowerInterest, tradingFees, gdnRewards,
      hasChainSupply: chainSupply != null,
      aave:         r.aaveBorrow + r.aaveNim,
      okx:          r.okxTrading,
      bullish:      r.bullishStable + r.bullishRisk,
      kraken:       r.krakenTrading,
      gate:         r.gateTrading,
      kucoin:       r.kucoinStable + r.kucoinRisk,
      uniswap_hood: r.uniswapHoodTrading,
      total:        borrowerInterest + tradingFees + gdnRewards,
    };
  });
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
      sort  = key;
    } else {
      const y = d.getFullYear(), q = Math.ceil((d.getMonth() + 1) / 3);
      key = `${y}-Q${q}`; label = `Q${q} '${String(y).slice(2)}`; sort = `${y}-0${q}`;
    }
    if (!buckets[key]) buckets[key] = { period: key, label, sort,
      borrowerInterest: 0, tradingFees: 0, gdnRewards: 0,
      aave: 0, okx: 0, bullish: 0, kraken: 0, gate: 0, kucoin: 0, uniswap_hood: 0, total: 0 };
    for (const k of ['borrowerInterest','tradingFees','gdnRewards',
      'aave','okx','bullish','kraken','gate','kucoin','uniswap_hood','total'])
      buckets[key][k] += row[k] || 0;
  }
  return Object.values(buckets).sort((a, b) => a.sort.localeCompare(b.sort));
}

function sliceView(daily, view) {
  if (view === '30d') return daily.slice(-30);
  const agg = aggregateBy(daily, view === '12m' ? 'month' : 'quarter');
  return view === '12m' ? agg.slice(-12) : agg.slice(-4);
}

function fmtUSD(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtShort(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${(v || 0).toFixed(0)}`;
}
function fmtLabel(row, view) {
  if (!row.date) return row.label || '';
  const d = parseDate(row.date);
  return view === '30d'
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Shared sub-components ─────────────────────────────────────────────────────────

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ background: GDP_CARD_BG, border: `1px solid ${GDP_BORDER}`, borderRadius: 10,
      padding: '14px 18px', flex: 1, minWidth: 140 }}>
      <div style={{ color: C_DIM, fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || C_TOTAL, fontSize: 22, fontWeight: 700 }}>{fmtUSD(value)}</div>
      {sub && <div style={{ color: C_DIM, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ViewToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: '#f0f2f5', borderRadius: 8,
      padding: 3, border: `1px solid ${GDP_BORDER}` }}>
      {[['30d','30 Days'],['12m','12 Mo'],['4q','4 Qtrs']].map(([id, lbl]) => (
        <button key={id} onClick={() => onChange(id)}
          style={{ padding: '4px 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
            border: 'none', fontWeight: value === id ? 600 : 400,
            background: value === id ? GDP_BTN_ACT : 'transparent',
            color: value === id ? '#ffffff' : C_DIM }}>
          {lbl}
        </button>
      ))}
    </div>
  );
}

function ChartSection({ title, children, controls }) {
  return (
    <section style={{ marginTop: 16, background: GDP_CARD_BG, border: `1px solid ${GDP_BORDER}`,
      borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, color: C_TEXT, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        {controls}
      </div>
      {children}
    </section>
  );
}

function makeTooltip(rows) {
  return function GdpTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    const items = rows.filter(row => (r[row.key] || 0) > 0);
    return (
      <div style={{ background: '#ffffff', border: `1px solid ${GDP_BORDER}`, borderRadius: 8,
        boxShadow: '0 4px 12px rgba(25,40,47,0.12)', padding: '10px 14px', color: C_TEXT, minWidth: 210 }}>
        <div style={{ color: C_DIM, fontSize: 12, marginBottom: 7 }}>{label}</div>
        {items.map(row => (
          <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between',
            gap: 14, fontSize: 12, padding: '1px 0' }}>
            <span style={{ color: row.color }}>{row.label}</span>
            <span style={{ color: C_TEXT }}>{fmtUSD(r[row.key])}</span>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${GDP_BORDER}`, marginTop: 6, paddingTop: 5,
          display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 12 }}>
          <span style={{ color: C_TOTAL }}>Total</span>
          <span style={{ color: C_TOTAL }}>{fmtUSD(r.total)}</span>
        </div>
      </div>
    );
  };
}

const CategoryTooltip = makeTooltip([
  { key: 'borrowerInterest', label: 'Borrower interest', color: C_BORROW },
  { key: 'tradingFees',      label: 'Trading fees',      color: C_TRADING },
  { key: 'gdnRewards',       label: 'GDN rewards',       color: C_REWARDS },
]);

const VenueTooltip = makeTooltip([
  { key: 'aave',         label: 'AAVE',           color: C_AAVE },
  { key: 'okx',          label: 'OKX',            color: C_OKX },
  { key: 'bullish',      label: 'Bullish',         color: C_BULLISH },
  { key: 'kraken',       label: 'Kraken',          color: '#5741d9' },
  { key: 'gate',         label: 'Gate',            color: '#0ba5ec' },
  { key: 'kucoin',       label: 'KuCoin',          color: '#29a784' },
  { key: 'uniswap_hood', label: 'Hood (Uniswap)',  color: '#ff007a' },
]);

// ── Main component ────────────────────────────────────────────────────────────────

export default function GdpTab() {
  const [view1, setView1]           = useState('30d');
  const [view2, setView2]           = useState('30d');
  const [view3, setView3]           = useState('30d');
  const [view4, setView4]           = useState('30d');
  const [activeChains, setActiveChains] = useState(new Set(CHAIN_KEYS));

  const toggleChain = k => setActiveChains(prev => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });
  const [activeVenues, setActiveVenues] = useState(new Set(VENUES));
  const [selectedVenue, setSelectedVenue] = useState('aave');

  const { data: aaveHist,      loading: l1 } = useAaveUsdgHistory();
  const { data: okxData,       loading: l2 } = useVolumeData('okx');
  const { data: bullishTotal,  loading: l3 } = useVolumeData('bullish');
  const { data: bullishPairs           }     = usePairVolumeData('bullish');
  const { data: krakenData             }     = useVolumeData('kraken');
  const { data: gateData               }     = useVolumeData('gate');
  const { data: kucoinTotal            }     = useVolumeData('kucoin');
  const { data: kucoinPairs            }     = usePairVolumeData('kucoin');
  const { data: hoodOhlcv              }     = useHoodVolumeHistory();
  const { data: supplyData             }     = useUsdgSupply();

  const supplyByDate    = useMemo(() => buildSupplyByDate(supplyData?.history), [supplyData]);
  const chainGdnDaily   = useMemo(() => buildChainGdnDaily(supplyData?.history), [supplyData]);
  const chart4 = useMemo(() => {
    if (!chainGdnDaily.length) return [];
    if (view4 === '30d') return chainGdnDaily.slice(-30).map(r => ({ ...r, displayDate: fmtLabel(r, '30d') }));
    const agg = aggregateChainBy(chainGdnDaily, view4 === '12m' ? 'month' : 'quarter');
    return (view4 === '12m' ? agg.slice(-12) : agg.slice(-4)).map(r => ({ ...r, displayDate: r.label }));
  }, [chainGdnDaily, view4]);
  const daily = useMemo(
    () => computeDaily(aaveHist, okxData, bullishPairs, bullishTotal, supplyByDate,
      krakenData, gateData, kucoinPairs, kucoinTotal, hoodOhlcv),
    [aaveHist, okxData, bullishPairs, bullishTotal, supplyByDate,
     krakenData, gateData, kucoinPairs, kucoinTotal, hoodOhlcv]
  );

  const chart1 = useMemo(() => sliceView(daily, view1).map(r => ({ ...r, displayDate: fmtLabel(r, view1) })), [daily, view1]);
  const chart2 = useMemo(() => sliceView(daily, view2).map(r => ({ ...r, displayDate: fmtLabel(r, view2) })), [daily, view2]);
  const chart3 = useMemo(() => sliceView(daily, view3).map(r => {
    let breakdown;
    const venueTotal = r[selectedVenue] || 0;
    if (selectedVenue === 'aave')
      breakdown = { borrowerInterest: r.aaveBorrow, gdnRewards: r.aaveNim, tradingFees: 0, total: r.aave };
    else
      breakdown = { borrowerInterest: 0, gdnRewards: 0, tradingFees: venueTotal, total: venueTotal };
    return { ...breakdown, displayDate: fmtLabel(r, view3) };
  }), [daily, view3, selectedVenue]);

  // Totals for the first chart's window
  const totals = useMemo(() => chart1.reduce(
    (acc, r) => { acc.borrowerInterest += r.borrowerInterest || 0; acc.tradingFees += r.tradingFees || 0;
      acc.gdnRewards += r.gdnRewards || 0; acc.total += r.total || 0; return acc; },
    { borrowerInterest: 0, tradingFees: 0, gdnRewards: 0, total: 0 }
  ), [chart1]);

  const toggleVenue = v => setActiveVenues(prev => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  const loading = l1 || l2 || l3; // l4 (bullishPairs) is non-blocking — renders without split data if slow

  const axisProps = {
    stroke: C_DIM, tick: { fill: C_DIM, fontSize: 11 }, tickMargin: 8, interval: 'preserveStartEnd',
  };

  return (
    <div style={{ background: GDP_BG, borderRadius: 16, padding: 24, border: `1px solid ${GDP_BORDER}`, minHeight: 400 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: C_TOTAL, margin: 0, fontSize: 22, fontWeight: 700 }}>USDG GDP</h2>
        <p style={{ color: C_DIM, margin: '4px 0 0', fontSize: 13 }}>
          Economic value generated by USDG across venues — borrower interest, trading fees, and GDN rewards on supply.
        </p>
      </div>

      {loading ? <div style={{ color: C_DIM, padding: 40, textAlign: 'center' }}>Loading…</div> : (
        <>
          {/* ── STAT TILES ── */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
            <Tile label="Total GDP" value={totals.total} color={C_TOTAL}
              sub={view1 === '30d' ? 'last 30 days' : view1 === '12m' ? 'last 12 months' : 'last 4 quarters'} />
            <Tile label="Borrower Interest Paid" value={totals.borrowerInterest} color={C_BORROW}
              sub="what USDG borrowers pay" />
            <Tile label="Trading Fees Paid" value={totals.tradingFees} color={C_TRADING}
              sub="est. from CEX trading volumes" />
            <Tile label="GDN Rewards Paid" value={totals.gdnRewards} color={C_REWARDS}
              sub={`circulating USDG × ${(NIM_APY * 100).toFixed(1)}% APY`} />
          </div>

          {/* ── CHART 1: by category ── */}
          <ChartSection title="GDP by Category"
            controls={<ViewToggle value={view1} onChange={setView1} />}>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart1} margin={{ top: 10, right: 16, left: 8, bottom: 5 }} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
                  <XAxis dataKey="displayDate" {...axisProps} />
                  <YAxis stroke={C_DIM} tick={{ fill: C_DIM, fontSize: 11 }} tickFormatter={fmtShort} width={62} />
                  <Tooltip content={<CategoryTooltip />} cursor={{ fill: C_CURSOR }} />
                  <Legend iconType="square" wrapperStyle={{ color: C_DIM, fontSize: 12 }}
                    formatter={v => ({ borrowerInterest: 'Borrower interest', tradingFees: 'Trading fees', gdnRewards: 'GDN rewards' }[v] || v)} />
                  <Bar dataKey="borrowerInterest" stackId="a" fill={C_BORROW}  isAnimationActive={false} />
                  <Bar dataKey="tradingFees"      stackId="a" fill={C_TRADING} isAnimationActive={false} />
                  <Bar dataKey="gdnRewards"       stackId="a" fill={C_REWARDS} radius={[3,3,0,0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartSection>

          {/* ── CHART 2: by venue, toggleable ── */}
          <ChartSection title="Trading Fees + Borrow Interest by Venue"
            controls={
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {VENUES.map(v => {
                  const on = activeVenues.has(v);
                  return (
                    <button key={v} onClick={() => toggleVenue(v)}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                        border: `2px solid ${VENUE_COLORS[v]}`,
                        background: on ? VENUE_COLORS[v] : 'transparent',
                        color: on ? '#1c1508' : VENUE_COLORS[v], fontWeight: 600 }}>
                      {VENUE_LABELS[v]}
                    </button>
                  );
                })}
                <ViewToggle value={view2} onChange={setView2} />
              </div>
            }>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart2} margin={{ top: 10, right: 16, left: 8, bottom: 5 }} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
                  <XAxis dataKey="displayDate" {...axisProps} />
                  <YAxis stroke={C_DIM} tick={{ fill: C_DIM, fontSize: 11 }} tickFormatter={fmtShort} width={62} />
                  <Tooltip content={<VenueTooltip />} cursor={{ fill: C_CURSOR }} />
                  <Legend iconType="square" wrapperStyle={{ color: C_DIM, fontSize: 12 }} />
                  {activeVenues.has('aave')         && <Bar dataKey="aave"         stackId="v" fill={C_AAVE}                      name="AAVE"            isAnimationActive={false} />}
                  {activeVenues.has('okx')          && <Bar dataKey="okx"          stackId="v" fill={C_OKX}                       name="OKX"             isAnimationActive={false} />}
                  {activeVenues.has('bullish')      && <Bar dataKey="bullish"      stackId="v" fill={C_BULLISH}                    name="Bullish"         isAnimationActive={false} />}
                  {activeVenues.has('kraken')       && <Bar dataKey="kraken"       stackId="v" fill={VENUE_COLORS.kraken}          name="Kraken"          isAnimationActive={false} />}
                  {activeVenues.has('gate')         && <Bar dataKey="gate"         stackId="v" fill={VENUE_COLORS.gate}            name="Gate"            isAnimationActive={false} />}
                  {activeVenues.has('kucoin')       && <Bar dataKey="kucoin"       stackId="v" fill={VENUE_COLORS.kucoin}          name="KuCoin"          isAnimationActive={false} />}
                  {activeVenues.has('uniswap_hood') && <Bar dataKey="uniswap_hood" stackId="v" fill={VENUE_COLORS.uniswap_hood}    name="Hood (Uniswap)"  radius={[3,3,0,0]} isAnimationActive={false} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartSection>

          {/* ── CHART 3: per-partner breakdown ── */}
          <ChartSection title="Trading Fees + Borrow Interest by Partner"
            controls={
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 3, background: '#f0f2f5', borderRadius: 8,
                  padding: 3, border: `1px solid ${GDP_BORDER}` }}>
                  {VENUES.map(v => (
                    <button key={v} onClick={() => setSelectedVenue(v)}
                      style={{ padding: '4px 14px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                        border: 'none', fontWeight: selectedVenue === v ? 600 : 400,
                        background: selectedVenue === v ? GDP_BTN_ACT : 'transparent',
                        color: selectedVenue === v ? VENUE_COLORS[v] : C_DIM }}>
                      {VENUE_LABELS[v]}
                    </button>
                  ))}
                </div>
                <ViewToggle value={view3} onChange={setView3} />
              </div>
            }>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart3} margin={{ top: 10, right: 16, left: 8, bottom: 5 }} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
                  <XAxis dataKey="displayDate" {...axisProps} />
                  <YAxis stroke={C_DIM} tick={{ fill: C_DIM, fontSize: 11 }} tickFormatter={fmtShort} width={62} />
                  <Tooltip content={<CategoryTooltip />} cursor={{ fill: C_CURSOR }} />
                  <Legend iconType="square" wrapperStyle={{ color: C_DIM, fontSize: 12 }}
                    formatter={v => ({ borrowerInterest: 'Borrower interest', tradingFees: 'Trading fees', gdnRewards: 'GDN rewards' }[v] || v)} />
                  <Bar dataKey="borrowerInterest" stackId="p" fill={C_BORROW}  isAnimationActive={false} />
                  <Bar dataKey="tradingFees"      stackId="p" fill={C_TRADING} isAnimationActive={false} />
                  <Bar dataKey="gdnRewards"       stackId="p" fill={C_REWARDS} radius={[3,3,0,0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartSection>

          {/* Chart 4: GDN rewards by chain */}
          {chart4.length > 0 && (
            <ChartSection title="GDN Rewards by Chain"
              controls={
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {CHAIN_KEYS.filter(k => chart4.some(r => (r[k] || 0) > 0)).map(k => {
                    const on = activeChains.has(k);
                    return (
                      <button key={k} onClick={() => toggleChain(k)}
                        style={{ padding: '4px 10px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                          border: `2px solid ${CHAIN_COLORS[k]}`,
                          background: on ? CHAIN_COLORS[k] : 'transparent',
                          color: on ? '#ffffff' : CHAIN_COLORS[k], fontWeight: 600 }}>
                        {CHAIN_LABELS[k]}
                      </button>
                    );
                  })}
                  <ViewToggle value={view4} onChange={setView4} />
                </div>
              }>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart4} margin={{ top: 10, right: 16, left: 8, bottom: 5 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
                    <XAxis dataKey="displayDate" stroke={C_DIM} tick={{ fill: C_DIM, fontSize: 11 }}
                      tickMargin={8} interval="preserveStartEnd" />
                    <YAxis stroke={C_DIM} tick={{ fill: C_DIM, fontSize: 11 }} tickFormatter={fmtShort} width={65} />
                    <Tooltip
                      cursor={{ fill: C_CURSOR }}
                      contentStyle={{ background: '#ffffff', border: `1px solid ${GDP_BORDER}`,
                        borderRadius: 8, boxShadow: '0 4px 12px rgba(25,40,47,0.12)', color: C_TEXT, minWidth: 200 }}
                      labelStyle={{ color: C_DIM, fontSize: 12 }}
                      formatter={(v, name) => [fmtUSD(v), CHAIN_LABELS[name] || name]} />
                    <Legend iconType="square" wrapperStyle={{ color: C_DIM, fontSize: 12 }}
                      formatter={v => CHAIN_LABELS[v] || v} />
                    {CHAIN_KEYS.filter(k => activeChains.has(k) && chart4.some(r => (r[k] || 0) > 0)).map((k, i, arr) => (
                      <Bar key={k} dataKey={k} stackId="c" fill={CHAIN_COLORS[k]}
                        radius={i === arr.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartSection>
          )}

          {/* Methodology */}
          <div style={{ marginTop: 20, padding: '10px 14px', background: GDP_CARD_BG,
            border: `1px solid ${GDP_BORDER}`, borderRadius: 8, fontSize: 12, color: C_DIM, lineHeight: 1.6 }}>
            <strong style={{ color: C_TEXT }}>Methodology: </strong>
            Borrower interest = AAVE daily borrow interest.
            GDN rewards = total circulating USDG (all chains) × {(NIM_APY * 100).toFixed(1)}% APY; falls back to AAVE idle proxy until chain snapshots accumulate.
            Trading fees: OKX USDG/USDT × 2bps; Bullish USDGUSDC × 2bps, BTCUSDG × 7bps.
            Prototype — additional venues and custody rewards TBD.
          </div>
        </>
      )}
    </div>
  );
}
