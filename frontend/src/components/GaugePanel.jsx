import React from 'react';

/**
 * Custom gauge component using SVG arcs.
 * react-gauge-chart has compatibility issues so we build our own premium gauge.
 */
const Gauge = ({ value, min, max, label, unit, thresholds, size = 140 }) => {
  const normalizedValue = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = normalizedValue * 180; // Half circle

  // Color based on thresholds
  const getColor = () => {
    if (!thresholds) {
      // Default: green to red gradient
      if (normalizedValue < 0.3) return '#10B981';
      if (normalizedValue < 0.7) return '#F59E0B';
      return '#EF4444';
    }
    const { warning, critical } = thresholds;
    const normalizedWarning = (warning - min) / (max - min);
    const normalizedCritical = (critical - min) / (max - min);
    if (normalizedValue < normalizedWarning) return '#10B981';
    if (normalizedValue < normalizedCritical) return '#F59E0B';
    return '#EF4444';
  };

  const color = getColor();
  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = size / 2 - 15;
  const strokeWidth = 10;

  // Create arc path
  const polarToCartesian = (cx, cy, r, angleDeg) => {
    const rad = ((angleDeg - 180) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const describeArc = (cx, cy, r, startAngle, endAngle) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
  };

  const bgPath = describeArc(cx, cy, radius, 0, 180);
  const valuePath = describeArc(cx, cy, radius, 0, Math.max(0.5, angle));

  // Needle position
  const needleAngle = angle - 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLength = radius - 15;
  const needleX = cx + needleLength * Math.cos(needleRad);
  const needleY = cy + needleLength * Math.sin(needleRad);

  return (
    <div className="gauge-container">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Glow effect */}
        <defs>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Value arc */}
        <path
          d={valuePath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter={`url(#glow-${label})`}
          style={{ transition: 'all 0.5s ease-out' }}
        />

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ transition: 'all 0.5s ease-out' }}
        />
        <circle cx={cx} cy={cy} r="4" fill="rgba(255,255,255,0.5)" />

        {/* Value text */}
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          className="gauge-value-text"
          fill="white"
          fontSize="18"
          fontWeight="700"
        >
          {typeof value === 'number' ? value.toFixed(1) : '--'}
        </text>
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize="10"
          fontWeight="400"
        >
          {unit}
        </text>
      </svg>
      <div className="gauge-label">{label}</div>
    </div>
  );
};

const GaugePanel = ({ reading }) => {
  if (!reading) {
    return (
      <div className="gauge-panel" id="gauge-panel">
        <div className="gauge-panel-empty">
          <p>Awaiting sensor data...</p>
        </div>
      </div>
    );
  }

  const spoilageScore = reading.enriched?.spoilage_score ?? 0;
  const riskLevel = reading.enriched?.risk_level ?? 'N/A';

  return (
    <div className="gauge-panel" id="gauge-panel">
      <Gauge
        value={reading.temperature}
        min={-10}
        max={60}
        label="Temperature"
        unit="°C"
        thresholds={{ warning: 28, critical: 35 }}
      />
      <Gauge
        value={reading.humidity}
        min={0}
        max={100}
        label="Humidity"
        unit="%"
        thresholds={{ warning: 90, critical: 95 }}
      />
      <Gauge
        value={reading.co2_ppm}
        min={0}
        max={5000}
        label="CO₂"
        unit="ppm"
        thresholds={{ warning: 2000, critical: 3500 }}
      />
      <Gauge
        value={spoilageScore * 100}
        min={0}
        max={100}
        label={`Spoilage (${riskLevel})`}
        unit="%"
        thresholds={{ warning: 50, critical: 75 }}
      />
    </div>
  );
};

export default GaugePanel;
