import React, { useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Nodes from './pages/Nodes';
import useSocket from './hooks/useSocket';
import useSensorData from './hooks/useSensorData';

const App = () => {
  const { connected, onSensorUpdate, onAlert, onScoreUpdate } = useSocket();
  const { nodeData, latestReading, addReading, getNodeIds } = useSensorData();

  // Wire up Socket.IO sensor updates
  useEffect(() => {
    onSensorUpdate((data) => {
      addReading(data);
    });
  }, [onSensorUpdate, addReading]);

  // Alert callback ref (Dashboard will set this)
  const alertCallbackRef = React.useRef(null);

  const handleAlertCallback = useCallback((callback) => {
    alertCallbackRef.current = callback;
  }, []);

  useEffect(() => {
    onAlert((alert) => {
      if (alertCallbackRef.current) {
        alertCallbackRef.current(alert);
      }
    });
  }, [onAlert]);

  return (
    <Layout connected={connected}>
      <Routes>
        <Route
          path="/"
          element={
            <Dashboard
              nodeData={nodeData}
              latestReading={latestReading}
              getNodeIds={getNodeIds}
              onAlert={handleAlertCallback}
            />
          }
        />
        <Route path="/history" element={<History />} />
        <Route path="/nodes" element={<Nodes />} />
      </Routes>
    </Layout>
  );
};

export default App;
