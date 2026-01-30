export default function PairSelector({ pairs, selectedPairs, onChange }) {
  const handleToggle = (pair) => {
    if (selectedPairs.includes(pair)) {
      onChange(selectedPairs.filter(p => p !== pair));
    } else {
      onChange([...selectedPairs, pair]);
    }
  };

  const handleSelectAll = () => {
    if (selectedPairs.length === pairs.length) {
      onChange([]);
    } else {
      onChange([...pairs]);
    }
  };

  if (!pairs || pairs.length === 0) {
    return (
      <div className="pair-selector">
        <p className="no-pairs">No pairs available</p>
      </div>
    );
  }

  return (
    <div className="pair-selector">
      <div className="pair-selector-header">
        <span className="pair-selector-label">Select pairs to compare:</span>
        <button
          className="select-all-btn"
          onClick={handleSelectAll}
        >
          {selectedPairs.length === pairs.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="pair-chips">
        {pairs.map(pair => (
          <button
            key={pair}
            className={`pair-chip ${selectedPairs.includes(pair) ? 'selected' : ''}`}
            onClick={() => handleToggle(pair)}
          >
            {pair}
          </button>
        ))}
      </div>
    </div>
  );
}
