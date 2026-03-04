import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList
} from 'recharts';
import { useTvlSummary, useDexHistory } from '../hooks/useVolumeData';

const CHAIN_COLORS = {
  solana: '#9945FF',
  ethereum: '#627EEA'
};

const CATEGORY_COLORS = {
  dexTvl: '#00d4aa',
  lendingTvl: '#3b82f6'
};

function formatUsd(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TvlByChainChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="chart-empty-state">
        No TVL history yet. Daily snapshots will accumulate automatically.
      </div>
    );
  }

  const chainNames = [...new Set(history.flatMap(s => [
    ...(s.pools || []).map(p => p.chain || 'solana'),
    ...(s.lending || []).map(l => l.chain || 'solana')
  ]))];

  const chartData = history.map(snapshot => {
    const row = { date: snapshot.date, displayDate: formatDate(snapshot.date) };
    let total = 0;
    (snapshot.pools || []).forEach(p => {
      const chain = p.chain || 'solana';
      row[chain] = (row[chain] || 0) + (p.usdgBalance || 0);
    });
    (snapshot.lending || []).forEach(l => {
      const chain = l.chain || 'solana';
      row[chain] = (row[chain] || 0) + (l.depositTvl || 0);
    });
    chainNames.forEach(c => { total += (row[c] || 0); });
    row._total = total;
    return row;
  });

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
          <XAxis
            dataKey="displayDate"
            stroke="#71767b"
            tick={{ fill: '#71767b', fontSize: 11 }}
            tickMargin={10}
          />
          <YAxis
            stroke="#71767b"
            tick={{ fill: '#71767b', fontSize: 11 }}
            tickFormatter={(v) => formatUsd(v)}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1f2e',
              border: '1px solid #2f3542',
              borderRadius: '8px',
              color: '#e7e9ea'
            }}
            labelStyle={{ color: '#71767b' }}
            formatter={(value, name) => [formatUsd(value), name.charAt(0).toUpperCase() + name.slice(1)]}
            labelFormatter={(label, payload) => {
              const total = payload?.[0]?.payload?._total;
              return total != null
                ? `${label}  —  Total: ${formatUsd(total)}`
                : label;
            }}
          />
          <Legend
            wrapperStyle={{ color: '#e7e9ea' }}
            iconType="square"
            formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
          />
          {chainNames.map((chain, index) => (
            <Bar
              key={chain}
              dataKey={chain}
              stackId="tvl"
              fill={CHAIN_COLORS[chain] || '#888'}
              radius={index === chainNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              name={chain}
            >
              {index === chainNames.length - 1 && (
                <LabelList
                  dataKey="_total"
                  position="top"
                  formatter={(val) => formatUsd(val)}
                  style={{ fill: '#a0a4aa', fontSize: 10, fontWeight: 500 }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TvlHistoryChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="chart-empty-state">
        No TVL history yet. Daily snapshots will accumulate automatically.
      </div>
    );
  }

  const chartData = history.map(snapshot => {
    const dexTvl = (snapshot.pools || []).reduce((sum, p) => sum + (p.usdgBalance || 0), 0);
    const lendingTvl = (snapshot.lending || []).reduce((sum, l) => sum + (l.depositTvl || 0), 0);
    return {
      date: snapshot.date,
      displayDate: formatDate(snapshot.date),
      dexTvl,
      lendingTvl,
      _total: dexTvl + lendingTvl
    };
  });

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
          <XAxis
            dataKey="displayDate"
            stroke="#71767b"
            tick={{ fill: '#71767b', fontSize: 11 }}
            tickMargin={10}
          />
          <YAxis
            stroke="#71767b"
            tick={{ fill: '#71767b', fontSize: 11 }}
            tickFormatter={(v) => formatUsd(v)}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1f2e',
              border: '1px solid #2f3542',
              borderRadius: '8px',
              color: '#e7e9ea'
            }}
            labelStyle={{ color: '#71767b' }}
            formatter={(value, name) => {
              const label = name === 'dexTvl' ? 'DEX USDG' : 'Lending Supply';
              return [formatUsd(value), label];
            }}
            labelFormatter={(label, payload) => {
              const total = payload?.[0]?.payload?._total;
              return total != null
                ? `${label}  —  Total: ${formatUsd(total)}`
                : label;
            }}
          />
          <Legend
            wrapperStyle={{ color: '#e7e9ea' }}
            iconType="square"
            formatter={(value) => value === 'dexTvl' ? 'DEX USDG TVL' : 'Lending Supply TVL'}
          />
          <Bar
            dataKey="lendingTvl"
            stackId="tvl"
            fill={CATEGORY_COLORS.lendingTvl}
            name="lendingTvl"
          />
          <Bar
            dataKey="dexTvl"
            stackId="tvl"
            fill={CATEGORY_COLORS.dexTvl}
            name="dexTvl"
            radius={[4, 4, 0, 0]}
          >
            <LabelList
              dataKey="_total"
              position="top"
              formatter={(val) => formatUsd(val)}
              style={{ fill: '#a0a4aa', fontSize: 10, fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function groupByVenue(items) {
  const grouped = {};
  items.forEach(item => {
    const venue = item.venue || 'Unknown';
    if (!grouped[venue]) grouped[venue] = [];
    grouped[venue].push(item);
  });
  return Object.entries(grouped);
}

function ChainOverview({ chains }) {
  return (
    <div className="chain-overview-grid">
      {chains.map(chain => {
        const poolVenues = groupByVenue(chain.pools);
        const lendingVenues = groupByVenue(chain.lending);

        return (
          <div key={chain.chain} className="chain-overview-card">
            <div className="chain-header">
              <span className="chain-name">{chain.chain.charAt(0).toUpperCase() + chain.chain.slice(1)}</span>
              <span className="chain-total-tvl">{formatUsd(chain.totalTvl)}</span>
            </div>

            <div className="chain-tvl-breakdown">
              <div className="chain-tvl-row">
                <span className="tvl-category-dot" style={{ backgroundColor: CATEGORY_COLORS.dexTvl }} />
                <span>DEX USDG TVL</span>
                <span className="chain-tvl-value">{formatUsd(chain.dexTvl)}</span>
              </div>
              <div className="chain-tvl-row">
                <span className="tvl-category-dot" style={{ backgroundColor: CATEGORY_COLORS.lendingTvl }} />
                <span>Lending Supply TVL</span>
                <span className="chain-tvl-value">{formatUsd(chain.lendingTvl)}</span>
              </div>
            </div>

            <div className="chain-venues">
              {poolVenues.map(([venueName, pools]) => (
                <div key={venueName} className="venue-section">
                  <div className="venue-header">
                    <span className="venue-name">{venueName}</span>
                    <span className="venue-count">{pools.length} pool{pools.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="venue-stats">
                    <div className="venue-stat">
                      <span className="venue-stat-label">24h Volume</span>
                      <span className="venue-stat-value">
                        {formatUsd(pools.reduce((sum, p) => sum + p.volume24h, 0))}
                      </span>
                    </div>
                    <div className="venue-stat">
                      <span className="venue-stat-label">30d Volume</span>
                      <span className="venue-stat-value">
                        {formatUsd(pools.reduce((sum, p) => sum + p.volume30d, 0))}
                      </span>
                    </div>
                    <div className="venue-stat">
                      <span className="venue-stat-label">USDG TVL</span>
                      <span className="venue-stat-value">
                        {formatUsd(pools.reduce((sum, p) => sum + p.usdgBalance, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {lendingVenues.map(([venueName, reserves]) => (
                <div key={venueName} className="venue-section">
                  <div className="venue-header">
                    <span className="venue-name">{venueName}</span>
                    <span className="venue-count">{reserves.length} reserve{reserves.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="venue-stats">
                    <div className="venue-stat">
                      <span className="venue-stat-label">Total Deposits</span>
                      <span className="venue-stat-value">
                        {formatUsd(reserves.reduce((sum, l) => sum + l.depositTvl, 0))}
                      </span>
                    </div>
                    <div className="venue-stat">
                      <span className="venue-stat-label">Total Borrows</span>
                      <span className="venue-stat-value">
                        {formatUsd(reserves.reduce((sum, l) => sum + l.totalBorrows, 0))}
                      </span>
                    </div>
                    <div className="venue-stat">
                      <span className="venue-stat-label">Supply APY</span>
                      <span className="venue-stat-value yield-value">
                        {(reserves[0]?.supplyAPY * 100 || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TotalDefiTab() {
  const { data: tvlData, loading: tvlLoading } = useTvlSummary();
  const { data: historyData, loading: historyLoading } = useDexHistory();

  const loading = tvlLoading || historyLoading;

  if (loading) {
    return (
      <section className="exchange-section">
        <div className="section-header"><h2>Total DeFi TVL</h2></div>
        <div className="loading">Loading DeFi TVL data...</div>
      </section>
    );
  }

  const chains = tvlData?.chains || [];
  const grandTotal = chains.reduce((sum, c) => sum + c.totalTvl, 0);
  const history = historyData?.history || [];

  return (
    <section className="exchange-section">
      <div className="section-header">
        <h2>Total DeFi TVL</h2>
        <span className="total-defi-grand-total">{formatUsd(grandTotal)}</span>
      </div>

      <div className="dex-chart-section">
        <h3 className="defi-subsection-title">Total TVL by Chain</h3>
        <TvlByChainChart history={history} />
      </div>

      <div className="dex-chart-section">
        <h3 className="defi-subsection-title">TVL by Category (DEX vs Lending)</h3>
        <TvlHistoryChart history={history} />
      </div>

      <h3 className="defi-subsection-title">Chain Overview</h3>
      <ChainOverview chains={chains} />
    </section>
  );
}
