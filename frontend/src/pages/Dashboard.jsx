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
                <div className="stat-label">Air Quality (MQ-135)</div>
                <div className={`stat-value ${currentReading.air_alert ? 'anomaly-active' : 'anomaly-inactive'}`}>
                  {currentReading.air_alert ? '⚠ ALERT' : '✓ Normal'}
                </div>
                <div className="stat-sub">Digital sensor output</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Ethanol (MQ-3)</div>
                <div className={`stat-value ${currentReading.ethanol_alert ? 'anomaly-active' : 'anomaly-inactive'}`}>
                  {currentReading.ethanol_alert ? '⚠ ALERT' : '✓ Normal'}
                </div>
                <div className="stat-sub">Digital sensor output</div>
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

          {/* Ambient estimates row */}
          {currentReading && (currentReading.ambient_temp_est != null || currentReading.ambient_hum_est != null) && (
            <div className="stats-grid stats-grid-secondary" id="ambient-stats">
              <div className="stat-card stat-card-compact">
                <div className="stat-label">Ambient Temp (est)</div>
                <div className="stat-value">
                  {currentReading.ambient_temp_est != null ? `${currentReading.ambient_temp_est.toFixed(1)}°C` : '--'}
                </div>
                <div className="stat-sub">DHT11 − 0.4°C offset</div>
              </div>
              <div className="stat-card stat-card-compact">
                <div className="stat-label">Ambient Humidity (est)</div>
                <div className="stat-value">
                  {currentReading.ambient_hum_est != null ? `${currentReading.ambient_hum_est.toFixed(1)}%` : '--'}
                </div>
                <div className="stat-sub">DHT11 + 3% offset</div>
              </div>
              <div className="stat-card stat-card-compact">
                <div className="stat-label">Readings</div>
                <div className="stat-value">{currentReading.enriched?.reading_count || 0}</div>
                <div className="stat-sub">Total data points</div>
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
          <p>Start the simulator or connect ESP8266 nodes to see real-time data.</p>
          <code>cd backend && npm run simulate</code>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
