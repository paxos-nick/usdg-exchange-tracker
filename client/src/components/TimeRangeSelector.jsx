const TIME_RANGES = [
  { id: '30d', label: 'Last 30 Days', interval: 'daily' },
  { id: '1y', label: 'Last Year', interval: 'monthly' }
];

export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="time-range-selector">
      {TIME_RANGES.map(range => (
        <button
          key={range.id}
          className={`time-range-btn ${value === range.id ? 'active' : ''}`}
          onClick={() => onChange(range.id)}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

export { TIME_RANGES };
