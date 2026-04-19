import logger from '../utils/logger.js';

/**
 * Initialize Socket.IO with room-based broadcasting.
 */
const initSocket = (io) => {
  io.on('connection', (socket) => {
    logger.info(`Socket.IO client connected: ${socket.id}`);

    // Join a node room to receive updates for specific node
    socket.on('join_node', (nodeId) => {
      socket.join(nodeId);
      logger.debug(`Socket ${socket.id} joined room: ${nodeId}`);
    });

    // Leave a node room
    socket.on('leave_node', (nodeId) => {
      socket.leave(nodeId);
      logger.debug(`Socket ${socket.id} left room: ${nodeId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket.IO client disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (err) => {
      logger.error(`Socket.IO error for ${socket.id}: ${err.message}`);
    });
  });

  logger.info('Socket.IO initialized');
};

/**
 * Emit a sensor update to the node's room and broadcast to all.
 */
const emitSensorUpdate = (io, enrichedData) => {
  const nodeId = enrichedData.node_id;
  // Send to specific node room
  io.to(nodeId).emit('sensor_update', enrichedData);
  // Also broadcast to a general channel for dashboard overview
  io.emit('sensor_update_all', enrichedData);
};

/**
 * Emit an alert to all connected clients.
 */
const emitAlert = (io, alert) => {
  io.emit('alert', alert);
};

/**
 * Emit a score update to the node's room.
 */
const emitScoreUpdate = (io, scoreData) => {
  const nodeId = scoreData.node_id;
  io.to(nodeId).emit('score_update', scoreData);
  io.emit('score_update_all', scoreData);
};

export { initSocket, emitSensorUpdate, emitAlert, emitScoreUpdate };
