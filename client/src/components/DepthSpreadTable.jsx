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

function DepthTable({ rows, bpsLevels, title }) {
  if (rows.length === 0) return null;

  return (
    <div className="depth-table-group">
      <h3>{title}</h3>
      <div className="depth-table-wrapper">
        <table className="depth-table">
          <thead>
            <tr>
              <th className="col-left">Venue</th>
              <th className="col-left">Pair</th>
              <th>Spread</th>
              {bpsLevels.map(bps => (
                <th key={`bid-${bps}`}>Bid @{bps}bps</th>
              ))}
              {bpsLevels.map(bps => (
                <th key={`ask-${bps}`}>Ask @{bps}bps</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.exchange}-${row.pair}`}>
                <td className="col-left">{row.exchangeDisplay}</td>
                <td className="col-left">{row.pair}</td>
                <td className={spreadColorClass(row.spreadBps, row.pairType)}>
                  {row.spreadBps.toFixed(1)} bps
                </td>
                {bpsLevels.map(bps => (
                  <td key={`bid-${bps}`}>{formatUSD(row.bidDepth[bps])}</td>
                ))}
                {bpsLevels.map(bps => (
                  <td key={`ask-${bps}`}>{formatUSD(row.askDepth[bps])}</td>
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
        bpsLevels={[2, 5, 10, 100]}
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
