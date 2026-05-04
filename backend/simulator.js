import 'dotenv/config';
import mqtt from 'mqtt';

/**
 * Spoilage Sensor Simulator (Node.js)
 * Publishes simulated ESP8266 sensor data to MQTT broker.
 * Generates the EXACT same JSON format as the real hardware.
 *
 * Topic: sensor/data
 * Payload: { device, dht_temp, dht_hum, ambient_temp_est, ambient_hum_est, co2, air_alert, ethanol_alert }
 */

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const INTERVAL_MS = 500; // Match real hardware interval (500ms)

const NODES = [
  { id: 'esp8266_sim_01', name: 'Storage Room A' },
  { id: 'esp8266_sim_02', name: 'Storage Room B' },
];

// Spoilage progression state per node
const nodeState = {};

for (const node of NODES) {
  nodeState[node.id] = {
    spoilageProgress: Math.random() * 0.1, // Start with some randomness
    baseTemp: 24 + Math.random() * 4,      // 24-28°C base
    baseHumidity: 35 + Math.random() * 15,  // 35-50% base
    baseCo2: 450 + Math.random() * 100,     // 450-550 ppm base (MG811 calibrated)
  };
}

/**
 * Generate a sensor reading matching the ESP8266 hardware JSON format.
 */
const generateReading = (nodeId) => {
  const state = nodeState[nodeId];

  // Slowly increase spoilage over time
  state.spoilageProgress += 0.0005 + Math.random() * 0.001;
  const sp = Math.min(state.spoilageProgress, 1);

  // Add noise + spoilage drift
  const noise = () => (Math.random() - 0.5) * 2;

  const dht_temp = state.baseTemp + sp * 12 + noise() * 0.5;
  const dht_hum = Math.min(100, state.baseHumidity + sp * 30 + noise() * 2);
  const co2 = Math.min(5000, Math.max(400, state.baseCo2 + sp * 3000 + noise() * 30));

  // Compute derived values (matching real hardware)
  const ambient_temp_est = dht_temp - 0.4;
  const ambient_hum_est = dht_hum + 3.0;

  // Simulate digital alerts based on thresholds
  const air_alert = co2 > 1200 ? 1 : 0;
  const ethanol_alert = dht_temp > 32 ? 1 : 0;

  return {
    device: nodeId,
    dht_temp: Math.round(dht_temp * 10) / 10,
    dht_hum: Math.round(Math.max(0, dht_hum)),
    ambient_temp_est: Math.round(ambient_temp_est * 10) / 10,
    ambient_hum_est: Math.round(ambient_hum_est * 10) / 10,
    co2: Math.round(co2),
    air_alert,
    ethanol_alert,
  };
};

// ───── Connect and start publishing ─────
const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
  console.log(`🧪 Simulator connected to MQTT broker at ${BROKER_URL}`);
  console.log(`   Publishing for ${NODES.length} nodes every ${INTERVAL_MS}ms`);
  console.log(`   Topic: sensor/data`);
  console.log(`   Nodes: ${NODES.map(n => n.id).join(', ')}`);
  console.log('   Press Ctrl+C to stop\n');

  setInterval(() => {
    for (const node of NODES) {
      const reading = generateReading(node.id);

      client.publish('sensor/data', JSON.stringify(reading), { qos: 1 }, (err) => {
        if (err) {
          console.error(`Publish error for ${node.id}: ${err.message}`);
        } else {
          const sp = nodeState[node.id].spoilageProgress;
          console.log(
            `[${new Date().toLocaleTimeString()}] ${node.id} → T:${reading.dht_temp}°C H:${reading.dht_hum}% CO2:${reading.co2}ppm air:${reading.air_alert} eth:${reading.ethanol_alert} (spoilage: ${Math.round(sp * 100)}%)`
          );
        }
      });
    }
  }, INTERVAL_MS);
});

client.on('error', (err) => {
  console.error(`MQTT error: ${err.message}`);
});

client.on('close', () => {
  console.log('MQTT connection closed');
});

process.on('SIGINT', () => {
  console.log('\nShutting down simulator...');
  client.end();
  process.exit(0);
});
