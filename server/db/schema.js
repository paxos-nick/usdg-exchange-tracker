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

  CREATE TABLE IF NOT EXISTS paxg_supply_history (
    id             SERIAL PRIMARY KEY,
    supply_date    DATE NOT NULL UNIQUE,
    supply         NUMERIC(20,8) NOT NULL,
    block_number   BIGINT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_paxg_supply_date ON paxg_supply_history (supply_date DESC);

  CREATE TABLE IF NOT EXISTS metrics_log (
    id           SERIAL PRIMARY KEY,
    logged_at    TIMESTAMPTZ NOT NULL,
    metrics      JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_log_date ON metrics_log (DATE(logged_at AT TIME ZONE 'UTC'));
  CREATE INDEX IF NOT EXISTS idx_metrics_log_at ON metrics_log (logged_at DESC);

  CREATE TABLE IF NOT EXISTS depth_snapshots (
    id          SERIAL PRIMARY KEY,
    snapped_at  TIMESTAMPTZ NOT NULL,
    exchange    VARCHAR(40) NOT NULL,
    pair        VARCHAR(40) NOT NULL,
    pair_type   VARCHAR(20) NOT NULL,
    mid_price   NUMERIC(20,8),
    best_bid    NUMERIC(20,8),
    best_ask    NUMERIC(20,8),
    spread_bps  NUMERIC(10,4),
    bps_levels  INTEGER[],
    bid_depth   JSONB,
    ask_depth   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_depth_snapped_at
    ON depth_snapshots (snapped_at DESC);
  CREATE INDEX IF NOT EXISTS idx_depth_exchange_pair_time
    ON depth_snapshots (exchange, pair, snapped_at DESC);

  CREATE TABLE IF NOT EXISTS aave_usdg_history (
    id              SERIAL PRIMARY KEY,
    snapshot_date   DATE NOT NULL UNIQUE,
    total_debt      NUMERIC(24,6) NOT NULL,
    borrow_apy      NUMERIC(10,6) NOT NULL,
    daily_interest  NUMERIC(20,6) NOT NULL,
    block_number    BIGINT NOT NULL,
    spoke_breakdown JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_aave_usdg_date ON aave_usdg_history (snapshot_date DESC);

  ALTER TABLE aave_usdg_history
    ADD COLUMN IF NOT EXISTS merkl_daily_rewards NUMERIC(20,6);

  ALTER TABLE aave_usdg_history
    ADD COLUMN IF NOT EXISTS total_supply NUMERIC(24,6);

  ALTER TABLE aave_usdg_history
    ADD COLUMN IF NOT EXISTS supply_apy NUMERIC(10,6);
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
