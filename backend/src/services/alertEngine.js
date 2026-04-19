import { pgPool } from '../config/db.js';
import logger from '../utils/logger.js';

/**
 * Alert cooldown map: `${nodeId}:${metric}:${level}` → last alert timestamp.
 * Prevents alert spam — 5 minute cooldown per node per metric per level.
 */
const alertCooldowns = new Map();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Threshold definitions loaded from environment variables.
 */
const getThresholds = () => ({
  temperature: {
    warning: parseFloat(process.env.ALERT_TEMP_WARNING) || 28,
    critical: parseFloat(process.env.ALERT_TEMP_CRITICAL) || 35,
  },
  humidity: {
    warning: parseFloat(process.env.ALERT_HUM_WARNING) || 90,
    critical: parseFloat(process.env.ALERT_HUM_CRITICAL) || 95,
  },
  co2_ppm: {
    warning: parseFloat(process.env.ALERT_CO2_WARNING) || 2000,
    critical: parseFloat(process.env.ALERT_CO2_CRITICAL) || 3500,
  },
  ethylene_ppm: {
    warning: parseFloat(process.env.ALERT_ETH_WARNING) || 5,
    critical: parseFloat(process.env.ALERT_ETH_CRITICAL) || 15,
  },
  spoilage_score: {
    warning: parseFloat(process.env.ALERT_SCORE_WARNING) || 0.5,
    critical: parseFloat(process.env.ALERT_SCORE_CRITICAL) || 0.75,
  },
});

/**
 * Check if an alert is on cooldown.
 */
const isOnCooldown = (nodeId, metric, level) => {
  const key = `${nodeId}:${metric}:${level}`;
  const lastAlert = alertCooldowns.get(key);
  if (!lastAlert) return false;
  return Date.now() - lastAlert < COOLDOWN_MS;
};

/**
 * Set cooldown for an alert.
 */
const setCooldown = (nodeId, metric, level) => {
  const key = `${nodeId}:${metric}:${level}`;
  alertCooldowns.set(key, Date.now());
};

/**
 * Store an alert in PostgreSQL.
 */
const storeAlert = async (alert) => {
  try {
    const result = await pgPool.query(
      `INSERT INTO alerts (node_id, metric, level, value, threshold, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [alert.node_id, alert.metric, alert.level, alert.value, alert.threshold, alert.message]
    );
    return result.rows[0];
  } catch (err) {
    logger.error(`Failed to store alert: ${err.message}`);
    return null;
  }
};

/**
 * Check a single metric against its thresholds.
 * Returns an array of alert objects (0, 1, or 2 — warning and/or critical).
 */
const checkMetric = (nodeId, metric, value, thresholds) => {
  const alerts = [];

  // Check critical first (higher severity)
  if (value >= thresholds.critical) {
    if (!isOnCooldown(nodeId, metric, 'critical')) {
      alerts.push({
        node_id: nodeId,
        metric,
        level: 'critical',
        value,
        threshold: thresholds.critical,
        message: `CRITICAL: ${metric} at ${value} exceeds threshold ${thresholds.critical} on ${nodeId}`,
      });
    }
  } else if (value >= thresholds.warning) {
    if (!isOnCooldown(nodeId, metric, 'warning')) {
      alerts.push({
        node_id: nodeId,
        metric,
        level: 'warning',
        value,
        threshold: thresholds.warning,
        message: `WARNING: ${metric} at ${value} exceeds threshold ${thresholds.warning} on ${nodeId}`,
      });
    }
  }

  return alerts;
};

/**
 * Evaluate an enriched sensor reading against all thresholds.
 * Returns an array of triggered alerts (already stored in DB).
 * @param {Object} enrichedData - The enriched sensor reading.
 * @param {Function} emitAlert - Socket.IO emit function for real-time alerts.
 */
const evaluateReading = async (enrichedData, emitAlert) => {
  const thresholds = getThresholds();
  const nodeId = enrichedData.node_id;
  const triggeredAlerts = [];

  // Check each sensor metric
  const metricsToCheck = [
    { metric: 'temperature', value: enrichedData.temperature },
    { metric: 'humidity', value: enrichedData.humidity },
    { metric: 'co2_ppm', value: enrichedData.co2_ppm },
    { metric: 'ethylene_ppm', value: enrichedData.ethylene_ppm },
  ];

  // Check spoilage score if enriched data is available
  if (enrichedData.enriched && enrichedData.enriched.spoilage_score !== undefined) {
    metricsToCheck.push({
      metric: 'spoilage_score',
      value: enrichedData.enriched.spoilage_score,
    });
  }

  for (const { metric, value } of metricsToCheck) {
    const alerts = checkMetric(nodeId, metric, value, thresholds[metric]);

    for (const alert of alerts) {
      const storedAlert = await storeAlert(alert);
      if (storedAlert) {
        setCooldown(nodeId, metric, alert.level);
        triggeredAlerts.push(storedAlert);

        // Emit via Socket.IO
        if (emitAlert) {
          emitAlert(storedAlert);
        }

        logger.warn(`Alert: ${alert.message}`);
      }
    }
  }

  return triggeredAlerts;
};

/**
 * Get all alerts from PostgreSQL, ordered by most recent first.
 */
const getAlerts = async (limit = 100) => {
  try {
    const result = await pgPool.query(
      'SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (err) {
    logger.error(`Failed to fetch alerts: ${err.message}`);
    return [];
  }
};

/**
 * Delete an alert by ID.
 */
const deleteAlert = async (alertId) => {
  try {
    const result = await pgPool.query(
      'DELETE FROM alerts WHERE id = $1 RETURNING *',
      [alertId]
    );
    return result.rows[0] || null;
  } catch (err) {
    logger.error(`Failed to delete alert: ${err.message}`);
    return null;
  }
};

export { evaluateReading, getAlerts, deleteAlert };
