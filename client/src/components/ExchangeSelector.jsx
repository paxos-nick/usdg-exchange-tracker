const EXCHANGES = [
  { id: 'kraken', name: 'Kraken' },
  { id: 'bullish', name: 'Bullish' },
  { id: 'gate', name: 'Gate.io' },
  { id: 'kucoin', name: 'Kucoin' },
  { id: 'bitmart', name: 'Bitmart' },
  { id: 'okx', name: 'OKX' }
];

export default function ExchangeSelector({ value, onChange }) {
  return (
    <div className="exchange-selector">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {EXCHANGES.map(exchange => (
          <option key={exchange.id} value={exchange.id}>
            {exchange.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export { EXCHANGES };
