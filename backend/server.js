import 'dotenv/config';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './src/app.js';
import mqttClient from './src/config/mqtt.js';
import { initPostgres, writeSensorData } from './src/config/db.js';
import { enrichReading } from './src/services/analysis.js';
import { evaluateReading } from './src/services/alertEngine.js';
import { startBatchJob, updateLastSeen, upsertNode } from './src/services/batchJob.js';
import { initSocket, emitSensorUpdate, emitAlert } from './src/socket/index.js';
import logger from './src/utils/logger.js';

const PORT = parseInt(process.env.PORT, 10) || 4000;

const start = async () => {
  try {
    // ───── 1. Initialize PostgreSQL tables ─────
    logger.info('Initializing PostgreSQL...');
    await initPostgres();

    // ───── 2. Create HTTP server ─────
    const server = http.createServer(app);

    // ───── 3. Initialize Socket.IO ─────
    const io = new SocketServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });
    initSocket(io);

    // ───── 4. Connect MQTT ─────
    logger.info('Connecting to MQTT broker...');
    await mqttClient.connect();

    // ───── 5. MQTT → Analysis → DB → Socket.IO pipeline ─────
    mqttClient.on('sensor_data', async (data) => {
      try {
        // Enrich with analysis
        const enrichedData = enrichReading(data);

        // Write to InfluxDB (non-blocking, fire and forget with retry)
        writeSensorData(enrichedData).catch((err) => {
          logger.error(`InfluxDB write pipeline error: ${err.message}`);
        });

        // Upsert node in PostgreSQL
        await upsertNode(data.node_id);
        updateLastSeen(data.node_id);

        // Emit via Socket.IO
        emitSensorUpdate(io, enrichedData);

        // Evaluate alert thresholds
        await evaluateReading(enrichedData, (alert) => {
          emitAlert(io, alert);
        });

        logger.debug(`Pipeline complete for ${data.node_id}`);
      } catch (err) {
        logger.error(`Pipeline error: ${err.message}`);
      }
    });

    // ───── 6. Start batch job ─────
    startBatchJob(io);

    // ───── 7. Start HTTP server ─────
    server.listen(PORT, () => {
      logger.info(`🥔 Potato Spoilage Detection System running on port ${PORT}`);
      logger.info(`   REST API: http://localhost:${PORT}/api`);
      logger.info(`   Socket.IO: ws://localhost:${PORT}`);
      logger.info(`   Health: http://localhost:${PORT}/api/health`);
    });

    // ───── Graceful shutdown ─────
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down...`);
      await mqttClient.disconnect();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    logger.error(`Fatal startup error: ${err.message}`, { stack: err.stack });
    process.exit(1);
  }
};

start();
