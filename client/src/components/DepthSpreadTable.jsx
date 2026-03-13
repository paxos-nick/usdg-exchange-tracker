import { useDepthData } from '../hooks/useVolumeData';

function formatUSD(value) {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function spreadColorClass(spreadBps, pairType) {
  if (pairType === 'stablecoin') {
    if (spreadBps < 5) return 'spread-tight';
    if (spreadBps < 20) return 'spread-moderate';
    return 'spread-wide';
  }
  // risk pair
  if (spreadBps < 20) return 'spread-tight';
  if (spreadBps < 50) return 'spread-moderate';
  return 'spread-wide';
}

function FreshnessDot({ ok }) {
  if (ok === null || ok === undefined) return <span className="freshness-dot freshness-unknown" title="No data yet" />;
  return (
    <span
      className={`freshness-dot ${ok ? 'freshness-ok' : 'freshness-error'}`}
      title={ok ? 'Live' : 'Stale or error'}
    />
  );
}

function DepthTable({ rows, bpsLevels, title }) {
  if (rows.length === 0) return null;

  // Bid columns: widest first (left), tightest last (adjacent to spread center)
  const bidLevels = [...bpsLevels].reverse();
  // Ask columns: tightest first (adjacent to spread center), widest last (right)
  const askLevels = [...bpsLevels];

  return (
    <div className="depth-table-group">
      <h3>{title}</h3>
      <div className="depth-table-wrapper">
        <table className="depth-table">
          <thead>
            <tr>
              <th className="col-left">Venue</th>
              <th className="col-left">Pair</th>
              {bidLevels.map(bps => (
                <th key={`bid-${bps}`} className="col-bid">Bid @{bps}bps</th>
              ))}
              <th>Spread</th>
              {askLevels.map(bps => (
                <th key={`ask-${bps}`} className="col-ask">Ask @{bps}bps</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.exchange}-${row.pair}`}>
                <td className="col-venue">
                  <FreshnessDot ok={row.ok} />
                  {row.exchangeDisplay}
                </td>
                <td className="col-left">{row.pair}</td>
                {bidLevels.map(bps => (
                  <td key={`bid-${bps}`} className="col-bid">
                    {row.bidDepth[bps] != null ? formatUSD(row.bidDepth[bps]) : '—'}
                  </td>
                ))}
                <td className={spreadColorClass(row.spreadBps, row.pairType)}>
                  {row.spreadBps.toFixed(1)} bps
                </td>
                {askLevels.map(bps => (
                  <td key={`ask-${bps}`} className="col-ask">
                    {row.askDepth[bps] != null ? formatUSD(row.askDepth[bps]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DepthSpreadTable() {
  const { data, loading, error, lastUpdated } = useDepthData();

  if (loading) {
    return (
      <div className="depth-spread-section">
        <h2>Orderbook Depth & Spread</h2>
        <div className="loading">Loading depth & spread data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="depth-spread-section">
        <h2>Orderbook Depth & Spread</h2>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <div className="depth-spread-section">
        <h2>Orderbook Depth & Spread</h2>
        <div className="no-data">No orderbook data available.</div>
      </div>
    );
  }

  const stablecoinRows = data.rows.filter(r => r.pairType === 'stablecoin');
  const riskRows = data.rows.filter(r => r.pairType === 'risk');

  return (
    <div className="depth-spread-section">
      <h2>Orderbook Depth & Spread</h2>

      <DepthTable
        rows={stablecoinRows}
        bpsLevels={[1, 2, 5, 10, 100]}
        title="Stablecoin Pairs"
      />

      <DepthTable
        rows={riskRows}
        bpsLevels={[10, 25, 50, 100]}
        title="Risk Pairs"
      />

      {lastUpdated && (
        <div className="chart-footnote">
          Last updated: {formatTime(lastUpdated)} (auto-refreshes every 5 min)
        </div>
      )}
    </div>
  );
}
