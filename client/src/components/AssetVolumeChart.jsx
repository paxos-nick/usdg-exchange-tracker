import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import TimeRangeSelector from './TimeRangeSelector';
import AssetSelector from './AssetSelector';
import { useAssetVolumeData } from '../hooks/useVolumeData';

// Color palette for exchanges
const EXCHANGE_COLORS = {
  kraken: '#7c3aed',
  bullish: '#00d4aa',
  gate: '#f59e0b',
  kucoin: '#3b82f6',
  bitmart: '#ec4899',
  okx: '#10b981'
};

const EXCHANGE_NAMES = {
  kraken: 'Kraken',
  bullish: 'Bullish',
  gate: 'Gate.io',
  kucoin: 'Kucoin',
  bitmart: 'Bitmart',
  okx: 'OKX'
};

function formatVolume(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatTooltipValue(value) {
  return `$${formatVolume(value)}`;
}

function formatDate(dateStr, timeRange) {
  const date = new Date(dateStr);
  if (timeRange === '1y') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildChartData(volumeByAsset, selectedAsset, selectedExchanges, timeRange) {
  if (!volumeByAsset || !selectedAsset || !volumeByAsset[selectedAsset]) {
    return [];
  }

  const assetData = volumeByAsset[selectedAsset];
  const dateMap = new Map();

  // Collect all dates from selected exchanges
  for (const exchange of selectedExchanges) {
    const exchangeData = assetData[exchange] || [];
    for (const day of exchangeData) {
      if (!dateMap.has(day.date)) {
        dateMap.set(day.date, { date: day.date });
      }
      dateMap.get(day.date)[exchange] = day.volume;
    }
  }

  let data = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Filter by time range
  const now = new Date();
  switch (timeRange) {
    case '30d': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      data = data.filter(d => new Date(d.date) >= thirtyDaysAgo);
      break;
    }
    case '1y': {
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      data = data.filter(d => new Date(d.date) >= oneYearAgo);
      // Aggregate to monthly
      const monthlyMap = new Map();
      data.forEach(d => {
        const monthKey = d.date.substring(0, 7);
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { date: `${monthKey}-01` });
          selectedExchanges.forEach(ex => {
            monthlyMap.get(monthKey)[ex] = 0;
          });
        }
        selectedExchanges.forEach(ex => {
          monthlyMap.get(monthKey)[ex] += (d[ex] || 0);
        });
      });
      data = Array.from(monthlyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      break;
    }
    default:
      data = data.slice(-30);
  }

  return data;
}

export default function AssetVolumeChart() {
  const { data, loading, error } = useAssetVolumeData();
  const [timeRange, setTimeRange] = useState('30d');
  const [selectedAsset, setSelectedAsset] = useState('');
  const [selectedExchanges, setSelectedExchanges] = useState([]);

  // Initialize selected asset when data loads
  useEffect(() => {
    if (data?.assets?.length > 0 && !selectedAsset) {
      // Default to BTC if available, otherwise first asset
      const defaultAsset = data.assets.includes('BTC') ? 'BTC' : data.assets[0];
      setSelectedAsset(defaultAsset);
    }
  }, [data?.assets, selectedAsset]);

  // Update available exchanges when asset changes
  useEffect(() => {
    if (data?.volumeByAsset && selectedAsset && data.volumeByAsset[selectedAsset]) {
      const availableExchanges = Object.keys(data.volumeByAsset[selectedAsset]);
      setSelectedExchanges(availableExchanges);
    }
  }, [data?.volumeByAsset, selectedAsset]);

  const handleToggleExchange = (exchange) => {
    if (selectedExchanges.includes(exchange)) {
      setSelectedExchanges(selectedExchanges.filter(e => e !== exchange));
    } else {
      setSelectedExchanges([...selectedExchanges, exchange]);
    }
  };

  const handleSelectAll = () => {
    if (data?.volumeByAsset && selectedAsset && data.volumeByAsset[selectedAsset]) {
      const availableExchanges = Object.keys(data.volumeByAsset[selectedAsset]);
      if (selectedExchanges.length === availableExchanges.length) {
        setSelectedExchanges([]);
      } else {
        setSelectedExchanges(availableExchanges);
      }
    }
  };

  if (loading) {
    return (
      <section className="exchange-section">
        <div className="section-header">
          <h2>Trading Volume by Asset</h2>
        </div>
        <div className="loading">Loading asset data...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="exchange-section">
        <div className="section-header">
          <h2>Trading Volume by Asset</h2>
        </div>
        <div className="error">Error: {error}</div>
      </section>
    );
  }

  const chartData = buildChartData(data?.volumeByAsset, selectedAsset, selectedExchanges, timeRange);
  const formattedData = chartData.map(d => ({
    ...d,
    displayDate: formatDate(d.date, timeRange)
  }));

  // Get available exchanges for this asset
  const availableExchanges = data?.volumeByAsset?.[selectedAsset]
    ? Object.keys(data.volumeByAsset[selectedAsset])
    : [];

  // Sort exchanges by total volume (descending) so largest is at bottom of stack
  const sortedExchanges = [...selectedExchanges].sort((a, b) => {
    const totalA = chartData.reduce((sum, d) => sum + (d[a] || 0), 0);
    const totalB = chartData.reduce((sum, d) => sum + (d[b] || 0), 0);
    return totalB - totalA;
  });

  return (
    <section className="exchange-section">
      <div className="section-header">
        <h2>Trading Volume by Asset: {selectedAsset}/USDG</h2>
        <div className="section-controls">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <AssetSelector
            assets={data?.assets || []}
            value={selectedAsset}
            onChange={setSelectedAsset}
          />
        </div>
      </div>

      {selectedExchanges.length === 0 ? (
        <div className="chart-container">
          <div className="loading">Select at least one exchange to view trading volume</div>
        </div>
      ) : formattedData.length === 0 ? (
        <div className="chart-container">
          <div className="loading">No trading volume data available for {selectedAsset}/USDG</div>
        </div>
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formattedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2f3542" />
              <XAxis
                dataKey="displayDate"
                stroke="#71767b"
                tick={{ fill: '#71767b', fontSize: 11 }}
                interval="preserveStartEnd"
                tickMargin={10}
              />
              <YAxis
                stroke="#71767b"
                tick={{ fill: '#71767b', fontSize: 11 }}
                tickFormatter={formatVolume}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1f2e',
                  border: '1px solid #2f3542',
                  borderRadius: '8px',
                  color: '#e7e9ea'
                }}
                labelStyle={{ color: '#71767b' }}
                formatter={formatTooltipValue}
                labelFormatter={(label) => `Date: ${label}`}
              />
              {sortedExchanges.length > 1 && (
                <Legend
                  wrapperStyle={{ color: '#e7e9ea' }}
                  iconType="square"
                  formatter={(value) => EXCHANGE_NAMES[value] || value}
                />
              )}
              {sortedExchanges.map((exchange, index) => (
                <Bar
                  key={exchange}
                  dataKey={exchange}
                  stackId="volume"
                  fill={EXCHANGE_COLORS[exchange] || '#888'}
                  radius={index === sortedExchanges.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  name={exchange}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {availableExchanges.length > 0 && (
        <div className="exchange-toggle-section">
          <div className="pair-selector-header">
            <span className="pair-selector-label">
              Exchanges with {selectedAsset}/USDG volume ({availableExchanges.length}):
            </span>
            <button className="select-all-btn" onClick={handleSelectAll}>
              {selectedExchanges.length === availableExchanges.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="pair-chips">
            {availableExchanges.map(exchange => (
              <button
                key={exchange}
                className={`pair-chip ${selectedExchanges.includes(exchange) ? 'selected' : ''}`}
                onClick={() => handleToggleExchange(exchange)}
                style={{
                  borderColor: selectedExchanges.includes(exchange) ? EXCHANGE_COLORS[exchange] : undefined,
                  color: selectedExchanges.includes(exchange) ? EXCHANGE_COLORS[exchange] : undefined,
                  backgroundColor: selectedExchanges.includes(exchange) ? `${EXCHANGE_COLORS[exchange]}20` : undefined
                }}
              >
                {EXCHANGE_NAMES[exchange] || exchange}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedExchanges.length > 1 && formattedData.length > 0 && (
        <div className="chart-note">
          Showing stacked trading volume for {selectedAsset}/USDG across {selectedExchanges.length} exchanges. Hover over bars to see individual exchange volumes.
        </div>
      )}
    </section>
  );
}
