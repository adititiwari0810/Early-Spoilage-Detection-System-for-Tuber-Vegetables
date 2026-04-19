/*
 * ============================================================================
 *  Potato Spoilage Detection — SIMULATOR (No Sensors Required)
 * ============================================================================
 *  Board   : ESP32 DevKit V1  (Arduino IDE 2.3.8)
 *
 *  This sketch generates realistic simulated sensor data and publishes it
 *  via MQTT. Use this to test the full pipeline (MQTT → Backend → Dashboard)
 *  without needing physical sensors.
 *
 *  The simulator models a potato storage room that gradually deteriorates:
 *    - Temperature slowly rises
 *    - Humidity increases
 *    - CO₂ and ethylene build up over time
 *    - Random noise is added for realism
 *    - Occasional anomaly spikes simulate sudden spoilage events
 *
 * ============================================================================
 *  REQUIRED LIBRARIES:
 *    1. WiFi              (built-in with ESP32)
 *    2. PubSubClient       by Nick O'Leary
 *    3. ArduinoJson        by Benoit Blanchon
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <math.h>

// ─────────────────────────── USER CONFIGURATION ─────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_BROKER   = "192.168.1.100";
const int   MQTT_PORT     = 1883;
const char* NODE_ID       = "node_sim";    // Simulated node ID

// Publishing interval
const unsigned long READ_INTERVAL_MS = 5000;  // 5 seconds (faster for testing)

// NTP
const char* NTP_SERVER = "pool.ntp.org";
const long  GMT_OFFSET = 19800;  // IST
const int   DST_OFFSET = 0;

// ─────────────────────────── Simulation Parameters ──────────────

// Baseline values (fresh potatoes, well-ventilated cold storage)
const float BASE_TEMP       = 8.0;    // °C  (ideal: 7-10°C)
const float BASE_HUMIDITY   = 85.0;   // %   (ideal: 85-90%)
const float BASE_CO2        = 450.0;  // ppm (near ambient)
const float BASE_ETHYLENE   = 0.5;    // ppm (minimal)
const int   BASE_GAS_RAW    = 200;    // ADC

// Drift rates (per hour — how fast environment degrades)
const float TEMP_DRIFT_PER_HR     = 0.3;   // °C/hour rise
const float HUMIDITY_DRIFT_PER_HR = 0.2;   // %/hour rise
const float CO2_DRIFT_PER_HR      = 50.0;  // ppm/hour rise
const float ETH_DRIFT_PER_HR      = 0.4;   // ppm/hour rise
const float GAS_DRIFT_PER_HR      = 15.0;  // ADC/hour rise

// Noise amplitude (random variation)
const float TEMP_NOISE     = 0.5;
const float HUMIDITY_NOISE = 1.0;
const float CO2_NOISE      = 30.0;
const float ETH_NOISE      = 0.3;
const int   GAS_NOISE      = 50;

// Anomaly probability (per reading)
const float ANOMALY_PROBABILITY = 0.03;  // 3% chance per reading

// ─────────────────────────── Simulation Modes ───────────────────
enum SimMode {
  MODE_GRADUAL_DECAY,    // Slow deterioration over time
  MODE_STABLE_FRESH,     // Rock-steady fresh environment
  MODE_RAPID_SPOILAGE,   // Fast deterioration (demo mode)
};

// Change this to select simulation behavior
SimMode currentMode = MODE_GRADUAL_DECAY;

// ─────────────────────────── Global Objects ─────────────────────
WiFiClient   espClient;
PubSubClient mqttClient(espClient);

unsigned long lastReadTime  = 0;
unsigned long startTime     = 0;
unsigned long readingCount  = 0;
char          mqttTopic[64];

#define LED_PIN 2

// =====================================================================
//                          SETUP
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("╔══════════════════════════════════════════════╗");
  Serial.println("║   Potato Spoilage — SIMULATOR Node          ║");
  Serial.println("╚══════════════════════════════════════════════╝");
  Serial.printf("  Node ID : %s\n", NODE_ID);
  Serial.printf("  Mode    : %s\n", getModeName());
  Serial.println();

  pinMode(LED_PIN, OUTPUT);

  snprintf(mqttTopic, sizeof(mqttTopic), "potato/node/%s/data", NODE_ID);
  Serial.printf("[MQTT] Topic: %s\n", mqttTopic);

  // Connect Wi-Fi
  connectWiFi();

  // Sync time
  configTime(GMT_OFFSET, DST_OFFSET, NTP_SERVER);
  waitForNTP();

  // Configure MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(512);

  startTime = millis();

  Serial.println();
  Serial.println("[READY] Simulator running...");
  Serial.println("─────────────────────────────────────────────");
}

// =====================================================================
//                          LOOP
// =====================================================================
void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  if (millis() - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = millis();
    simulateAndPublish();
  }
}

// =====================================================================
//                    SIMULATION ENGINE
// =====================================================================

/**
 * Generate Gaussian noise using Box-Muller transform.
 */
float gaussianNoise(float stddev) {
  float u1 = random(1, 10000) / 10000.0;
  float u2 = random(1, 10000) / 10000.0;
  float z  = sqrt(-2.0 * log(u1)) * cos(2.0 * PI * u2);
  return z * stddev;
}

/**
 * Get hours elapsed since simulation started.
 */
float hoursElapsed() {
  return (millis() - startTime) / 3600000.0;
}

/**
 * Generate simulated sensor values based on current mode and time elapsed.
 */
void simulateAndPublish() {
  readingCount++;
  float hours = hoursElapsed();

  float temperature, humidity, co2, ethylene;
  int   gasRaw;

  switch (currentMode) {
    case MODE_STABLE_FRESH:
      // Minimal drift, just noise
      temperature = BASE_TEMP     + gaussianNoise(TEMP_NOISE * 0.3);
      humidity    = BASE_HUMIDITY  + gaussianNoise(HUMIDITY_NOISE * 0.3);
      co2         = BASE_CO2      + gaussianNoise(CO2_NOISE * 0.3);
      ethylene    = BASE_ETHYLENE + gaussianNoise(ETH_NOISE * 0.3);
      gasRaw      = BASE_GAS_RAW  + (int)gaussianNoise(GAS_NOISE * 0.3);
      break;

    case MODE_RAPID_SPOILAGE:
      // 10x faster degradation — useful for demos
      temperature = BASE_TEMP     + (TEMP_DRIFT_PER_HR * 10.0 * hours)   + gaussianNoise(TEMP_NOISE);
      humidity    = BASE_HUMIDITY  + (HUMIDITY_DRIFT_PER_HR * 10.0 * hours) + gaussianNoise(HUMIDITY_NOISE);
      co2         = BASE_CO2      + (CO2_DRIFT_PER_HR * 10.0 * hours)    + gaussianNoise(CO2_NOISE);
      ethylene    = BASE_ETHYLENE + (ETH_DRIFT_PER_HR * 10.0 * hours)    + gaussianNoise(ETH_NOISE);
      gasRaw      = BASE_GAS_RAW  + (int)(GAS_DRIFT_PER_HR * 10.0 * hours) + (int)gaussianNoise(GAS_NOISE);
      break;

    case MODE_GRADUAL_DECAY:
    default:
      // Realistic slow decay
      temperature = BASE_TEMP     + (TEMP_DRIFT_PER_HR * hours)     + gaussianNoise(TEMP_NOISE);
      humidity    = BASE_HUMIDITY  + (HUMIDITY_DRIFT_PER_HR * hours)  + gaussianNoise(HUMIDITY_NOISE);
      co2         = BASE_CO2      + (CO2_DRIFT_PER_HR * hours)      + gaussianNoise(CO2_NOISE);
      ethylene    = BASE_ETHYLENE + (ETH_DRIFT_PER_HR * hours)      + gaussianNoise(ETH_NOISE);
      gasRaw      = BASE_GAS_RAW  + (int)(GAS_DRIFT_PER_HR * hours) + (int)gaussianNoise(GAS_NOISE);
      break;
  }

  // ─── Inject Random Anomaly ───
  bool isAnomaly = (random(0, 10000) / 10000.0) < ANOMALY_PROBABILITY;
  if (isAnomaly) {
    // Spike one random metric
    int metric = random(0, 4);
    switch (metric) {
      case 0: temperature += 12.0 + gaussianNoise(3.0); break;  // Sudden temp spike
      case 1: humidity    += 10.0 + gaussianNoise(2.0); break;  // Humidity surge
      case 2: co2         += 1500 + gaussianNoise(300); break;  // CO₂ burst
      case 3: ethylene    += 8.0  + gaussianNoise(2.0); break;  // Ethylene spike
    }
    Serial.println("⚡ ANOMALY INJECTED!");
  }

  // ─── Clamp to Valid Ranges ───
  temperature = constrain(temperature, -50.0, 80.0);
  humidity    = constrain(humidity,      0.0, 100.0);
  co2         = constrain(co2,           0.0, 50000.0);
  ethylene    = constrain(ethylene,      0.0, 1000.0);
  gasRaw      = constrain(gasRaw,        0,   10000);

  // ─── Timestamp ───
  unsigned long timestamp = getUnixTimestamp();

  // ─── Print ───
  Serial.printf("[#%lu | %.1fh] T:%.1f°C  H:%.1f%%  CO₂:%d  C₂H₄:%.2f  Gas:%d %s\n",
    readingCount, hours,
    temperature, humidity, (int)co2, ethylene, gasRaw,
    isAnomaly ? "⚡" : ""
  );

  // ─── Build JSON ───
  JsonDocument doc;
  doc["node_id"]       = NODE_ID;
  doc["timestamp"]     = timestamp;
  doc["temperature"]   = round(temperature * 10.0) / 10.0;
  doc["humidity"]      = round(humidity * 10.0) / 10.0;
  doc["co2_ppm"]       = (int)co2;
  doc["ethylene_ppm"]  = round(ethylene * 100.0) / 100.0;
  doc["gas_raw"]       = gasRaw;

  char payload[256];
  size_t len = serializeJson(doc, payload, sizeof(payload));

  // ─── Publish ───
  if (mqttClient.connected()) {
    bool ok = mqttClient.publish(mqttTopic, payload, false);
    if (ok) {
      Serial.printf("[MQTT] ✔ Published → %s\n", mqttTopic);
      // Quick blink on publish
      digitalWrite(LED_PIN, HIGH);
      delay(50);
      digitalWrite(LED_PIN, LOW);
    } else {
      Serial.println("[MQTT] ✘ Publish failed");
    }
  } else {
    Serial.println("[MQTT] ✘ Not connected");
  }
}

// =====================================================================
//                    HELPERS
// =====================================================================

const char* getModeName() {
  switch (currentMode) {
    case MODE_STABLE_FRESH:    return "STABLE_FRESH (minimal drift)";
    case MODE_RAPID_SPOILAGE:  return "RAPID_SPOILAGE (10x speed)";
    case MODE_GRADUAL_DECAY:   return "GRADUAL_DECAY (realistic)";
    default:                   return "UNKNOWN";
  }
}

unsigned long getUnixTimestamp() {
  time_t now;
  time(&now);
  if (now < 1000000000) return millis() / 1000;
  return (unsigned long)now;
}

void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++attempts > 40) {
      Serial.println("\n[WiFi] ✘ Failed. Restarting...");
      ESP.restart();
    }
  }
  Serial.printf("\n[WiFi] ✔ Connected! IP: %s  RSSI: %d dBm\n",
    WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

void waitForNTP() {
  Serial.print("[NTP]  Syncing");
  struct tm t;
  int retries = 0;
  while (!getLocalTime(&t) && retries < 10) {
    Serial.print(".");
    delay(1000);
    retries++;
  }
  if (retries < 10) {
    char buf[64];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &t);
    Serial.printf("\n[NTP]  ✔ %s\n", buf);
  } else {
    Serial.println("\n[NTP]  ⚠ Failed, using millis()");
  }
}

void reconnectMQTT() {
  int retries = 0;
  while (!mqttClient.connected() && retries < 5) {
    Serial.printf("[MQTT] Connecting to %s:%d ... ", MQTT_BROKER, MQTT_PORT);
    String cid = "sim_" + String(NODE_ID) + "_" + String(random(0xffff), HEX);
    if (mqttClient.connect(cid.c_str())) {
      Serial.println("✔ Connected!");
    } else {
      Serial.printf("✘ rc=%d, retrying...\n", mqttClient.state());
      delay(5000);
      retries++;
    }
  }
}
