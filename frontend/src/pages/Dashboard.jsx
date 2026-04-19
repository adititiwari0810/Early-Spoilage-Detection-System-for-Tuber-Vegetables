import React, { useState, useEffect } from 'react';
import AlertBanner from '../components/AlertBanner';
import NodeTabs from '../components/NodeTabs';
import GaugePanel from '../components/GaugePanel';
import SensorChart from '../components/SensorChart';

const Dashboard = ({ nodeData, latestReading, getNodeIds, onAlert }) => {
  const [activeNode, setActiveNode] = useState(null);
  const nodeIds = getNodeIds();

  // Auto-select first node when data arrives
  useEffect(() => {
    if (!activeNode && nodeIds.length > 0) {
      setActiveNode(nodeIds[0]);
    }
  }, [nodeIds, activeNode]);

  const currentReading = activeNode ? latestReading[activeNode] : null;
  const currentData = activeNode ? (nodeData[activeNode] || []) : [];

  return (
    <div className="dashboard-page" id="dashboard-page">
      <div className="page-header">
        <h2>📊 Live Dashboard</h2>
        <div className="page-header-meta">
          {currentReading && (
            <span className="last-update">
              Last update: {new Date(currentReading.timestamp * 1000).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <AlertBanner onAlertReceived={onAlert} />

      <NodeTabs
        nodeIds={nodeIds}
        activeNode={activeNode}
        onSelectNode={setActiveNode}
      />

      {activeNode && (
        <>
          <GaugePanel reading={currentReading} />

          {/* Stats cards */}
          {currentReading?.enriched && (
            <div className="stats-grid" id="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Spoilage Score</div>
                <div className={`stat-value risk-${(currentReading.enriched.risk_level || 'low').toLowerCase()}`}>
                  {(currentReading.enriched.spoilage_score * 100).toFixed(1)}%
                </div>
                <div className="stat-sub">{currentReading.enriched.risk_level} Risk</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Ethylene</div>
                <div className="stat-value">{currentReading.ethylene_ppm} ppm</div>
                <div className="stat-sub">EMA: {currentReading.enriched.eth_ema}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Gas Raw</div>
                <div className="stat-value">{currentReading.gas_raw}</div>
                <div className="stat-sub">Readings: {currentReading.enriched.reading_count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Anomaly</div>
                <div className={`stat-value ${currentReading.enriched.anomaly_flag ? 'anomaly-active' : 'anomaly-inactive'}`}>
                  {currentReading.enriched.anomaly_flag ? '⚠ DETECTED' : '✓ Normal'}
                </div>
                <div className="stat-sub">
                  {currentReading.enriched.window_full ? 'Detection active' : `Warming up (${currentReading.enriched.reading_count}/50)`}
                </div>
              </div>
            </div>
          )}

          <div className="charts-grid">
            <SensorChart data={currentData} metric="temperature" />
          </div>
        </>
      )}

      {!activeNode && (
        <div className="empty-state" id="empty-state">
          <div className="empty-state-icon">🥔</div>
          <h3>Waiting for Sensor Data</h3>
          <p>Start the simulator or connect ESP32 nodes to see real-time data.</p>
          <code>cd backend && npm run simulate</code>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
