import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, ComposedChart,
} from 'recharts';
import { fetchSensorData, fetchNodes } from '../api';
import toast from 'react-hot-toast';

const RANGES = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
];

const METRICS = [
  { key: 'temperature', label: 'Temperature (°C)', color: '#F97316' },
  { key: 'humidity', label: 'Humidity (%)', color: '#3B82F6' },
  { key: 'co2_ppm', label: 'CO₂ (ppm)', color: '#8B5CF6' },
  { key: 'spoilage_score', label: 'Spoilage Score', color: '#EF4444' },
];

const History = () => {
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [range, setRange] = useState('1h');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState(['temperature', 'humidity']);

  // Load nodes
  useEffect(() => {
    const loadNodes = async () => {
      try {
        const nodeList = await fetchNodes();
        setNodes(nodeList);
        if (nodeList.length > 0) {
          setSelectedNode(nodeList[0].node_id);
        }
      } catch (err) {
        // Nodes might not be registered yet
      }
    };
    loadNodes();
  }, []);

  // Load data when node or range changes
  useEffect(() => {
    if (!selectedNode) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const result = await fetchSensorData(selectedNode, range);
        const formatted = result.data.map((d) => ({
          ...d,
          time: new Date(d.timestamp).toLocaleTimeString(),
        }));
        setData(formatted);
      } catch (err) {
        toast.error('Failed to load sensor data');
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [selectedNode, range]);

  const toggleMetric = (key) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  return (
    <div className="history-page" id="history-page">
      <div className="page-header">
        <h2>📈 Historical Data</h2>
      </div>

      <div className="history-controls" id="history-controls">
        <div className="control-group">
          <label>Node</label>
          <select
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
            className="control-select"
            id="history-node-select"
          >
            {nodes.length === 0 && <option value="">No nodes registered</option>}
            {nodes.map((node) => (
              <option key={node.node_id} value={node.node_id}>
                {node.name || node.node_id}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>Time Range</label>
          <div className="range-tabs">
            {RANGES.map((r) => (
              <button
                key={r.value}
                className={`range-tab ${range === r.value ? 'active' : ''}`}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <label>Metrics</label>
          <div className="metric-toggles">
            {METRICS.map((m) => (
              <button
                key={m.key}
                className={`metric-toggle ${selectedMetrics.includes(m.key) ? 'active' : ''}`}
                onClick={() => toggleMetric(m.key)}
                style={{
                  borderColor: selectedMetrics.includes(m.key) ? m.color : 'transparent',
                  color: selectedMetrics.includes(m.key) ? m.color : undefined,
                }}
              >
                {m.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="history-chart" id="history-chart">
        {loading ? (
          <div className="chart-loading">
            <div className="spinner"></div>
            <p>Loading data...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="chart-empty">
            <p>No historical data available for this node and time range.</p>
            <p className="chart-empty-hint">Start the simulator to generate data.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="time"
                stroke="rgba(255,255,255,0.3)"
                fontSize={11}
                tick={{ fill: 'rgba(255,255,255,0.5)' }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.3)"
                fontSize={11}
                tick={{ fill: 'rgba(255,255,255,0.5)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {METRICS.filter((m) => selectedMetrics.includes(m.key)).map((m) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={false}
                  name={m.label}
                  animationDuration={500}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Data table */}
      {data.length > 0 && (
        <div className="history-table-wrapper" id="history-table">
          <h3>Raw Data ({data.length} readings)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Temp (°C)</th>
                  <th>Humidity (%)</th>
                  <th>CO₂ (ppm)</th>
                  <th>Air Alert</th>
                  <th>Ethanol Alert</th>
                  <th>Score</th>
                  <th>Anomaly</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(-50).reverse().map((row, i) => (
                  <tr key={i}>
                    <td>{row.time}</td>
                    <td>{row.temperature?.toFixed(1)}</td>
                    <td>{row.humidity?.toFixed(1)}</td>
                    <td>{row.co2_ppm?.toFixed(0)}</td>
                    <td>{row.air_alert ? '⚠' : '✓'}</td>
                    <td>{row.ethanol_alert ? '⚠' : '✓'}</td>
                    <td>{row.spoilage_score?.toFixed(3) ?? '-'}</td>
                    <td>
                      <span className={`anomaly-badge ${row.anomaly_flag ? 'anomaly' : 'normal'}`}>
                        {row.anomaly_flag ? '⚠' : '✓'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
