export default function AssetSelector({ assets, value, onChange }) {
  if (!assets || assets.length === 0) {
    return null;
  }

  return (
    <div className="exchange-selector">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {assets.map(asset => (
          <option key={asset} value={asset}>
            {asset}/USDG
          </option>
        ))}
      </select>
    </div>
  );
}
