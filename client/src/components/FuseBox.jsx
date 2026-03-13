import { useHealthData } from '../hooks/useVolumeData';

function formatAgo(ms) {
  if (ms === null || ms === undefined) return 'Never';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StatusLight({ ok, lastSuccess }) {
  const isNeverFetched = lastSuccess === null;

  let colorClass, label;
  if (isNeverFetched) {
    colorClass = 'fuse-light-unknown';
    label = 'No data yet';
  } else if (ok) {
    colorClass = 'fuse-light-ok';
    label = 'Live';
  } else {
    colorClass = 'fuse-light-error';
    label = 'Down';
  }

  return (
    <div className={`fuse-light ${colorClass}`} title={label}>
      <span className="fuse-light-inner" />
    </div>
  );
}

export default function FuseBox() {
  const { data, loading, error, lastUpdated, refetch } = useHealthData();

  return (
    <div className="fuse-box-section">
      <div className="section-header">
        <h2>Fuse Box — Exchange Connection Health</h2>
        {lastUpdated && (
          <span className="fuse-updated">
            Last checked: {formatTime(lastUpdated)}
            <button className="fuse-refresh-btn" onClick={refetch}>Refresh</button>
          </span>
        )}
      </div>

      {loading && !data && (
        <div className="loading">Checking exchange connections...</div>
      )}

      {error && (
        <div className="error">Error: {error}</div>
      )}

      {data?.exchanges && (
        <div className="fuse-grid">
          {Object.entries(data.exchanges).map(([key, exchange]) => (
            <div key={key} className={`fuse-card ${exchange.ok ? 'fuse-card-ok' : exchange.lastSuccess === null ? 'fuse-card-unknown' : 'fuse-card-error'}`}>
              <StatusLight ok={exchange.ok} lastSuccess={exchange.lastSuccess} />
              <div className="fuse-card-body">
                <div className="fuse-card-name">{exchange.name}</div>
                <div className="fuse-card-status">
                  {exchange.ok
                    ? `Live · ${formatAgo(exchange.lastSuccessAgoMs)}`
                    : exchange.lastSuccess === null
                      ? 'No successful fetch yet'
                      : `Down · last ok ${formatAgo(exchange.lastSuccessAgoMs)}`
                  }
                </div>
                {exchange.lastError && !exchange.ok && (
                  <div className="fuse-card-error-msg">{exchange.lastError}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="chart-footnote">
        Green = last fetch succeeded within 10 min &nbsp;·&nbsp;
        Red = fetch failed or data older than 10 min &nbsp;·&nbsp;
        Auto-refreshes every 60s
      </div>
    </div>
  );
}
