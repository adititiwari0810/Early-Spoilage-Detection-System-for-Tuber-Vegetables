import { InfluxDB, Point } from '@influxdata/influxdb-client';
import pg from 'pg';
import logger from '../utils/logger.js';

const { Pool } = pg;

// ───── InfluxDB Client ─────
const influxDB = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});

const influxWriteApi = influxDB.getWriteApi(
  process.env.INFLUX_ORG,
  process.env.INFLUX_BUCKET,
  's' // second precision
);

const influxQueryApi = influxDB.getQueryApi(process.env.INFLUX_ORG);

/**
 * Write a sensor reading to InfluxDB with single retry on failure.
 *
 * Fields written:
 *   - temperature (float)    — DHT11
 *   - humidity (float)       — DHT11
 *   - co2_ppm (float)        — MG811
 *   - air_alert (int)        — MQ-135 digital (0 or 1)
 *   - ethanol_alert (int)    — MQ-3 digital (0 or 1)
 *   - ambient_temp_est (float) — computed estimate
 *   - ambient_hum_est (float)  — computed estimate
 *   - spoilage_score, EMAs, Z-scores (if enriched)
 */
const writeSensorData = async (data) => {
  const point = new Point('sensor_reading')
    .tag('node_id', data.node_id)
    .floatField('temperature', data.temperature)
    .floatField('humidity', data.humidity)
    .floatField('co2_ppm', data.co2_ppm)
    .intField('air_alert', data.air_alert || 0)
    .intField('ethanol_alert', data.ethanol_alert || 0)
    .timestamp(new Date(data.timestamp * 1000));

  // Optional ambient estimates
  if (data.ambient_temp_est != null) {
    point.floatField('ambient_temp_est', data.ambient_temp_est);
  }
  if (data.ambient_hum_est != null) {
    point.floatField('ambient_hum_est', data.ambient_hum_est);
  }

  // Add enriched fields if present
  if (data.enriched) {
    const e = data.enriched;
    if (e.spoilage_score !== undefined) point.floatField('spoilage_score', e.spoilage_score);
    if (e.temp_ema !== undefined) point.floatField('temp_ema', e.temp_ema);
    if (e.hum_ema !== undefined) point.floatField('hum_ema', e.hum_ema);
    if (e.co2_ema !== undefined) point.floatField('co2_ema', e.co2_ema);
    if (e.temp_zscore !== undefined) point.floatField('temp_zscore', e.temp_zscore);
    if (e.anomaly_flag !== undefined) point.booleanField('anomaly_flag', e.anomaly_flag);
  }

  try {
    influxWriteApi.writePoint(point);
    await influxWriteApi.flush();
  } catch (err) {
    logger.warn(`InfluxDB write failed, retrying once: ${err.message}`);
    try {
      influxWriteApi.writePoint(point);
      await influxWriteApi.flush();
    } catch (retryErr) {
      logger.error(`InfluxDB write retry failed: ${retryErr.message}`);
      throw retryErr;
    }
  }
};

/**
 * Query sensor data from InfluxDB for a given node and time range.
 */
const querySensorData = async (nodeId, range = '1h') => {
  const fluxQuery = `
    from(bucket: "${process.env.INFLUX_BUCKET}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._measurement == "sensor_reading")
      |> filter(fn: (r) => r.node_id == "${nodeId}")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;

  const results = [];
  return new Promise((resolve, reject) => {
    influxQueryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        const obj = tableMeta.toObject(row);
        results.push({
          timestamp: obj._time,
          temperature: obj.temperature,
          humidity: obj.humidity,
          co2_ppm: obj.co2_ppm,
          air_alert: obj.air_alert,
          ethanol_alert: obj.ethanol_alert,
          ambient_temp_est: obj.ambient_temp_est,
          ambient_hum_est: obj.ambient_hum_est,
          spoilage_score: obj.spoilage_score,
          temp_ema: obj.temp_ema,
          hum_ema: obj.hum_ema,
          co2_ema: obj.co2_ema,
          temp_zscore: obj.temp_zscore,
          anomaly_flag: obj.anomaly_flag,
        });
      },
      error(err) {
        logger.error(`InfluxDB query error: ${err.message}`);
        reject(err);
      },
      complete() {
        resolve(results);
      },
    });
  });
};

// ───── PostgreSQL Pool ─────
const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT, 10),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pgPool.on('error', (err) => {
  logger.error(`PostgreSQL pool error: ${err.message}`);
});

/**
 * Initialize PostgreSQL tables.
 */
const initPostgres = async () => {
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nodes (
        id SERIAL PRIMARY KEY,
        node_id VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(128),
        location VARCHAR(256),
        status VARCHAR(16) DEFAULT 'offline',
        last_seen TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        node_id VARCHAR(64) NOT NULL,
        metric VARCHAR(32) NOT NULL,
        level VARCHAR(16) NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        threshold DOUBLE PRECISION NOT NULL,
        message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS spoilage_scores (
        id SERIAL PRIMARY KEY,
        node_id VARCHAR(64) NOT NULL,
        score DOUBLE PRECISION NOT NULL,
        risk_level VARCHAR(16) NOT NULL,
        computed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_node_id ON alerts(node_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
      CREATE INDEX IF NOT EXISTS idx_spoilage_node_id ON spoilage_scores(node_id);
    `);

    logger.info('PostgreSQL tables initialized');
  } finally {
    client.release();
  }
};

export {
  influxDB,
  influxWriteApi,
  influxQueryApi,
  writeSensorData,
  querySensorData,
  pgPool,
  initPostgres,
};
