import 'dotenv/config';
import mqtt from 'mqtt';

/**
 * Potato Spoilage Sensor Simulator
 * Publishes simulated ESP32 sensor data to MQTT broker.
 * Simulates gradual spoilage progression over time.
 */

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'potato/node';
const INTERVAL_MS = 3000; // Publish every 3 seconds

const NODES = [
  { id: 'potato_node_01', name: 'Storage Room A' },
  { id: 'potato_node_02', name: 'Storage Room B' },
  { id: 'potato_node_03', name: 'Warehouse C' },
];

// Spoilage progression state per node
const nodeState = {};

for (const node of NODES) {
  nodeState[node.id] = {
    spoilageProgress: Math.random() * 0.2, // Start with some randomness
    baseTemp: 18 + Math.random() * 4,      // 18-22°C base
    baseHumidity: 75 + Math.random() * 10,  // 75-85% base
    baseCo2: 600 + Math.random() * 200,     // 600-800 ppm base
    baseEthylene: 0.2 + Math.random() * 0.3,// 0.2-0.5 ppm base
    baseGas: 200 + Math.random() * 50,      // 200-250 raw
  };
}

/**
 * Generate a sensor reading with gradual spoilage progression.
 */
const generateReading = (nodeId) => {
  const state = nodeState[nodeId];

  // Slowly increase spoilage over time
  state.spoilageProgress += 0.001 + Math.random() * 0.002;
  const sp = Math.min(state.spoilageProgress, 1);

  // Add noise + spoilage drift
  const noise = () => (Math.random() - 0.5) * 2;

  const temperature = state.baseTemp + sp * 15 + noise() * 1.5;
  const humidity = Math.min(100, state.baseHumidity + sp * 15 + noise() * 2);
  const co2_ppm = state.baseCo2 + sp * 4000 + noise() * 100;
  const ethylene_ppm = state.baseEthylene + sp * 20 + noise() * 0.5;
  const gas_raw = state.baseGas + sp * 500 + noise() * 20;

  return {
    node_id: nodeId,
    timestamp: Math.floor(Date.now() / 1000),
    temperature: Math.round(temperature * 10) / 10,
    humidity: Math.round(Math.max(0, humidity) * 10) / 10,
    co2_ppm: Math.round(Math.max(0, co2_ppm)),
    ethylene_ppm: Math.round(Math.max(0, ethylene_ppm) * 100) / 100,
    gas_raw: Math.round(Math.max(0, gas_raw)),
  };
};

// ───── Connect and start publishing ─────
const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
  console.log(`🥔 Simulator connected to MQTT broker at ${BROKER_URL}`);
  console.log(`   Publishing for ${NODES.length} nodes every ${INTERVAL_MS}ms`);
  console.log(`   Nodes: ${NODES.map(n => n.id).join(', ')}`);
  console.log('   Press Ctrl+C to stop\n');

  setInterval(() => {
    for (const node of NODES) {
      const reading = generateReading(node.id);
      const topic = `${TOPIC_PREFIX}/${node.id}/data`;

      client.publish(topic, JSON.stringify(reading), { qos: 1 }, (err) => {
        if (err) {
          console.error(`Publish error for ${node.id}: ${err.message}`);
        } else {
          const sp = nodeState[node.id].spoilageProgress;
          console.log(
            `[${new Date().toLocaleTimeString()}] ${node.id} → T:${reading.temperature}°C H:${reading.humidity}% CO2:${reading.co2_ppm}ppm ETH:${reading.ethylene_ppm}ppm (spoilage: ${Math.round(sp * 100)}%)`
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
