import { useState } from 'react';
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

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function CsvDownload({ endpoint, filename }) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`${endpoint}?start=${start}&end=${end}&format=csv`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename(start, end);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 8px' }}>
      <span style={{ color: '#71767b', fontSize: 13 }}>Download CSV:</span>
      <input type="date" value={start} onChange={e => setStart(e.target.value)}
        style={{ background: '#1a1f2e', border: '1px solid #2f3542', color: '#e7e9ea', borderRadius: 4, padding: '3px 8px', fontSize: 13 }} />
      <span style={{ color: '#71767b', fontSize: 13 }}>to</span>
      <input type="date" value={end} onChange={e => setEnd(e.target.value)}
        style={{ background: '#1a1f2e', border: '1px solid #2f3542', color: '#e7e9ea', borderRadius: 4, padding: '3px 8px', fontSize: 13 }} />
      <button onClick={handleDownload} disabled={downloading}
        style={{ background: '#2f3542', color: '#e7e9ea', border: '1px solid #3d4555', borderRadius: 4, padding: '4px 14px', fontSize: 13, cursor: downloading ? 'wait' : 'pointer' }}>
        {downloading ? 'Downloading…' : 'Download CSV'}
      </button>
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
        bpsLevels={[1, 2, 5, 10, 50, 100]}
        title="Stablecoin Pairs"
      />

      <DepthTable
        rows={riskRows}
        bpsLevels={[10, 25, 50, 100]}
        title="Risk Pairs"
      />

      <CsvDownload
        endpoint="/api/depth/history"
        filename={(s, e) => `usdg_depth_${s}_to_${e}.csv`}
      />

      {lastUpdated && (
        <div className="chart-footnote">
          Last updated: {formatTime(lastUpdated)} (auto-refreshes every 5 min) · Depth snapshots logged hourly
        </div>
      )}
    </div>
  );
}
