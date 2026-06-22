/**
 * Migrate weekly-metrics.jsonl entries into the metrics_log Postgres table.
 * Safe to re-run — uses ON CONFLICT DO UPDATE so duplicates are overwritten.
 *
 * Usage: DATABASE_URL=<url> node scripts/migrateMetricsToPostgres.js
 */

const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

const LOG_FILE = path.join(__dirname, '../logs/weekly-metrics.jsonl');

async function run() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('[Migrate] No JSONL file found at', LOG_FILE);
    await pool.end();
    return;
  }

  const lines = fs.readFileSync(LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch (e) {}
  }
  entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  console.log(`[Migrate] Found ${entries.length} entries in JSONL file`);

  let inserted = 0;
  let errors = 0;

  for (const entry of entries) {
    try {
      await pool.query(
        `INSERT INTO metrics_log (logged_at, metrics)
         VALUES ($1, $2)
         ON CONFLICT (DATE(logged_at AT TIME ZONE 'UTC'))
         DO UPDATE SET metrics = EXCLUDED.metrics, logged_at = EXCLUDED.logged_at`,
        [new Date(entry.timestamp), JSON.stringify(entry.metrics)]
      );
      inserted++;
    } catch (err) {
      errors++;
      console.error(`[Migrate] Error for ${entry.timestamp}:`, err.message);
    }
  }

  console.log(`[Migrate] Done. ${inserted} inserted/updated, ${errors} errors.`);
  await pool.end();
}

run().catch(err => { console.error('[Migrate] Fatal:', err); process.exit(1); });
