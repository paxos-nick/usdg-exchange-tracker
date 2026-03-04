import { useDefiPools } from '../hooks/useVolumeData';
import DexVolumeChart from './DexVolumeChart';
import PoolDetailChart from './PoolDetailChart';

function formatUsd(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatTokenAmount(balance, symbol) {
  if (balance >= 1e6) return `${(balance / 1e6).toFixed(2)}M ${symbol}`;
  if (balance >= 1e3) return `${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${symbol}`;
  if (balance >= 1) return `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`;
  return `${balance.toFixed(6)} ${symbol}`;
}

function formatPct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function PoolCard({ pool }) {
  // Always show USDG first
  const isAUsdg = pool.tokenA.symbol === 'USDG';
  const usdgToken = isAUsdg ? pool.tokenA : pool.tokenB;
  const otherToken = isAUsdg ? pool.tokenB : pool.tokenA;

  // USDG ≈ $1, so usdgBalance ≈ USD value
  const usdgUsd = pool.usdgBalance || usdgToken.balance;
  const otherUsd = pool.tvlUsd - usdgUsd;

  const pctUsdg = pool.tvlUsd > 0 ? (usdgUsd / pool.tvlUsd) * 100 : 50;
  const pctOther = 100 - pctUsdg;

  return (
    <div className="defi-pool-card">
      <div className="pool-header">
        <h3>{pool.name}</h3>
        <div className="pool-badges">
          <span className={`pool-type-badge ${pool.type}`}>{pool.type}</span>
          {pool.chain && <span className={`pool-type-badge ${pool.chain}`}>{pool.chain.charAt(0).toUpperCase() + pool.chain.slice(1)}</span>}
        </div>
      </div>

      <div className="pool-tvl">
        <span className="pool-stat-label">TVL</span>
        <span className="pool-stat-value">{formatUsd(pool.tvlUsd)}</span>
      </div>

      <div className="pool-balance-section">
        <div className="pool-balance-label">Pool Balance</div>
        <div className="pool-balance-bar">
          <div
            className="pool-balance-fill-a"
            style={{ width: `${pctUsdg}%` }}
            title={`USDG: ${pctUsdg.toFixed(1)}%`}
          />
          <div
            className="pool-balance-fill-b"
            style={{ width: `${pctOther}%` }}
            title={`${otherToken.symbol}: ${pctOther.toFixed(1)}%`}
          />
        </div>
        <div className="pool-balance-legend">
          <span className="legend-a">USDG: {formatUsd(usdgUsd)} ({pctUsdg.toFixed(1)}%)</span>
          <span className="legend-b">
            {pool.type === 'stablecoin'
              ? `${otherToken.symbol}: ${formatUsd(otherToken.balance)} (${pctOther.toFixed(1)}%)`
              : `${otherToken.symbol}: ${formatTokenAmount(otherToken.balance, otherToken.symbol)} (${pctOther.toFixed(1)}%)`
            }
          </span>
        </div>
      </div>

      <div className="pool-stats-grid">
        <div className="pool-stat-group">
          <div className="pool-stat-group-title">Volume</div>
          <div className="pool-stat-row">
            <span>24h</span><span>{formatUsd(pool.stats['24h'].volume)}</span>
          </div>
          <div className="pool-stat-row">
            <span>7d</span><span>{formatUsd(pool.stats['7d'].volume)}</span>
          </div>
          <div className="pool-stat-row">
            <span>30d</span><span>{formatUsd(pool.stats['30d'].volume)}</span>
          </div>
        </div>

        <div className="pool-stat-group">
          <div className="pool-stat-group-title">Fees</div>
          <div className="pool-stat-row">
            <span>24h</span><span>{formatUsd(pool.stats['24h'].fees)}</span>
          </div>
          <div className="pool-stat-row">
            <span>7d</span><span>{formatUsd(pool.stats['7d'].fees)}</span>
          </div>
          <div className="pool-stat-row">
            <span>30d</span><span>{formatUsd(pool.stats['30d'].fees)}</span>
          </div>
        </div>

        <div className="pool-stat-group">
          <div className="pool-stat-group-title">Yield (APY)</div>
          <div className="pool-stat-row">
            <span>24h</span><span className="yield-value">{formatPct(pool.stats['24h'].yieldOverTvl * 365)}</span>
          </div>
          <div className="pool-stat-row">
            <span>7d</span><span className="yield-value">{formatPct(pool.stats['7d'].yieldOverTvl * (365/7))}</span>
          </div>
          <div className="pool-stat-row">
            <span>30d</span><span className="yield-value">{formatPct(pool.stats['30d'].yieldOverTvl * (365/30))}</span>
          </div>
        </div>
      </div>

      <div className="pool-meta">
        {pool.feeRate > 0 && <span>Fee Rate: {(pool.feeRate * 100).toFixed(2)}%</span>}
        {pool.type === 'stablecoin' && pool.price != null && <span>Price: {pool.price.toFixed(6)}</span>}
        {pool.baseApr && <span>Base APR (7d): {(pool.baseApr.weekly * 100).toFixed(2)}%</span>}
        {pool.venue && <span>Venue: {pool.venue}</span>}
      </div>
    </div>
  );
}

export default function DefiPoolsTable() {
  const { data, loading, error, lastUpdated } = useDefiPools();

  if (loading) {
    return (
      <section className="exchange-section">
        <div className="section-header"><h2>DEX Dashboard</h2></div>
        <div className="loading">Loading DEX pool data...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="exchange-section">
        <div className="section-header"><h2>DEX Dashboard</h2></div>
        <div className="error">Error: {error}</div>
      </section>
    );
  }

  const pools = data?.pools || [];

  // Group pools by chain+venue
  const venues = {};
  pools.forEach(p => {
    const venue = p.venue || (p.chain === 'ethereum' ? 'Curve' : 'Orca');
    const chain = p.chain || 'solana';
    const key = `${chain}-${venue}`;
    if (!venues[key]) venues[key] = { chain, venue, pools: [] };
    venues[key].pools.push(p);
  });
  const venueList = Object.values(venues);

  const totalTvl = pools.reduce((s, p) => s + (p.tvlUsd || 0), 0);
  const totalUsdgInPools = pools.reduce((s, p) => s + (p.usdgBalance || 0), 0);
  const totalVolume24h = pools.reduce((s, p) => s + (p.stats['24h']?.volume || 0), 0);

  return (
    <section className="exchange-section">
      <div className="section-header">
        <h2>DEX Dashboard</h2>
        {lastUpdated && (
          <span className="last-updated">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {venueList.map(v => {
        const vTvl = v.pools.reduce((s, p) => s + (p.tvlUsd || 0), 0);
        const vUsdg = v.pools.reduce((s, p) => s + (p.usdgBalance || 0), 0);
        const vVol24 = v.pools.reduce((s, p) => s + (p.stats['24h']?.volume || 0), 0);
        const vVol30 = v.pools.reduce((s, p) => s + (p.stats['30d']?.volume || 0), 0);
        return (
          <div key={`${v.chain}-${v.venue}`} className="dex-venue-overview">
            <div className="venue-overview-header">
              <div className="venue-overview-tag">
                <span className="venue-tag-chain">{v.chain.charAt(0).toUpperCase() + v.chain.slice(1)}</span>
                <span className="venue-tag-venue">{v.venue}</span>
              </div>
              <span className="venue-pool-count">{v.pools.length} pool{v.pools.length !== 1 ? 's' : ''} tracked</span>
            </div>
            <div className="venue-overview-stats">
              <div className="venue-overview-stat">
                <span className="venue-overview-label">Total Pool TVL</span>
                <span className="venue-overview-value">{formatUsd(vTvl)}</span>
              </div>
              <div className="venue-overview-stat">
                <span className="venue-overview-label">USDG TVL</span>
                <span className="venue-overview-value">{formatUsd(vUsdg)}</span>
              </div>
              <div className="venue-overview-stat">
                <span className="venue-overview-label">24h Volume</span>
                <span className="venue-overview-value">{formatUsd(vVol24)}</span>
              </div>
              <div className="venue-overview-stat">
                <span className="venue-overview-label">30d Volume</span>
                <span className="venue-overview-value">{formatUsd(vVol30)}</span>
              </div>
            </div>
          </div>
        );
      })}

      <DexVolumeChart />
      <PoolDetailChart />

      <h3 className="defi-subsection-title">Current Pool Stats</h3>
      <div className="defi-pools-grid">
        {pools.map(pool => (
          <PoolCard key={pool.address} pool={pool} />
        ))}
      </div>
    </section>
  );
}
