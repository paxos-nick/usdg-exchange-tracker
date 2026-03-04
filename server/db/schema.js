const pool = require('./pool');

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS snapshots (
    id            SERIAL PRIMARY KEY,
    taken_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_type VARCHAR(20) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_taken_at ON snapshots (taken_at DESC);

  CREATE TABLE IF NOT EXISTS dex_pool_snapshots (
    id              SERIAL PRIMARY KEY,
    snapshot_id     INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    address         VARCHAR(66) NOT NULL,
    name            VARCHAR(60) NOT NULL,
    pool_type       VARCHAR(20) NOT NULL,
    chain           VARCHAR(20) NOT NULL,
    venue           VARCHAR(20) NOT NULL,
    tvl_usd         NUMERIC(20,2),
    usdg_balance    NUMERIC(20,6),
    yield_24h       NUMERIC(20,12),
    volume_24h      NUMERIC(20,2),
    fees_24h        NUMERIC(20,6),
    volume_7d       NUMERIC(20,2),
    fees_7d         NUMERIC(20,6),
    volume_30d      NUMERIC(20,2),
    fees_30d        NUMERIC(20,6),
    price           NUMERIC(20,12),
    token_a_symbol  VARCHAR(20),
    token_a_balance NUMERIC(30,8),
    token_b_symbol  VARCHAR(20),
    token_b_balance NUMERIC(30,8),
    fee_rate        NUMERIC(10,6),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_dex_pool_snapshot ON dex_pool_snapshots (snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_dex_pool_address_time ON dex_pool_snapshots (address, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_dex_pool_chain ON dex_pool_snapshots (chain, created_at DESC);

  CREATE TABLE IF NOT EXISTS vault_snapshots (
    id                      SERIAL PRIMARY KEY,
    snapshot_id             INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    address                 VARCHAR(66) NOT NULL,
    name                    VARCHAR(60) NOT NULL,
    tvl_usd                 NUMERIC(20,2),
    share_price             NUMERIC(20,12),
    token_price             NUMERIC(20,12),
    holders                 INTEGER,
    apy_current             NUMERIC(10,6),
    apy_24h                 NUMERIC(10,6),
    apy_7d                  NUMERIC(10,6),
    apy_30d                 NUMERIC(10,6),
    apy_90d                 NUMERIC(10,6),
    cumulative_interest_usd NUMERIC(20,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_vault_snapshot ON vault_snapshots (snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_vault_address_time ON vault_snapshots (address, created_at DESC);

  CREATE TABLE IF NOT EXISTS lending_snapshots (
    id                      SERIAL PRIMARY KEY,
    snapshot_id             INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    name                    VARCHAR(60) NOT NULL,
    chain                   VARCHAR(20) NOT NULL,
    venue                   VARCHAR(20) NOT NULL,
    deposit_tvl             NUMERIC(20,2),
    total_borrows           NUMERIC(20,2),
    total_liquidity         NUMERIC(20,2),
    utilization             NUMERIC(10,4),
    supply_apy              NUMERIC(10,8),
    borrow_apy              NUMERIC(10,8),
    loan_to_value           NUMERIC(10,6),
    liquidation_threshold   NUMERIC(10,6),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_lending_snapshot ON lending_snapshots (snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_lending_venue_time ON lending_snapshots (venue, created_at DESC);
`;

async function setupDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SCHEMA_SQL);
    await client.query('COMMIT');
    console.log('[DB] Schema setup complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Schema setup failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { setupDatabase };
