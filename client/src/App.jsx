import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import AggregatedExchangeChart from './components/AggregatedExchangeChart';
import AssetVolumeChart from './components/AssetVolumeChart';
import ExchangeSelector from './components/ExchangeSelector';
import VolumeChart from './components/VolumeChart';
import PairSelector from './components/PairSelector';
import PairVolumeChart from './components/PairVolumeChart';
import TimeRangeSelector from './components/TimeRangeSelector';
import WeeklyTrends from './components/WeeklyTrends';
import MonthlyTrends from './components/MonthlyTrends';
import DepthSpreadTable from './components/DepthSpreadTable';
import { useVolumeData, usePairVolumeData } from './hooks/useVolumeData';

const EXCHANGE_NAMES = {
  kraken: 'Kraken',
  bullish: 'Bullish',
  gate: 'Gate.io',
  kucoin: 'Kucoin',
  bitmart: 'Bitmart',
  okx: 'OKX'
};

function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedExchange, setSelectedExchange] = useState('kraken');
  const [exchangeTimeRange, setExchangeTimeRange] = useState('30d');
  const [pairExchange, setPairExchange] = useState('kraken');
  const [pairTimeRange, setPairTimeRange] = useState('30d');
  const [selectedPairs, setSelectedPairs] = useState([]);

  const { data, loading, error, lastUpdated } = useVolumeData(selectedExchange);
  const { data: pairData, loading: pairLoading, error: pairError } = usePairVolumeData(pairExchange);

  // Reset selected pairs when exchange changes
  useEffect(() => {
    setSelectedPairs([]);
  }, [pairExchange]);

  // Auto-select first pair when data loads
  useEffect(() => {
    if (pairData?.pairs?.length > 0 && selectedPairs.length === 0) {
      setSelectedPairs([pairData.pairs[0]]);
    }
  }, [pairData?.pairs]);

  const exchangeDisplayName = EXCHANGE_NAMES[selectedExchange] || selectedExchange;

  return (
    <div className="app">
      <header className="header">
        <h1>USDG Trading Volume Tracker</h1>
        <p>Track USDG stablecoin trading volume across exchanges</p>
      </header>

      {/* Tab Navigation */}
      <nav className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === 'weekly' ? 'active' : ''}`}
          onClick={() => setActiveTab('weekly')}
        >
          Weekly Trends
        </button>
        <button
          className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveTab('monthly')}
        >
          Monthly Trends
        </button>
        <button
          className={`tab-btn ${activeTab === 'depth' ? 'active' : ''}`}
          onClick={() => setActiveTab('depth')}
        >
          Depth & Spread
        </button>
      </nav>

      {activeTab === 'weekly' ? (
        <WeeklyTrends />
      ) : activeTab === 'monthly' ? (
        <MonthlyTrends />
      ) : activeTab === 'depth' ? (
        <DepthSpreadTable />
      ) : (
        <>
          <Dashboard />

      {/* All Exchanges Stacked Chart */}
      <AggregatedExchangeChart />

      {/* Asset Volume by Exchange */}
      <AssetVolumeChart />

      {/* Single Exchange Section */}
      <section className="exchange-section">
        <div className="section-header">
          <h2>Exchange Trading Volume: {exchangeDisplayName}</h2>
          <div className="section-controls">
            <TimeRangeSelector value={exchangeTimeRange} onChange={setExchangeTimeRange} />
            <ExchangeSelector value={selectedExchange} onChange={setSelectedExchange} />
          </div>
        </div>

        {loading && (
          <div className="loading">Loading {exchangeDisplayName} data...</div>
        )}

        {error && (
          <div className="error">Error: {error}</div>
        )}

        {!loading && !error && data && (
          <>
            <VolumeChart data={data.dailyVolume} timeRange={exchangeTimeRange} />

            {data.pairs && data.pairs.length > 0 && (
              <div className="pairs-list">
                <h3>USDG Trading Pairs ({data.pairs.length})</h3>
                <div className="pairs-tags">
                  {data.pairs.map((pair) => (
                    <span key={pair} className="pair-tag">{pair}</span>
                  ))}
                </div>
              </div>
            )}

            {lastUpdated && (
              <div className="refresh-info">
                Last updated: {formatTime(lastUpdated)} (auto-refreshes every 6 hours)
              </div>
            )}
          </>
        )}
      </section>

      {/* Per-Pair Comparison Section */}
      <section className="exchange-section">
        <div className="section-header">
          <h2>Trading Volume by Pair</h2>
          <div className="section-controls">
            <TimeRangeSelector value={pairTimeRange} onChange={setPairTimeRange} />
            <ExchangeSelector value={pairExchange} onChange={setPairExchange} />
          </div>
        </div>

        {pairLoading && (
          <div className="loading">Loading {EXCHANGE_NAMES[pairExchange] || pairExchange} pair data...</div>
        )}

        {pairError && (
          <div className="error">Error: {pairError}</div>
        )}

        {!pairLoading && !pairError && pairData && (
          <>
            <PairSelector
              pairs={pairData.pairs}
              selectedPairs={selectedPairs}
              onChange={setSelectedPairs}
            />

            <PairVolumeChart
              volumeByPair={pairData.volumeByPair}
              selectedPairs={selectedPairs}
              timeRange={pairTimeRange}
            />

            {selectedPairs.length > 1 && (
              <div className="chart-note">
                Showing stacked trading volume for {selectedPairs.length} pairs. Hover over bars to see individual pair volumes.
              </div>
            )}
          </>
        )}
      </section>
        </>
      )}
    </div>
  );
}
