import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

/**
 * Socket.IO hook for real-time data streaming.
 * Manages connection, room joining, and event listeners.
 */
const useSocket = () => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinNode = useCallback((nodeId) => {
    if (socketRef.current) {
      socketRef.current.emit('join_node', nodeId);
    }
  }, []);

  const leaveNode = useCallback((nodeId) => {
    if (socketRef.current) {
      socketRef.current.emit('leave_node', nodeId);
    }
  }, []);

  const onSensorUpdate = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.off('sensor_update');
      socketRef.current.off('sensor_update_all');
      socketRef.current.on('sensor_update', callback);
      socketRef.current.on('sensor_update_all', callback);
    }
  }, []);

  const onAlert = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.off('alert');
      socketRef.current.on('alert', callback);
    }
  }, []);

  const onScoreUpdate = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.off('score_update');
      socketRef.current.off('score_update_all');
      socketRef.current.on('score_update', callback);
      socketRef.current.on('score_update_all', callback);
    }
  }, []);

  return {
    socket: socketRef.current,
    connected,
    joinNode,
    leaveNode,
    onSensorUpdate,
    onAlert,
    onScoreUpdate,
  };
};

export default useSocket;
