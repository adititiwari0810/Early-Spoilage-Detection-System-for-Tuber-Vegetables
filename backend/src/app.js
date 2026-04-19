import express from 'express';
import cors from 'cors';
import sensorRoutes from './routes/sensors.js';
import nodeRoutes from './routes/nodes.js';
import alertRoutes from './routes/alerts.js';
import logger from './utils/logger.js';

const app = express();

// ───── Middleware ─────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
}));

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ───── Routes ─────
app.use('/api/sensors', sensorRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/alerts', alertRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
