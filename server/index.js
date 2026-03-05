const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const metricsRoutes = require('./routes/metrics');
const depthRoutes = require('./routes/depth');
const defiRoutes = require('./routes/defi');
const { startScheduler } = require('./jobs/dailyMetricsLogger');
const { startScheduler: startHourlySnapshots } = require('./jobs/hourlySnapshot');
const { setupDatabase } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/depth', depthRoutes);
app.use('/api/defi', defiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  // Initialize database schema (non-fatal — CEX endpoints work without DB)
  try {
    await setupDatabase();
  } catch (err) {
    console.error('[DB] Database unavailable, DeFi snapshots disabled:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API endpoints:`);
    console.log(`  GET /api/exchanges`);
    console.log(`  GET /api/volume/:exchange`);
    console.log(`  GET /api/aggregated`);
    console.log(`  GET /api/metrics/weekly`);

    // Start the daily metrics scheduler (CEX)
    startScheduler();

    // Start hourly DeFi snapshot scheduler
    startHourlySnapshots();
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
