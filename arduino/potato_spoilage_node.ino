/*
 * ============================================================================
 *  Potato Spoilage Detection System — Arduino Sensor Node
 * ============================================================================
 *  Board   : ESP32 DevKit V1  (Arduino IDE 2.3.8)
 *  Sensors :
 *    • DHT22            — Temperature & Humidity
 *    • MH-Z19B (UART)   — CO₂ (ppm)
 *    • MQ-3  (analog)   — Ethylene proxy (ppm)
 *    • MQ-135 (analog)  — General gas quality (raw ADC)
 *
 *  Protocol: MQTT → Mosquitto Broker → Node.js Backend
 *
 *  MQTT Topic:  potato/node/<NODE_ID>/data
 *  Payload (JSON):
 *    {
 *      "node_id":       "node_01",
 *      "timestamp":     1712345678,       // Unix epoch seconds
 *      "temperature":   25.4,             // °C
 *      "humidity":      78.2,             // %RH
 *      "co2_ppm":       820,              // ppm
 *      "ethylene_ppm":  3.7,              // ppm (estimated)
 *      "gas_raw":       1540              // ADC 0-4095
 *    }
 *
 * ============================================================================
 *  REQUIRED LIBRARIES (Install via Arduino IDE Library Manager):
 *    1. WiFi              (built-in with ESP32 board package)
 *    2. PubSubClient       by Nick O'Leary   (v2.8+)
 *    3. DHT sensor library by Adafruit       (v1.4+)
 *    4. ArduinoJson        by Benoit Blanchon (v7.x)
 *    5. MHZ19              by Jonathan Dempsey(v1.5+)
 *
 *  BOARD MANAGER:
 *    Add ESP32 board URL in File → Preferences → Additional Board Manager URLs:
 *      https://espressif.github.io/arduino-esp32/package_esp32_index.json
 *    Then install "esp32 by Espressif Systems" (v2.0.x+) from Board Manager.
 *
 *  SELECT BOARD:
 *    Tools → Board → ESP32 Arduino → "ESP32 Dev Module"
 * ============================================================================
 */

// ─────────────────────────── Includes ───────────────────────────
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <MHZ19.h>
#include <HardwareSerial.h>

// ─────────────────────────── USER CONFIGURATION ─────────────────
// ⚠️  CHANGE THESE VALUES TO MATCH YOUR SETUP

// Wi-Fi credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";       // ← Your Wi-Fi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // ← Your Wi-Fi password

// MQTT Broker (IP of the machine running Mosquitto/Docker)
const char* MQTT_BROKER   = "192.168.1.100";         // ← Your server IP
const int   MQTT_PORT     = 1883;

// Unique identifier for this sensor node
const char* NODE_ID       = "node_01";               // ← Change per node

// Sensor reading interval (milliseconds)
const unsigned long READ_INTERVAL_MS = 10000;        // 10 seconds

// ─────────────────────────── PIN DEFINITIONS ────────────────────
//  ┌─────────────────────────────────────────────────────────────┐
//  │  ESP32 Pin    │  Sensor          │  Connection              │
//  ├───────────────┼──────────────────┼──────────────────────────┤
//  │  GPIO 4       │  DHT22 DATA      │  + 10kΩ pull-up to 3.3V │
//  │  GPIO 34      │  MQ-135 AOUT     │  Analog input            │
//  │  GPIO 35      │  MQ-3  AOUT      │  Analog input            │
//  │  GPIO 16 (RX) │  MH-Z19B TX      │  UART RX2                │
//  │  GPIO 17 (TX) │  MH-Z19B RX      │  UART TX2                │
//  │  3.3V / 5V    │  Sensor VCC      │  DHT22=3.3V, MQ/MHZ=5V  │
//  │  GND          │  Sensor GND      │  Common ground           │
//  └─────────────────────────────────────────────────────────────┘

#define DHT_PIN           4
#define DHT_TYPE          DHT22
#define MQ135_PIN         34      // General gas quality (analog)
#define MQ3_PIN           35      // Ethylene proxy (analog)
#define MHZ19_RX          16      // ESP32 RX2 ← MH-Z19B TX
#define MHZ19_TX          17      // ESP32 TX2 → MH-Z19B RX

// ─────────────────────────── STATUS LED ─────────────────────────
#define LED_PIN           2       // On-board LED (most ESP32 boards)

// ─────────────────────────── MQ-3 Calibration ───────────────────
// Approximate conversion from raw ADC (0-4095) to ethylene ppm.
// These values should be calibrated for your specific MQ-3 sensor.
// Formula: ethylene_ppm = ADC_VALUE * SCALE_FACTOR
// Default: maps 0-4095 ADC range to roughly 0-50 ppm
const float MQ3_SCALE_FACTOR = 50.0 / 4095.0;

// ─────────────────────────── Global Objects ─────────────────────
DHT            dht(DHT_PIN, DHT_TYPE);
MHZ19          mhz19;
HardwareSerial mhzSerial(2);    // UART2 for MH-Z19B
WiFiClient     espClient;
PubSubClient   mqttClient(espClient);

// ─────────────────────────── State ──────────────────────────────
unsigned long  lastReadTime   = 0;
unsigned long  lastBlinkTime  = 0;
bool           ledState       = false;
char           mqttTopic[64];  // Built once in setup()

// ─────────────────────────── NTP (Timestamp) ────────────────────
#include <time.h>
const char* NTP_SERVER   = "pool.ntp.org";
const long  GMT_OFFSET   = 19800;    // IST = UTC+5:30 = 19800 sec
const int   DST_OFFSET   = 0;

// =====================================================================
//                          SETUP
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("╔══════════════════════════════════════════════╗");
  Serial.println("║   Potato Spoilage Detection — Sensor Node   ║");
  Serial.println("╚══════════════════════════════════════════════╝");
  Serial.printf("  Node ID : %s\n", NODE_ID);
  Serial.println();

  // LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Build MQTT topic once: "potato/node/node_01/data"
  snprintf(mqttTopic, sizeof(mqttTopic), "potato/node/%s/data", NODE_ID);
  Serial.printf("[MQTT] Topic: %s\n", mqttTopic);

  // ─── Initialize Sensors ───
  initDHT();
  initMHZ19();
  initAnalogSensors();

  // ─── Connect Wi-Fi ───
  connectWiFi();

  // ─── Sync Time via NTP ───
  configTime(GMT_OFFSET, DST_OFFSET, NTP_SERVER);
  Serial.println("[NTP]  Synchronizing time...");
  waitForNTP();

  // ─── Configure MQTT ───
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(512);  // Ensure enough room for JSON payload

  Serial.println();
  Serial.println("[READY] Entering main loop...");
  Serial.println("─────────────────────────────────────────────");
}

// =====================================================================
//                          LOOP
// =====================================================================
void loop() {
  // Ensure MQTT stays connected
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Blink LED to show we're alive (toggle every 1s)
  if (millis() - lastBlinkTime >= 1000) {
    lastBlinkTime = millis();
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
  }

  // Read sensors and publish at the configured interval
  if (millis() - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = millis();
    readAndPublish();
  }
}

// =====================================================================
//                    SENSOR INITIALIZATION
// =====================================================================

void initDHT() {
  dht.begin();
  Serial.println("[DHT22]  Initialized on GPIO " + String(DHT_PIN));
}

void initMHZ19() {
  mhzSerial.begin(9600, SERIAL_8N1, MHZ19_RX, MHZ19_TX);
  mhz19.begin(mhzSerial);
  mhz19.autoCalibration(false);   // Disable ABC for storage environments
  Serial.println("[MH-Z19B] Initialized on UART2 (RX=" + String(MHZ19_RX) + ", TX=" + String(MHZ19_TX) + ")");
  Serial.println("[MH-Z19B] Note: Sensor needs 3-minute warm-up for accurate CO2 readings.");
}

void initAnalogSensors() {
  // ESP32 ADC is 12-bit by default (0-4095)
  analogReadResolution(12);
  Serial.println("[MQ-135] Analog input on GPIO " + String(MQ135_PIN));
  Serial.println("[MQ-3]   Analog input on GPIO " + String(MQ3_PIN) + " (ethylene proxy)");
}

// =====================================================================
//                    WI-FI CONNECTION
// =====================================================================

void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 40) {  // 20 second timeout
      Serial.println("\n[WiFi] ✘ Connection failed! Restarting...");
      ESP.restart();
    }
  }

  Serial.println();
  Serial.printf("[WiFi] ✔ Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[WiFi]   RSSI: %d dBm\n", WiFi.RSSI());
}

// =====================================================================
//                    NTP TIME SYNC
// =====================================================================

void waitForNTP() {
  struct tm timeinfo;
  int retries = 0;
  while (!getLocalTime(&timeinfo) && retries < 10) {
    Serial.print(".");
    delay(1000);
    retries++;
  }

  if (retries >= 10) {
    Serial.println("\n[NTP]  ⚠ Time sync failed. Timestamps will use millis().");
  } else {
    char buf[64];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    Serial.printf("\n[NTP]  ✔ Time synchronized: %s\n", buf);
  }
}

/**
 * Get current Unix timestamp (seconds since epoch).
 * Falls back to millis()/1000 if NTP hasn't synced.
 */
unsigned long getUnixTimestamp() {
  time_t now;
  time(&now);
  if (now < 1000000000) {
    // NTP not yet synced — use millis as fallback
    return millis() / 1000;
  }
  return (unsigned long)now;
}

// =====================================================================
//                    MQTT CONNECTION
// =====================================================================

void reconnectMQTT() {
  int retries = 0;
  while (!mqttClient.connected() && retries < 5) {
    Serial.printf("[MQTT] Connecting to %s:%d ... ", MQTT_BROKER, MQTT_PORT);

    // Create a unique client ID
    String clientId = "potato_" + String(NODE_ID) + "_" + String(random(0xffff), HEX);

    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("✔ Connected!");
    } else {
      Serial.printf("✘ Failed (rc=%d). Retrying in 5s...\n", mqttClient.state());
      delay(5000);
      retries++;
    }
  }

  if (!mqttClient.connected()) {
    Serial.println("[MQTT] ✘ Could not connect after 5 attempts. Will retry next loop.");
  }
}

// =====================================================================
//                 READ SENSORS & PUBLISH
// =====================================================================

void readAndPublish() {
  Serial.println();
  Serial.println("┌──── Reading Sensors ────────────────────────┐");

  // ─── DHT22: Temperature & Humidity ───
  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("│ [DHT22]  ✘ Read failed! Check wiring.      │");
    Serial.println("└─────────────────────────────────────────────┘");
    return;  // Skip this cycle — don't publish partial data
  }

  Serial.printf("│ [DHT22]  Temp: %.1f°C   Humidity: %.1f%%     \n", temperature, humidity);

  // ─── MH-Z19B: CO₂ ───
  int co2_ppm = mhz19.getCO2();
  if (co2_ppm < 0 || co2_ppm > 50000) {
    Serial.println("│ [MH-Z19B] ⚠ Invalid CO2 reading, using 400 │");
    co2_ppm = 400;  // Ambient baseline fallback
  }
  Serial.printf("│ [MH-Z19B] CO₂: %d ppm                      \n", co2_ppm);

  // ─── MQ-3: Ethylene (estimated) ───
  int mq3_raw = analogRead(MQ3_PIN);
  float ethylene_ppm = mq3_raw * MQ3_SCALE_FACTOR;
  // Clamp to valid range
  ethylene_ppm = constrain(ethylene_ppm, 0.0, 1000.0);
  Serial.printf("│ [MQ-3]   Raw: %d  →  Ethylene: %.2f ppm     \n", mq3_raw, ethylene_ppm);

  // ─── MQ-135: General Gas (raw ADC) ───
  int gas_raw = analogRead(MQ135_PIN);
  gas_raw = constrain(gas_raw, 0, 10000);
  Serial.printf("│ [MQ-135]  Gas Raw: %d                        \n", gas_raw);

  // ─── Timestamp ───
  unsigned long timestamp = getUnixTimestamp();
  Serial.printf("│ [TIME]   Epoch: %lu                          \n", timestamp);

  Serial.println("└─────────────────────────────────────────────┘");

  // ─── Build JSON Payload ───
  JsonDocument doc;
  doc["node_id"]       = NODE_ID;
  doc["timestamp"]     = timestamp;
  doc["temperature"]   = round(temperature * 10.0) / 10.0;   // 1 decimal
  doc["humidity"]      = round(humidity * 10.0) / 10.0;       // 1 decimal
  doc["co2_ppm"]       = co2_ppm;
  doc["ethylene_ppm"]  = round(ethylene_ppm * 100.0) / 100.0; // 2 decimals
  doc["gas_raw"]       = gas_raw;

  char payload[256];
  size_t len = serializeJson(doc, payload, sizeof(payload));

  // ─── Publish via MQTT ───
  if (mqttClient.connected()) {
    bool success = mqttClient.publish(mqttTopic, payload, false);  // QoS 0
    if (success) {
      Serial.printf("[MQTT] ✔ Published %d bytes to %s\n", len, mqttTopic);
    } else {
      Serial.println("[MQTT] ✘ Publish failed!");
    }
  } else {
    Serial.println("[MQTT] ✘ Not connected — data lost this cycle.");
  }

  // Debug: print raw JSON
  Serial.printf("[JSON] %s\n", payload);
  Serial.println("─────────────────────────────────────────────");
}
