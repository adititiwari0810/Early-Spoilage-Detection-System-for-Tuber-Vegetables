import cron from 'node-cron';
import { pgPool } from '../config/db.js';
import { getCurrentScore, getActiveNodes } from './analysis.js';
import logger from '../utils/logger.js';

let io = null;
const NODE_OFFLINE_MS = (parseInt(process.env.NODE_OFFLINE_MINUTES, 10) || 5) * 60 * 1000;

/**
 * Track last data timestamp per node.
 */
const lastSeen = new Map();

/**
 * Update the last seen timestamp for a node.
 */
const updateLastSeen = (nodeId) => {
  lastSeen.set(nodeId, Date.now());
};

/**
 * Store spoilage score in PostgreSQL.
 */
const storeSpoilageScore = async (nodeId, score, riskLevel) => {
  try {
    await pgPool.query(
      `INSERT INTO spoilage_scores (node_id, score, risk_level)
       VALUES ($1, $2, $3)`,
      [nodeId, score, riskLevel]
    );
  } catch (err) {
    logger.error(`Failed to store spoilage score for ${nodeId}: ${err.message}`);
  }
};

/**
 * Update node status in PostgreSQL.
 */
const updateNodeStatus = async (nodeId, status) => {
  try {
    await pgPool.query(
      `UPDATE nodes SET status = $1, updated_at = NOW() WHERE node_id = $2`,
      [status, nodeId]
    );
  } catch (err) {
    logger.error(`Failed to update node status for ${nodeId}: ${err.message}`);
  }
};

/**
 * Upsert a node record — creates if doesn't exist, updates last_seen.
 */
const upsertNode = async (nodeId) => {
  try {
    await pgPool.query(
      `INSERT INTO nodes (node_id, name, status, last_seen)
       VALUES ($1, $2, 'online', NOW())
       ON CONFLICT (node_id) DO UPDATE
       SET status = 'online', last_seen = NOW(), updated_at = NOW()`,
      [nodeId, nodeId]
    );
  } catch (err) {
    logger.error(`Failed to upsert node ${nodeId}: ${err.message}`);
  }
};

/**
 * Batch job: compute and store spoilage scores for all active nodes.
 * Also checks for offline nodes.
 */
const runBatchJob = async () => {
  logger.info('Running batch spoilage score job...');

  const activeNodes = getActiveNodes();

  for (const nodeId of activeNodes) {
    // Compute spoilage score
    const scoreData = getCurrentScore(nodeId);
    if (scoreData) {
      await storeSpoilageScore(nodeId, scoreData.score, scoreData.risk);

      // Emit score update via Socket.IO
      if (io) {
        io.to(nodeId).emit('score_update', {
          node_id: nodeId,
          score: scoreData.score,
          risk_level: scoreData.risk,
          computed_at: new Date().toISOString(),
        });
      }

      logger.info(`Batch score for ${nodeId}: ${scoreData.score} (${scoreData.risk})`);
    }

    // Check if node is offline
    const lastSeenTs = lastSeen.get(nodeId);
    if (lastSeenTs && Date.now() - lastSeenTs > NODE_OFFLINE_MS) {
      await updateNodeStatus(nodeId, 'offline');
      logger.warn(`Node ${nodeId} marked offline (no data for >${process.env.NODE_OFFLINE_MINUTES || 5}min)`);
    }
  }

  logger.info(`Batch job complete. Processed ${activeNodes.length} nodes.`);
};

/**
 * Start the batch cron job.
 */
const startBatchJob = (socketIo) => {
  io = socketIo;
  const cronExpr = process.env.BATCH_CRON || '*/15 * * * *';

  cron.schedule(cronExpr, async () => {
    try {
      await runBatchJob();
    } catch (err) {
      logger.error(`Batch job error: ${err.message}`);
    }
  });

  logger.info(`Batch job scheduled with cron: ${cronExpr}`);
};

export { startBatchJob, updateLastSeen, upsertNode, runBatchJob };
