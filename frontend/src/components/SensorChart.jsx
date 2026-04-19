import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ComposedChart,
} from 'recharts';

const CHART_CONFIGS = {
  temperature: {
    label: 'Temperature',
    unit: '°C',
    rawKey: 'temperature',
    emaKey: 'temp_ema',
    color: '#F97316',
    emaColor: '#FB923C',
    domain: [-10, 60],
  },
  humidity: {
    label: 'Humidity',
    unit: '%',
    rawKey: 'humidity',
    emaKey: 'hum_ema',
    color: '#3B82F6',
    emaColor: '#60A5FA',
    domain: [0, 100],
  },
  co2: {
    label: 'CO₂',
    unit: 'ppm',
    rawKey: 'co2_ppm',
    emaKey: 'co2_ema',
    color: '#8B5CF6',
    emaColor: '#A78BFA',
    domain: [0, 5000],
  },
  ethylene: {
    label: 'Ethylene',
    unit: 'ppm',
    rawKey: 'ethylene_ppm',
    emaKey: 'eth_ema',
    color: '#10B981',
    emaColor: '#34D399',
    domain: [0, 50],
  },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-time">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color }} className="chart-tooltip-value">
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
        </p>
      ))}
    </div>
  );
};

const SensorChart = ({ data, metric = 'temperature' }) => {
  const [activeMetric, setActiveMetric] = useState(metric);
  const config = CHART_CONFIGS[activeMetric];

  if (!data || data.length === 0) {
    return (
      <div className="sensor-chart" id="sensor-chart">
        <div className="chart-header">
          <h3>Sensor Readings</h3>
          <div className="chart-metric-tabs">
            {Object.entries(CHART_CONFIGS).map(([key, cfg]) => (
              <button
                key={key}
                className={`chart-tab ${activeMetric === key ? 'active' : ''}`}
                onClick={() => setActiveMetric(key)}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-empty">
          <p>No data available yet</p>
        </div>
      </div>
    );
  }

  // Prepare chart data with enriched EMA values
  const chartData = data.map((d) => ({
    time: d.time,
    [config.rawKey]: d[config.rawKey],
    [config.emaKey]: d.enriched?.[config.emaKey] ?? null,
    anomaly: d.enriched?.anomaly_flag ? d[config.rawKey] : null,
  }));

  return (
    <div className="sensor-chart" id="sensor-chart">
      <div className="chart-header">
        <h3>
          {config.label}
          <span className="chart-unit">({config.unit})</span>
        </h3>
        <div className="chart-metric-tabs">
          {Object.entries(CHART_CONFIGS).map(([key, cfg]) => (
            <button
              key={key}
              className={`chart-tab ${activeMetric === key ? 'active' : ''}`}
              onClick={() => setActiveMetric(key)}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id={`gradient-${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={config.color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={config.color} stopOpacity={0} />
            </linearGradient>
          </defs>
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
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}
          />
          <Area
            type="monotone"
            dataKey={config.rawKey}
            stroke={config.color}
            fill={`url(#gradient-${activeMetric})`}
            strokeWidth={2}
            name={`${config.label} (Raw)`}
            dot={false}
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey={config.emaKey}
            stroke={config.emaColor}
            strokeWidth={2}
            strokeDasharray="5 5"
            name={`${config.label} (EMA)`}
            dot={false}
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="anomaly"
            stroke="#EF4444"
            strokeWidth={0}
            dot={{ r: 4, fill: '#EF4444', stroke: '#EF4444' }}
            name="Anomaly"
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SensorChart;
