import mqtt from 'mqtt';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class MqttClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.topicPrefix = process.env.MQTT_TOPIC_PREFIX || 'potato/node';
  }

  /**
   * Connect to the MQTT broker with exponential backoff reconnect.
   */
  async connect() {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(brokerUrl, {
        reconnectPeriod: 0, // We handle reconnect manually
        connectTimeout: 10000,
        clean: true,
      });

      this.client.on('connect', () => {
        logger.info(`MQTT connected to ${brokerUrl}`);
        this.reconnectDelay = 1000; // Reset on successful connect

        // Subscribe to all node data topics
        const topic = `${this.topicPrefix}/+/data`;
        this.client.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            logger.error(`MQTT subscribe error: ${err.message}`);
            reject(err);
          } else {
            logger.info(`MQTT subscribed to ${topic}`);
            resolve();
          }
        });
      });

      this.client.on('message', (topic, message) => {
        this._handleMessage(topic, message);
      });

      this.client.on('error', (err) => {
        logger.error(`MQTT error: ${err.message}`);
      });

      this.client.on('close', () => {
        logger.warn('MQTT connection closed, scheduling reconnect...');
        this._scheduleReconnect();
      });

      this.client.on('offline', () => {
        logger.warn('MQTT client offline');
      });

      // Timeout for initial connection
      setTimeout(() => {
        if (!this.client.connected) {
          logger.warn('MQTT initial connection timeout, will retry in background');
          resolve(); // Don't block server startup
        }
      }, 5000);
    });
  }

  /**
   * Exponential backoff reconnect with cap.
   */
  _scheduleReconnect() {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);

    logger.info(`MQTT reconnecting in ${delay}ms...`);
    setTimeout(() => {
      if (this.client && !this.client.connected) {
        this.client.reconnect();
      }
    }, delay);
  }

  /**
   * Parse and validate incoming MQTT messages.
   */
  _handleMessage(topic, message) {
    let data;

    // Safe JSON parse
    try {
      data = JSON.parse(message.toString());
    } catch (err) {
      logger.warn(`Malformed JSON on topic ${topic}: ${err.message}`);
      return;
    }

    // Extract nodeId from topic
    const topicParts = topic.split('/');
    const topicNodeId = topicParts[2];

    // Validate required fields
    const requiredFields = ['node_id', 'timestamp', 'temperature', 'humidity', 'co2_ppm', 'ethylene_ppm', 'gas_raw'];
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        logger.warn(`Missing field '${field}' in message from ${topicNodeId}`);
        return;
      }
    }

    // Validate value ranges
    if (!this._validateRanges(data)) {
      logger.warn(`Out-of-range values from ${data.node_id}, discarding`);
      return;
    }

    // Validate node_id matches topic
    if (data.node_id !== topicNodeId) {
      logger.warn(`node_id mismatch: payload=${data.node_id}, topic=${topicNodeId}`);
      // Use topic nodeId as authoritative
      data.node_id = topicNodeId;
    }

    // Emit validated data
    this.emit('sensor_data', data);
  }

  /**
   * Validate sensor value ranges.
   */
  _validateRanges(data) {
    if (typeof data.temperature !== 'number' || data.temperature < -50 || data.temperature > 80) return false;
    if (typeof data.humidity !== 'number' || data.humidity < 0 || data.humidity > 100) return false;
    if (typeof data.co2_ppm !== 'number' || data.co2_ppm < 0 || data.co2_ppm > 50000) return false;
    if (typeof data.ethylene_ppm !== 'number' || data.ethylene_ppm < 0 || data.ethylene_ppm > 1000) return false;
    if (typeof data.gas_raw !== 'number' || data.gas_raw < 0 || data.gas_raw > 10000) return false;
    if (typeof data.timestamp !== 'number' || data.timestamp < 0) return false;
    return true;
  }

  /**
   * Disconnect cleanly.
   */
  async disconnect() {
    if (this.client) {
      return new Promise((resolve) => {
        this.client.end(false, {}, () => {
          logger.info('MQTT disconnected');
          resolve();
        });
      });
    }
  }
}

// Singleton instance
const mqttClient = new MqttClient();
export default mqttClient;
