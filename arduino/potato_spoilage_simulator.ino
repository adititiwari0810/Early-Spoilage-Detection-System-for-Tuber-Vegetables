/*
 * ============================================================================
 *  Early Spoilage Detection — SIMULATOR (No Sensors Required)
 * ============================================================================
 *  Board   : ESP8266 NodeMCU  (or ESP32 — both work)
 *
 *  This sketch generates realistic simulated sensor data and publishes it
 *  via MQTT in the EXACT same JSON format as the real hardware sketch.
 *  Use this to test the full pipeline (MQTT → Backend → Dashboard)
 *  without needing physical sensors.
 *
 *  The simulator models a storage room that gradually deteriorates:
 *    - Temperature slowly rises
 *    - Humidity increases
 *    - CO₂ builds up over time (MG811 style)
 *    - MQ-135 and MQ-3 digital alerts trigger at thresholds
 *
 *  MQTT Topic : sensor/data
 *  Payload    : matches real hardware exactly
 *
 * ============================================================================
 *  REQUIRED LIBRARIES:
 *    1. ESP8266WiFi (built-in) or WiFi (ESP32 built-in)
 *    2. PubSubClient       by Nick O'Leary
 * ============================================================================
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <math.h>

// ─────────────────────────── USER CONFIGURATION ─────────────────
const char* ssid        = "moto g45 5G_6614";
const char* password    = "Abhay151";
const char* mqtt_server = "10.73.26.253";
const char* DEVICE_ID   = "esp8266_sim";

// Publishing interval (500ms matches real hardware)
const unsigned long PUBLISH_INTERVAL_MS = 500;

// ─────────────────────────── Simulation Parameters ──────────────

// Baseline values (fresh produce, well-ventilated storage)
const float BASE_TEMP       = 25.0;   // °C
const float BASE_HUMIDITY   = 40.0;   // %
const float BASE_CO2        = 500.0;  // ppm (MG811 calibrated)

// Drift rates (per hour — how fast environment degrades)
const float TEMP_DRIFT_PER_HR     = 0.5;   // °C/hour rise
const float HUMIDITY_DRIFT_PER_HR = 0.3;   // %/hour rise
const float CO2_DRIFT_PER_HR      = 80.0;  // ppm/hour rise

// Noise amplitude (random variation)
const float TEMP_NOISE     = 0.3;
const float HUMIDITY_NOISE = 1.0;
const float CO2_NOISE      = 20.0;

// Digital alert thresholds (simulated MQ sensor trigger points)
const float AIR_ALERT_CO2_THRESHOLD    = 1200.0;  // CO₂ ppm above which MQ-135 would trigger
const float ETHANOL_ALERT_TEMP_THRESHOLD = 32.0;  // Temp above which ethanol off-gassing starts

// Anomaly probability (per reading)
const float ANOMALY_PROBABILITY = 0.02;  // 2% chance per reading

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
PubSubClient client(espClient);

unsigned long lastPublishTime = 0;
unsigned long startTime       = 0;
unsigned long readingCount    = 0;

// =====================================================================
//                          SETUP
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("========================================");
  Serial.println("  Spoilage Detection — SIMULATOR");
  Serial.println("========================================");
  Serial.printf("  Device  : %s\n", DEVICE_ID);
  Serial.printf("  Mode    : %s\n", getModeName());
  Serial.println();

  // Connect Wi-Fi
  Serial.printf("[WiFi] Connecting to %s ", ssid);
  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
  } else {
    Serial.println("\n[WiFi] Failed! Restarting...");
    ESP.restart();
  }

  // Configure MQTT
  client.setServer(mqtt_server, 1883);

  startTime = millis();
  Serial.println("[READY] Simulator running...");
  Serial.println("----------------------------------------");
}

// =====================================================================
//                          LOOP
// =====================================================================
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  if (millis() - lastPublishTime >= PUBLISH_INTERVAL_MS) {
    lastPublishTime = millis();
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
 * Generate simulated sensor values and publish in the hardware's JSON format.
 */
void simulateAndPublish() {
  readingCount++;
  float hours = hoursElapsed();

  float dhtTemp, dhtHum, co2;

  switch (currentMode) {
    case MODE_STABLE_FRESH:
      dhtTemp = BASE_TEMP     + gaussianNoise(TEMP_NOISE * 0.3);
      dhtHum  = BASE_HUMIDITY + gaussianNoise(HUMIDITY_NOISE * 0.3);
      co2     = BASE_CO2      + gaussianNoise(CO2_NOISE * 0.3);
      break;

    case MODE_RAPID_SPOILAGE:
      dhtTemp = BASE_TEMP     + (TEMP_DRIFT_PER_HR * 10.0 * hours)     + gaussianNoise(TEMP_NOISE);
      dhtHum  = BASE_HUMIDITY + (HUMIDITY_DRIFT_PER_HR * 10.0 * hours)  + gaussianNoise(HUMIDITY_NOISE);
      co2     = BASE_CO2      + (CO2_DRIFT_PER_HR * 10.0 * hours)      + gaussianNoise(CO2_NOISE);
      break;

    case MODE_GRADUAL_DECAY:
    default:
      dhtTemp = BASE_TEMP     + (TEMP_DRIFT_PER_HR * hours)     + gaussianNoise(TEMP_NOISE);
      dhtHum  = BASE_HUMIDITY + (HUMIDITY_DRIFT_PER_HR * hours)  + gaussianNoise(HUMIDITY_NOISE);
      co2     = BASE_CO2      + (CO2_DRIFT_PER_HR * hours)      + gaussianNoise(CO2_NOISE);
      break;
  }

  // ─── Inject Random Anomaly ───
  bool isAnomaly = (random(0, 10000) / 10000.0) < ANOMALY_PROBABILITY;
  if (isAnomaly) {
    int metric = random(0, 3);
    switch (metric) {
      case 0: dhtTemp += 10.0 + gaussianNoise(2.0); break;
      case 1: dhtHum  += 15.0 + gaussianNoise(3.0); break;
      case 2: co2     += 1500 + gaussianNoise(200);  break;
    }
    Serial.println(">>> ANOMALY INJECTED!");
  }

  // ─── Clamp to Valid Ranges ───
  dhtTemp = constrain(dhtTemp, -10.0, 60.0);
  dhtHum  = constrain(dhtHum,   0.0, 100.0);
  co2     = constrain(co2,    400.0, 5000.0);

  // ─── Compute derived values (matching real hardware) ───
  float ambientTempEst = dhtTemp - 0.4;
  float ambientHumEst  = dhtHum + 3.0;

  // Simulate digital alerts (MQ-135 and MQ-3 trigger at thresholds)
  int airAlert     = (co2 > AIR_ALERT_CO2_THRESHOLD) ? 1 : 0;
  int ethanolAlert = (dhtTemp > ETHANOL_ALERT_TEMP_THRESHOLD) ? 1 : 0;

  // ─── Print ───
  Serial.printf("[#%lu | %.1fh] T:%.1f H:%.0f CO2:%d air:%d eth:%d %s\n",
    readingCount, hours,
    dhtTemp, dhtHum, (int)co2, airAlert, ethanolAlert,
    isAnomaly ? ">>>" : ""
  );

  // ─── Build JSON (same format as real hardware) ───
  String payload = "{";
  payload += "\"device\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"dht_temp\":" + String(dhtTemp, 1) + ",";
  payload += "\"dht_hum\":" + String(dhtHum, 0) + ",";
  payload += "\"ambient_temp_est\":" + String(ambientTempEst, 1) + ",";
  payload += "\"ambient_hum_est\":" + String(ambientHumEst, 1) + ",";
  payload += "\"co2\":" + String((int)co2) + ",";
  payload += "\"air_alert\":" + String(airAlert) + ",";
  payload += "\"ethanol_alert\":" + String(ethanolAlert);
  payload += "}";

  // ─── Publish ───
  if (client.connected()) {
    bool ok = client.publish("sensor/data", payload.c_str());
    if (ok) {
      Serial.println("[MQTT] Published OK");
    } else {
      Serial.println("[MQTT] Publish failed");
    }
  } else {
    Serial.println("[MQTT] Not connected");
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

void reconnect() {
  int retries = 0;
  while (!client.connected() && retries < 5) {
    Serial.printf("[MQTT] Connecting to %s ... ", mqtt_server);
    String cid = "sim_" + String(DEVICE_ID) + "_" + String(random(0xffff), HEX);
    if (client.connect(cid.c_str())) {
      Serial.println("Connected!");
    } else {
      Serial.printf("Failed rc=%d, retrying...\n", client.state());
      delay(2000);
      retries++;
    }
  }
}
