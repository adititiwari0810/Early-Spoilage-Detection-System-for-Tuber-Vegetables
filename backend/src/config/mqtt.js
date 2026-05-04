import mqtt from 'mqtt';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

class MqttClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
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

        // Subscribe to the hardware's topic
        const topic = 'sensor/data';
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
   * Parse the ESP8266 hardware JSON format from sensor/data topic.
   *
   * Incoming JSON:
   * {
   *   "device": "esp8266_1",
   *   "dht_temp": 34.8,
   *   "dht_hum": 8,
   *   "ambient_temp_est": 34.4,
   *   "ambient_hum_est": 11.0,
   *   "co2": 550,
   *   "air_alert": 0,
   *   "ethanol_alert": 0
   * }
   *
   * Normalized to internal format:
   * {
   *   node_id, timestamp, temperature, humidity,
   *   co2_ppm, air_alert, ethanol_alert,
   *   ambient_temp_est, ambient_hum_est
   * }
   */
  _handleMessage(topic, message) {
    if (topic !== 'sensor/data') return;

    let rawData;
    let data;

    try {
      rawData = JSON.parse(message.toString());

      data = {
        node_id:           rawData.device || 'esp8266_1',
        timestamp:         Math.floor(Date.now() / 1000),
        temperature:       parseFloat(rawData.dht_temp) || 25.0,
        humidity:          parseFloat(rawData.dht_hum) || 50.0,
        co2_ppm:           parseInt(rawData.co2, 10) || 400,
        air_alert:         rawData.air_alert === 1 || rawData.air_alert === true ? 1 : 0,
        ethanol_alert:     rawData.ethanol_alert === 1 || rawData.ethanol_alert === true ? 1 : 0,
        ambient_temp_est:  parseFloat(rawData.ambient_temp_est) || null,
        ambient_hum_est:   parseFloat(rawData.ambient_hum_est) || null,
      };
    } catch (err) {
      logger.warn(`Failed to parse sensor/data JSON: ${err.message}`);
      return;
    }

    // Validate value ranges
    if (!this._validateRanges(data)) {
      logger.warn(`Out-of-range values from ${data.node_id}, discarding`);
      return;
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
    if (typeof data.timestamp !== 'number' || data.timestamp < 0) return false;
    // air_alert and ethanol_alert are 0 or 1, no strict range needed
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
