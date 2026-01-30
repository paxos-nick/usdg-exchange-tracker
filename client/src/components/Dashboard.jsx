import { useAggregatedData } from '../hooks/useVolumeData';

function formatVolume(volume) {
  if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
  if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
  return `$${volume.toFixed(2)}`;
}

export default function Dashboard() {
  const { data, loading, error } = useAggregatedData();

  if (loading) {
    return (
      <div className="dashboard">
        <h2>Aggregated USDG Trading Volume</h2>
        <div className="loading">Loading aggregated data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <h2>Aggregated USDG Trading Volume</h2>
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  const totalPairs = data?.pairsByExchange
    ? Object.values(data.pairsByExchange).flat().length
    : 0;

  // Calculate 24h volume (last entry)
  const last24hVolume = data?.dailyVolume?.length > 0
    ? data.dailyVolume[data.dailyVolume.length - 1].volume
    : 0;

  // Calculate 7-day volume
  const last7Days = data?.dailyVolume?.slice(-7) || [];
  const last7DaysVolume = last7Days.reduce((sum, d) => sum + d.volume, 0);

  return (
    <div className="dashboard">
      <h2>Aggregated USDG Trading Volume (All Exchanges)</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Trading Volume (All Time)</div>
          <div className="stat-value">{formatVolume(data?.totalVolume || 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">24h Trading Volume</div>
          <div className="stat-value">{formatVolume(last24hVolume)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">7-Day Trading Volume</div>
          <div className="stat-value">{formatVolume(last7DaysVolume)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Exchanges</div>
          <div className="stat-value">{data?.exchanges?.length || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total USDG Pairs</div>
          <div className="stat-value">{totalPairs}</div>
        </div>
      </div>
    </div>
  );
}
