import logger from '../utils/logger.js';

/**
 * Per-node analysis state. Each node maintains its own rolling window.
 */
const nodeWindows = new Map();

const WINDOW_SIZE = parseInt(process.env.ROLLING_WINDOW_SIZE, 10) || 50;
const EMA_ALPHA = parseFloat(process.env.EMA_ALPHA) || 0.2;
const ZSCORE_THRESHOLD = parseFloat(process.env.ZSCORE_THRESHOLD) || 2;
const SLOPE_WINDOW = parseInt(process.env.SLOPE_WINDOW, 10) || 10;

/**
 * Clamp a value between min and max.
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Normalize a value to [0, 1] using min-max scaling.
 */
const norm = (v, min, max) => clamp((v - min) / (max - min), 0, 1);

/**
 * Compute mean of an array of numbers.
 */
const mean = (arr) => {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
};

/**
 * Compute standard deviation of an array of numbers.
 */
const std = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
};

/**
 * Compute Z-score for the latest value against the window.
 */
const zScore = (value, windowArr) => {
  const s = std(windowArr);
  if (s === 0) return 0;
  return (value - mean(windowArr)) / s;
};

/**
 * Compute EMA (Exponential Moving Average).
 * @param {number} current - Current value.
 * @param {number|null} previousEma - Previous EMA value (null for first reading).
 * @param {number} alpha - Smoothing factor.
 */
const ema = (current, previousEma, alpha = EMA_ALPHA) => {
  if (previousEma === null || previousEma === undefined) return current;
  return alpha * current + (1 - alpha) * previousEma;
};

/**
 * Compute linear regression slope over the last N readings.
 * Uses least squares method: slope = (n*Σ(xi*yi) - Σxi*Σyi) / (n*Σ(xi²) - (Σxi)²)
 */
const linearSlope = (values) => {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
};

/**
 * Get or create the analysis window for a given node.
 */
const getNodeWindow = (nodeId) => {
  if (!nodeWindows.has(nodeId)) {
    nodeWindows.set(nodeId, {
      temperature: [],
      humidity: [],
      co2_ppm: [],
      ethylene_ppm: [],
      gas_raw: [],
      ema_temperature: null,
      ema_humidity: null,
      ema_co2: null,
      ema_ethylene: null,
      readingCount: 0,
    });
  }
  return nodeWindows.get(nodeId);
};

/**
 * Push a value to a rolling window array, maintaining max size.
 */
const pushToWindow = (arr, value, maxSize = WINDOW_SIZE) => {
  arr.push(value);
  if (arr.length > maxSize) {
    arr.shift();
  }
};

/**
 * Compute spoilage score using weighted normalization.
 * score =
 *   0.35 * norm(co2_ppm, 400, 5000) +
 *   0.25 * norm(humidity, 0, 100) +
 *   0.20 * norm(temperature, -10, 60) +
 *   0.20 * norm(ethylene_ppm, 0, 50)
 */
const computeSpoilageScore = (data) => {
  const score =
    0.35 * norm(data.co2_ppm, 400, 5000) +
    0.25 * norm(data.humidity, 0, 100) +
    0.20 * norm(data.temperature, -10, 60) +
    0.20 * norm(data.ethylene_ppm, 0, 50);

  return Math.round(score * 1000) / 1000; // 3 decimal places
};

/**
 * Classify risk level based on spoilage score.
 */
const classifyRisk = (score) => {
  if (score <= 0.3) return 'Low';
  if (score <= 0.7) return 'Medium';
  return 'High';
};

/**
 * Enrich a sensor reading with statistical analysis.
 * Returns the enriched data object.
 */
const enrichReading = (data) => {
  const window = getNodeWindow(data.node_id);
  window.readingCount++;

  // Push to rolling windows
  pushToWindow(window.temperature, data.temperature);
  pushToWindow(window.humidity, data.humidity);
  pushToWindow(window.co2_ppm, data.co2_ppm);
  pushToWindow(window.ethylene_ppm, data.ethylene_ppm);
  pushToWindow(window.gas_raw, data.gas_raw);

  // Compute EMAs
  window.ema_temperature = ema(data.temperature, window.ema_temperature);
  window.ema_humidity = ema(data.humidity, window.ema_humidity);
  window.ema_co2 = ema(data.co2_ppm, window.ema_co2);
  window.ema_ethylene = ema(data.ethylene_ppm, window.ema_ethylene);

  // Compute spoilage score
  const spoilageScore = computeSpoilageScore(data);
  const riskLevel = classifyRisk(spoilageScore);

  // Compute slopes (last SLOPE_WINDOW readings)
  const tempSlope = linearSlope(window.temperature.slice(-SLOPE_WINDOW));
  const humSlope = linearSlope(window.humidity.slice(-SLOPE_WINDOW));
  const co2Slope = linearSlope(window.co2_ppm.slice(-SLOPE_WINDOW));
  const ethSlope = linearSlope(window.ethylene_ppm.slice(-SLOPE_WINDOW));

  // Z-scores and anomaly detection (only after WINDOW_SIZE readings)
  const hasEnoughData = window.readingCount >= WINDOW_SIZE;

  const tempZscore = hasEnoughData ? zScore(data.temperature, window.temperature) : 0;
  const humZscore = hasEnoughData ? zScore(data.humidity, window.humidity) : 0;
  const co2Zscore = hasEnoughData ? zScore(data.co2_ppm, window.co2_ppm) : 0;
  const ethZscore = hasEnoughData ? zScore(data.ethylene_ppm, window.ethylene_ppm) : 0;

  const anomalyFlag = hasEnoughData && (
    Math.abs(tempZscore) > ZSCORE_THRESHOLD ||
    Math.abs(humZscore) > ZSCORE_THRESHOLD ||
    Math.abs(co2Zscore) > ZSCORE_THRESHOLD ||
    Math.abs(ethZscore) > ZSCORE_THRESHOLD
  );

  const enriched = {
    // Original data
    ...data,
    // Enriched fields
    enriched: {
      spoilage_score: spoilageScore,
      risk_level: riskLevel,
      temp_mean: Math.round(mean(window.temperature) * 100) / 100,
      temp_std: Math.round(std(window.temperature) * 100) / 100,
      temp_zscore: Math.round(tempZscore * 100) / 100,
      temp_ema: Math.round(window.ema_temperature * 100) / 100,
      temp_slope: Math.round(tempSlope * 1000) / 1000,
      hum_mean: Math.round(mean(window.humidity) * 100) / 100,
      hum_std: Math.round(std(window.humidity) * 100) / 100,
      hum_zscore: Math.round(humZscore * 100) / 100,
      hum_ema: Math.round(window.ema_humidity * 100) / 100,
      hum_slope: Math.round(humSlope * 1000) / 1000,
      co2_mean: Math.round(mean(window.co2_ppm) * 100) / 100,
      co2_std: Math.round(std(window.co2_ppm) * 100) / 100,
      co2_zscore: Math.round(co2Zscore * 100) / 100,
      co2_ema: Math.round(window.ema_co2 * 100) / 100,
      co2_slope: Math.round(co2Slope * 1000) / 1000,
      eth_mean: Math.round(mean(window.ethylene_ppm) * 100) / 100,
      eth_std: Math.round(std(window.ethylene_ppm) * 100) / 100,
      eth_zscore: Math.round(ethZscore * 100) / 100,
      eth_ema: Math.round(window.ema_ethylene * 100) / 100,
      eth_slope: Math.round(ethSlope * 1000) / 1000,
      anomaly_flag: anomalyFlag,
      reading_count: window.readingCount,
      window_full: hasEnoughData,
    },
  };

  logger.debug(
    `Enriched ${data.node_id}: score=${spoilageScore}, risk=${riskLevel}, anomaly=${anomalyFlag}`
  );

  return enriched;
};

/**
 * Get the current spoilage score for a node without adding a reading.
 */
const getCurrentScore = (nodeId) => {
  const window = nodeWindows.get(nodeId);
  if (!window || window.readingCount === 0) return null;

  const lastTemp = window.temperature[window.temperature.length - 1];
  const lastHum = window.humidity[window.humidity.length - 1];
  const lastCo2 = window.co2_ppm[window.co2_ppm.length - 1];
  const lastEth = window.ethylene_ppm[window.ethylene_ppm.length - 1];

  const score = computeSpoilageScore({
    temperature: lastTemp,
    humidity: lastHum,
    co2_ppm: lastCo2,
    ethylene_ppm: lastEth,
  });

  return { score, risk: classifyRisk(score) };
};

/**
 * Get all active node IDs from analysis windows.
 */
const getActiveNodes = () => {
  return Array.from(nodeWindows.keys());
};

export {
  enrichReading,
  computeSpoilageScore,
  classifyRisk,
  getCurrentScore,
  getActiveNodes,
  norm,
  mean,
  std,
  zScore,
  ema,
  linearSlope,
};
