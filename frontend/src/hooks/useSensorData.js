import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to manage per-node sensor data with a rolling buffer.
 * Keeps last MAX_POINTS readings for chart rendering.
 */
const MAX_POINTS = 100;

const useSensorData = () => {
  const [nodeData, setNodeData] = useState({}); // { nodeId: [readings] }
  const [latestReading, setLatestReading] = useState({}); // { nodeId: reading }

  const addReading = useCallback((reading) => {
    const nodeId = reading.node_id;
    if (!nodeId) return;

    setLatestReading((prev) => ({
      ...prev,
      [nodeId]: reading,
    }));

    setNodeData((prev) => {
      const existing = prev[nodeId] || [];
      const updated = [...existing, {
        ...reading,
        time: new Date(reading.timestamp * 1000).toLocaleTimeString(),
      }];

      // Keep only last MAX_POINTS
      if (updated.length > MAX_POINTS) {
        updated.splice(0, updated.length - MAX_POINTS);
      }

      return { ...prev, [nodeId]: updated };
    });
  }, []);

  const getNodeIds = useCallback(() => {
    return Object.keys(latestReading);
  }, [latestReading]);

  return {
    nodeData,
    latestReading,
    addReading,
    getNodeIds,
  };
};

export default useSensorData;
