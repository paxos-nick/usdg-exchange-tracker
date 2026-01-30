# USDG Exchange Volume Dashboard - Implementation Plan

## Overview
Build a Node.js + React dashboard to track USDG stablecoin trading volume across Bullish and Kraken exchanges.

## Features
- **Aggregated dashboard** (top): Total USDG volume across all exchanges and pairs
- **Exchange selector**: Dropdown to switch between Bullish and Kraken
- **Daily volume bar chart**: Historical daily volume for selected exchange
- **Auto-refresh**: Poll for updates every 5 minutes

---

## Project Structure

```
exchange-tracker/
├── package.json
├── server/
│   ├── index.js              # Express server entry point
│   ├── routes/
│   │   └── api.js            # API routes
│   └── services/
│       ├── kraken.js         # Kraken API client
│       └── bullish.js        # Bullish API client
├── client/
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx           # Main app component
│   │   ├── components/
│   │   │   ├── Dashboard.jsx      # Aggregated stats
│   │   │   ├── ExchangeSelector.jsx
│   │   │   └── VolumeChart.jsx    # Bar chart component
│   │   ├── hooks/
│   │   │   └── useVolumeData.js   # Data fetching hook
│   │   └── index.jsx
│   └── public/
│       └── index.html
└── README.md
```

---

## API Details

### Kraken (Public, no auth)
- **Get pairs:** `GET https://api.kraken.com/0/public/AssetPairs`
  - Filter response for pairs containing "USDG"
- **Get OHLCV:** `GET https://api.kraken.com/0/public/OHLC?pair={pair}&interval=1440`
  - `interval=1440` = daily candles
  - Response array: `[timestamp, open, high, low, close, vwap, volume, count]`
  - Max 720 entries (days) per request
  - Rate limit: 1 request/second

### Bullish (Public, no auth)
- **Get markets:** `GET https://api.exchange.bullish.com/trading-api/v1/markets`
  - Filter for USDG pairs
- **Get candles:** `GET https://api.exchange.bullish.com/trading-api/v1/markets/{symbol}/candle`
  - Parameters:
    - `createdAtDatetime[gte]` - Start time (ISO 8601 format, e.g., `2025-05-20T01:01:01.000Z`)
    - `createdAtDatetime[lte]` - End time (ISO 8601 format)
    - `timeBucket` - Interval (e.g., `1m`, `1h`, `1d`)
  - Example:
    ```
    curl -X GET "https://api.exchange.bullish.com/trading-api/v1/markets/BTCUSDC/candle?createdAtDatetime%5Bgte%5D=2025-05-20T01%3A01%3A01.000Z&createdAtDatetime%5Blte%5D=2025-05-20T01%3A01%3A01.000Z&timeBucket=1m" \
     -H "accept: application/json"
    ```

---

## Backend API Endpoints

### `GET /api/exchanges`
Returns list of supported exchanges: `["kraken", "bullish"]`

### `GET /api/volume/:exchange`
Returns daily volume data for specified exchange.

**Response:**
```json
{
  "exchange": "kraken",
  "pairs": ["USDG/USD", "BTC/USDG", ...],
  "dailyVolume": [
    { "date": "2024-01-15", "volume": 1250000.50 },
    { "date": "2024-01-16", "volume": 980000.25 }
  ]
}
```

### `GET /api/volume/aggregated`
Returns combined daily volume across all exchanges.

**Response:**
```json
{
  "dailyVolume": [
    { "date": "2024-01-15", "volume": 2500000.75, "byExchange": { "kraken": 1250000.50, "bullish": 1250000.25 } }
  ],
  "totalVolume": 45000000.00,
  "exchanges": ["kraken", "bullish"]
}
```

---

## Backend Implementation

### server/services/kraken.js
1. `getUSDGPairs()` - Fetch AssetPairs, filter for USDG
2. `getDailyVolume(pair)` - Fetch OHLC with interval=1440
3. `getAggregatedVolume()` - Loop through pairs, sum volumes per day
4. Implement rate limiting (1 req/sec delay between calls)

### server/services/bullish.js
1. `getUSDGPairs()` - Fetch markets, filter for USDG
2. `getDailyVolume(symbol, start, end)` - Fetch candles with `timeBucket=1d`
3. `getAggregatedVolume()` - Loop through pairs, sum volumes per day

### server/routes/api.js
- Express router with the three endpoints above
- Add caching layer (5-minute TTL) to avoid excessive API calls

---

## Frontend Components

### App.jsx
- Main layout with header
- Renders Dashboard and exchange-specific chart

### Dashboard.jsx
- Shows total aggregated volume (all exchanges)
- Mini summary stats (total volume, number of pairs, etc.)

### ExchangeSelector.jsx
- Dropdown: Kraken | Bullish
- Controlled component, lifts state to App

### VolumeChart.jsx
- Bar chart using **Recharts** library
- X-axis: dates
- Y-axis: volume (formatted with K/M suffixes)
- Props: `data`, `title`

### hooks/useVolumeData.js
- Custom hook for fetching volume data
- Handles loading/error states
- Implements auto-refresh with `setInterval` (5 min)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Frontend | React 18 + Vite |
| Charts | Recharts |
| HTTP Client | Axios (backend), fetch (frontend) |
| Styling | CSS Modules or Tailwind (simple) |

---

## Implementation Order

1. **Initialize project** - Set up monorepo structure with server/ and client/
2. **Backend: Kraken service** - Implement pair discovery and volume fetching
3. **Backend: Bullish service** - Implement pair discovery and volume fetching
4. **Backend: API routes** - Create Express endpoints with caching
5. **Frontend: Basic setup** - Vite + React scaffold
6. **Frontend: VolumeChart** - Recharts bar chart component
7. **Frontend: ExchangeSelector** - Dropdown component
8. **Frontend: Dashboard** - Aggregated stats display
9. **Frontend: Integration** - Wire up data fetching with auto-refresh
10. **Testing & polish** - Manual testing, error handling

---

## Verification

1. Start backend: `cd server && npm start`
2. Start frontend: `cd client && npm run dev`
3. Verify Kraken data loads in dropdown selection
4. Verify Bullish data loads in dropdown selection
5. Verify aggregated dashboard shows combined data
6. Wait 5 minutes to confirm auto-refresh works
7. Check browser console for any errors

---

## Configuration

- **Time range:** All available historical data
- **API access:** Public endpoints only (no API keys required)
- **Frontend framework:** React
- **Refresh interval:** Auto-refresh every 5 minutes
