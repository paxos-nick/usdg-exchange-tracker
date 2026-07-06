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
import FuseBox from './components/FuseBox';
import DefiPoolsTable from './components/DefiPoolsTable';
import VaultsLendingTable from './components/VaultsLendingTable';
import OverallVolumeChart from './components/OverallVolumeChart';
import TotalDefiTab from './components/TotalDefiTab';
import PyusdTab from './components/PyusdTab';
import PaxgSupplyTab from './components/PaxgSupplyTab';
import BinancePaxgTab from './components/BinancePaxgTab';
import AaveUsdgTab from './components/AaveUsdgTab';
import PaxgVolumeTab from './components/PaxgVolumeTab';
import { useVolumeData, usePairVolumeData } from './hooks/useVolumeData';

const EXCHANGE_NAMES = {
  kraken: 'Kraken',
  bullish: 'Bullish',
  gate: 'Gate.io',
  kucoin: 'Kucoin',
  bitmart: 'Bitmart',
  okx: 'OKX'
};

// Navigation grouped into dropdown menus so it scales as tabs are added.
// `defi: true` tabs are hidden when VITE_HIDE_DEFI_TABS is set.
const TAB_GROUPS = [
  { label: 'Volume', tabs: [
    { id: 'overall',   label: 'Total USDG Activity' },
    { id: 'dashboard', label: 'CEX Dashboard' },
    { id: 'weekly',    label: 'Weekly Trends' },
    { id: 'monthly',   label: 'Monthly Trends' },
    { id: 'depth',     label: 'Depth & Spread' },
  ] },
  { label: 'DeFi', tabs: [
    { id: 'totaldefi', label: 'Total DeFi', defi: true },
    { id: 'dex',       label: 'DEX Dashboard', defi: true },
    { id: 'vaults',    label: 'Vaults & Lending' },
    { id: 'aave-usdg', label: 'USDG AAVE v4' },
  ] },
  { label: 'PAXG', tabs: [
    { id: 'paxg-supply', label: 'PAXG Supply' },
    { id: 'paxg-volume', label: 'PAXG Volume' },
    { id: 'binance-paxg', label: 'Binance PAXG' },
  ] },
  { label: 'More', tabs: [
    { id: 'pyusd',   label: 'PYUSD' },
    { id: 'fusebox', label: 'Fuse Box' },
  ] },
];

function GroupedNav({ activeTab, navigateTo, hideDefiTabs }) {
  const [openGroup, setOpenGroup] = useState(null);

  useEffect(() => {
    if (!openGroup) return;
    const close = () => setOpenGroup(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openGroup]);

  const groups = TAB_GROUPS
    .map(g => ({ ...g, tabs: g.tabs.filter(t => !(t.defi && hideDefiTabs)) }))
    .filter(g => g.tabs.length);

  return (
    <nav className="tab-navigation">
      {groups.map(group => {
        const activeInGroup = group.tabs.some(t => t.id === activeTab);
        const isOpen = openGroup === group.label;
        return (
          <div key={group.label} className="nav-group" onClick={e => e.stopPropagation()}>
            <button
              className={`tab-btn nav-group-btn ${activeInGroup ? 'active' : ''}`}
              onClick={() => setOpenGroup(isOpen ? null : group.label)}
            >
              {group.label}
              <span className="nav-caret">{isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen && (
              <div className="nav-dropdown">
                {group.tabs.map(t => (
                  <button
                    key={t.id}
                    className={`nav-dropdown-item ${t.id === activeTab ? 'active' : ''}`}
                    onClick={() => { navigateTo(t.id); setOpenGroup(null); }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function MaintenancePage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0f1419', color: '#e7e9ea', textAlign: 'center', padding: 40
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🔧</div>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Down for Maintenance</h1>
      <p style={{ fontSize: 18, color: '#8899a6', maxWidth: 480 }}>
        The USDG Trading Volume Tracker is temporarily offline for upgrades.
        We'll be back shortly.
      </p>
    </div>
  );
}

export default function App() {
  if (import.meta.env.VITE_MAINTENANCE_MODE === 'true') {
    return <MaintenancePage />;
  }

  const hideDefiTabs = import.meta.env.VITE_HIDE_DEFI_TABS === 'true';

  const VALID_TABS = ['overall','dashboard','weekly','monthly','depth','totaldefi','dex','vaults','fusebox','pyusd','paxg-supply','paxg-volume','binance-paxg','aave-usdg'];
  const pathToTab = (path) => {
    const slug = path.replace(/^\//, '') || 'overall';
    return VALID_TABS.includes(slug) ? slug : 'overall';
  };

  const [activeTab, setActiveTab] = useState(() => pathToTab(window.location.pathname));

  const navigateTo = (tab) => {
    setActiveTab(tab);
    const path = tab === 'overall' ? '/' : `/${tab}`;
    window.history.pushState(null, '', path);
  };
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
      <GroupedNav activeTab={activeTab} navigateTo={navigateTo} hideDefiTabs={hideDefiTabs} />

      {activeTab === 'weekly' ? (
        <WeeklyTrends />
      ) : activeTab === 'monthly' ? (
        <MonthlyTrends />
      ) : activeTab === 'depth' ? (
        <DepthSpreadTable />
      ) : activeTab === 'overall' ? (
        <OverallVolumeChart />
      ) : activeTab === 'totaldefi' ? (
        <TotalDefiTab />
      ) : activeTab === 'dex' ? (
        <DefiPoolsTable />
      ) : activeTab === 'vaults' ? (
        <VaultsLendingTable />
      ) : activeTab === 'fusebox' ? (
        <FuseBox />
      ) : activeTab === 'pyusd' ? (
        <PyusdTab />
      ) : activeTab === 'paxg-supply' ? (
        <PaxgSupplyTab />
      ) : activeTab === 'paxg-volume' ? (
        <PaxgVolumeTab />
      ) : activeTab === 'binance-paxg' ? (
        <BinancePaxgTab />
      ) : activeTab === 'aave-usdg' ? (
        <AaveUsdgTab />
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
