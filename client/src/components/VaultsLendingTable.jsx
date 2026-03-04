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
import { useDefiVaults, useDefiLending, useDexHistory } from '../hooks/useVolumeData';

const CHAIN_COLORS = {
  solana: '#9945FF',
  ethereum: '#627EEA'
};

function formatUsd(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function LendingSupplyByChainChart({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="chart-empty-state">
        No lending history yet. Daily snapshots will accumulate automatically.
      </div>
    );
  }

  const chainNames = [...new Set(history.flatMap(s =>
    (s.lending || []).map(l => l.chain || 'solana')
  ))];

  const chartData = history.map(snapshot => {
    const row = { date: snapshot.date, displayDate: formatDate(snapshot.date) };
    let total = 0;
    (snapshot.lending || []).forEach(l => {
      const chain = l.chain || 'solana';
      row[chain] = (row[chain] || 0) + (l.depositTvl || 0);
      total += (l.depositTvl || 0);
    });
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
              stackId="supply"
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

function formatPct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function VaultCard({ vault }) {
  return (
    <div className="defi-vault-card">
      <div className="vault-header">
        <h3>{vault.name}</h3>
        <span className="vault-badge">Vault</span>
      </div>

      <div className="vault-tvl">
        <span className="pool-stat-label">Total Value Locked</span>
        <span className="pool-stat-value">{formatUsd(vault.tvl)}</span>
      </div>

      <div className="pool-stats-grid">
        <div className="pool-stat-group">
          <div className="pool-stat-group-title">APY</div>
          <div className="pool-stat-row">
            <span>Current</span><span className="yield-value">{formatPct(vault.apy.current)}</span>
          </div>
          <div className="pool-stat-row">
            <span>24h</span><span className="yield-value">{formatPct(vault.apy['24h'])}</span>
          </div>
          <div className="pool-stat-row">
            <span>7d</span><span className="yield-value">{formatPct(vault.apy['7d'])}</span>
          </div>
          <div className="pool-stat-row">
            <span>30d</span><span className="yield-value">{formatPct(vault.apy['30d'])}</span>
          </div>
          <div className="pool-stat-row">
            <span>90d</span><span className="yield-value">{formatPct(vault.apy['90d'])}</span>
          </div>
        </div>

        <div className="pool-stat-group">
          <div className="pool-stat-group-title">Details</div>
          <div className="pool-stat-row">
            <span>Share Price</span><span>${vault.sharePrice.toFixed(4)}</span>
          </div>
          <div className="pool-stat-row">
            <span>Holders</span><span>{vault.holders.toLocaleString()}</span>
          </div>
          <div className="pool-stat-row">
            <span>Cumulative Interest</span><span>{formatUsd(vault.cumulativeInterestUsd)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LendingCard({ lending }) {
  const utilization = lending.utilization;

  return (
    <div className="defi-lending-card">
      <div className="vault-header">
        <h3>{lending.name}</h3>
        <div className="lending-badges">
          <span className="lending-badge">Lending Reserve</span>
          {lending.chain && <span className={`pool-type-badge ${lending.chain}`}>{lending.chain.charAt(0).toUpperCase() + lending.chain.slice(1)}</span>}
          {lending.venue && <span className="pool-type-badge venue">{lending.venue}</span>}
        </div>
      </div>

      <div className="lending-stats-row">
        <div className="lending-stat">
          <span className="pool-stat-label">Total Deposits</span>
          <span className="pool-stat-value">{formatUsd(lending.depositTvl)}</span>
        </div>
        <div className="lending-stat">
          <span className="pool-stat-label">Total Borrows</span>
          <span className="pool-stat-value">{formatUsd(lending.totalBorrows)}</span>
        </div>
        <div className="lending-stat">
          <span className="pool-stat-label">Available Liquidity</span>
          <span className="pool-stat-value">{formatUsd(lending.totalLiquidity)}</span>
        </div>
      </div>

      <div className="utilization-section">
        <div className="utilization-header">
          <span>Utilization</span>
          <span className="utilization-pct">{utilization.toFixed(1)}%</span>
        </div>
        <div className="utilization-bar">
          <div
            className="utilization-fill"
            style={{
              width: `${Math.min(utilization, 100)}%`,
              backgroundColor: utilization > 90 ? '#ef4444' : utilization > 70 ? '#f59e0b' : '#10b981'
            }}
          />
        </div>
      </div>

      <div className="lending-apy-row">
        <div className="lending-apy">
          <span className="pool-stat-label">Supply APY</span>
          <span className="yield-value">{formatPct(lending.supplyAPY)}</span>
        </div>
        <div className="lending-apy">
          <span className="pool-stat-label">Borrow APY</span>
          <span className="borrow-apy-value">{formatPct(lending.borrowAPY)}</span>
        </div>
      </div>

      <div className="lending-meta">
        <span>LTV: {(lending.loanToValue * 100).toFixed(0)}%</span>
        <span>Liquidation Threshold: {(lending.liquidationThreshold * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default function VaultsLendingTable() {
  const { data: vaultData, loading: vLoading, error: vError } = useDefiVaults();
  const { data: lendData, loading: lLoading, error: lError, lastUpdated } = useDefiLending();
  const { data: historyData, loading: hLoading } = useDexHistory();

  const loading = vLoading || lLoading || hLoading;

  if (loading) {
    return (
      <section className="exchange-section">
        <div className="section-header"><h2>Vaults & Lending</h2></div>
        <div className="loading">Loading vault and lending data...</div>
      </section>
    );
  }

  return (
    <section className="exchange-section">
      <div className="section-header">
        <h2>Vaults & Lending</h2>
        {lastUpdated && (
          <span className="last-updated">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {vError && <div className="error">Vault error: {vError}</div>}
      {lError && <div className="error">Lending error: {lError}</div>}

      <div className="dex-chart-section">
        <h3 className="defi-subsection-title">Lending Supply by Chain</h3>
        <LendingSupplyByChainChart history={historyData?.history || []} />
      </div>

      <div className="defi-vaults-section">
        <h3 className="defi-subsection-title">Vaults</h3>
        <div className="defi-pools-grid">
          {(vaultData?.vaults || []).map(vault => (
            <VaultCard key={vault.address} vault={vault} />
          ))}
        </div>
      </div>

      <div className="defi-lending-section">
        <h3 className="defi-subsection-title">Lending Reserves</h3>
        <div className="defi-pools-grid">
          {(lendData?.reserves || []).map(reserve => (
            <LendingCard key={reserve.name} lending={reserve} />
          ))}
        </div>
      </div>
    </section>
  );
}
