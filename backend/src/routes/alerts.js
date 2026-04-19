import { Router } from 'express';
import { getAlerts, deleteAlert } from '../services/alertEngine.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/alerts
 * Retrieve all alerts, optionally filtered by node_id.
 */
router.get('/', async (req, res) => {
  try {
    const alerts = await getAlerts(200);
    res.json(alerts);
  } catch (err) {
    logger.error(`Error fetching alerts: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * DELETE /api/alerts/:id
 * Dismiss an alert by ID.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteAlert(parseInt(id, 10));

    if (!deleted) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ message: 'Alert dismissed', alert: deleted });
  } catch (err) {
    logger.error(`Error deleting alert: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

export default router;
