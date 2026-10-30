// Persists per-exchange daily USDG volume. GREATEST() keeps the larger value so a partial
// fetch (a failed pair, or an in-progress day) can never overwrite a better stored total.
async function persistExchangeVolume(db, exchange, dailyVolume) {
  const rows = (dailyVolume || []).filter(d => d.date && Number.isFinite(d.volume));
  if (!rows.length) return 0;
  await db.query(
    `INSERT INTO cex_daily_volume (snapshot_date, exchange, volume)
     SELECT t.d, $1, t.v FROM unnest($2::date[], $3::numeric[]) AS t(d, v)
     ON CONFLICT (snapshot_date, exchange)
     DO UPDATE SET volume = GREATEST(cex_daily_volume.volume, EXCLUDED.volume)`,
    [exchange, rows.map(r => r.date), rows.map(r => r.volume)]
  );
  return rows.length;
}

module.exports = { persistExchangeVolume };
