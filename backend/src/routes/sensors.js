import { Router } from 'express';
import { querySensorData } from '../config/db.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/sensors/:nodeId
 * Query sensor data from InfluxDB for a specific node.
 * Supports range query parameter: 1h, 6h, 24h, 7d
 */
router.get('/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const range = req.query.range || '1h';

    // Validate range parameter
    const validRanges = ['1h', '6h', '24h', '7d'];
    if (!validRanges.includes(range)) {
      return res.status(400).json({
        error: `Invalid range. Valid values: ${validRanges.join(', ')}`,
      });
    }

    const data = await querySensorData(nodeId, range);
    res.json({
      node_id: nodeId,
      range,
      count: data.length,
      data,
    });
  } catch (err) {
    logger.error(`Error fetching sensor data: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

export default router;
