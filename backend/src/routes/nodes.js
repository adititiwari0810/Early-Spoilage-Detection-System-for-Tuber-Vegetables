import { Router } from 'express';
import { pgPool } from '../config/db.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/nodes
 * List all registered nodes with their status and last spoilage score.
 */
router.get('/', async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT n.*,
        (SELECT score FROM spoilage_scores WHERE node_id = n.node_id ORDER BY computed_at DESC LIMIT 1) as latest_score,
        (SELECT risk_level FROM spoilage_scores WHERE node_id = n.node_id ORDER BY computed_at DESC LIMIT 1) as latest_risk
      FROM nodes n
      ORDER BY n.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    logger.error(`Error fetching nodes: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch nodes' });
  }
});

/**
 * POST /api/nodes
 * Register a new node.
 */
router.post('/', async (req, res) => {
  try {
    const { node_id, name, location } = req.body;

    if (!node_id) {
      return res.status(400).json({ error: 'node_id is required' });
    }

    const result = await pgPool.query(
      `INSERT INTO nodes (node_id, name, location)
       VALUES ($1, $2, $3)
       ON CONFLICT (node_id) DO UPDATE SET name = $2, location = $3, updated_at = NOW()
       RETURNING *`,
      [node_id, name || node_id, location || '']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error(`Error creating node: ${err.message}`);
    res.status(500).json({ error: 'Failed to create node' });
  }
});

/**
 * PATCH /api/nodes/:id
 * Update a node's metadata.
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, status } = req.body;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (location !== undefined) {
      fields.push(`location = $${paramIndex++}`);
      values.push(location);
    }
    if (status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pgPool.query(
      `UPDATE nodes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    logger.error(`Error updating node: ${err.message}`);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

export default router;
