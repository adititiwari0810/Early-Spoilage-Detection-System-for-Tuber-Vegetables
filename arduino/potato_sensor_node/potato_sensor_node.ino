/*
 * ════════════════════════════════════════════════════════════════════
 *   POTATO SPOILAGE DETECTION SYSTEM — LITE VERSION (ESP8266)
 * ════════════════════════════════════════════════════════════════════
 *
 *  HARDWARE INCLUDED:
 *    • 1× ESP8266 NodeMCU
 *    • 1× DHT11           — Temperature & Humidity
 *    • 1× MQ-135 (Analog) — Air quality / Gas (raw ADC)
 *    • 1× LCD 16×2 (I2C)  — Local Display
 *    • 1× Buzzer          — Audio Alert
 *    • 1× LED             — Visual Warning (with 220Ω resistor)
 *    • 1× Relay Module    — External action (e.g., exhaust fan)
 *
 *  WIRING TABLE:
 *  ┌────────────┬────────┬──────────────────────────────────────────┐
 *  │ NodeMCU Pin│ GPIO   │ Connected To                             │
 *  ├────────────┼────────┼──────────────────────────────────────────┤
 *  │ D1         │ GPIO5  │ I2C SCL (LCD SCL)                        │
 *  │ D2         │ GPIO4  │ I2C SDA (LCD SDA)                        │
 *  │ D5         │ GPIO14 │ DHT11 DATA (+ 10kΩ pullup to 3V3)      │
 *  │ D6         │ GPIO12 │ LED (+ 220Ω to GND)                     │
 *  │ D7         │ GPIO13 │ Relay IN                                 │
 *  │ D8         │ GPIO15 │ Buzzer (+)                               │
 *  │ A0         │ ADC0   │ MQ-135 Analog Output (AOUT)              │
 *  │ 3V3        │  —     │ DHT11 VCC                                │
 *  │ Vin (5V)   │  —     │ LCD VCC, MQ-135 VCC, Relay VCC         │
 *  │ GND        │  —     │ All component GNDs                       │
 *  └────────────┴────────┴──────────────────────────────────────────┘
 */

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ═══════════════════════ USER CONFIG ════════════════════════
// — Wi-Fi & MQTT —
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_BROKER   = "192.168.1.100";
const int   MQTT_PORT     = 1883;
const char* NODE_ID       = "node_01";

// — Features —
const bool  ENABLE_WIFI   = true;
const bool  ENABLE_BUZZER = true;
const bool  ENABLE_LCD    = true;

const unsigned long SENSOR_INTERVAL_MS = 5000;  // Read every 5 seconds
const unsigned long LCD_ROTATE_MS      = 3000;  // Rotate screen every 3s

// — Alert Thresholds —
const float TEMP_WARNING     = 28.0;
const float TEMP_CRITICAL    = 35.0;
const float HUMIDITY_WARNING = 90.0;
const float HUMIDITY_CRITICAL= 95.0;
const int   MQ135_WARNING    = 400;
const int   MQ135_CRITICAL   = 700;

// ═══════════════════════ PIN DEFINITIONS ════════════════════
#define DHT_PIN       14  // D5
#define LED_PIN       12  // D6 
#define RELAY_PIN     13  // D7
#define BUZZER_PIN    15  // D8
#define MQ135_AO_PIN  A0  // A0

DHT dht(DHT_PIN, DHT11);
LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiClient espClient;
PubSubClient mqtt(espClient);

// ═══════════════════════ GLOBAL STATE ═══════════════════════
float temperature = 0.0;
float humidity    = 0.0;
int   gasRaw      = 0;
int   gasMapped   = 0;

int    alertLevel   = 0; // 0=OK, 1=WARN, 2=CRIT
String alertMessage = "";

unsigned long lastSensorRead = 0;
unsigned long lastLCDRotate  = 0;
int lcdScreen = 0;

// LCD Icons
byte charThermo[8] = {B00100, B01010, B01010, B01010, B01110, B11111, B11111, B01110};
byte charDrop[8]   = {B00100, B00100, B01010, B01010, B10001, B10001, B10001, B01110};
byte charWarn[8]   = {B00100, B00100, B01110, B01010, B11011, B11111, B11011, B11111};
byte charOK[8]     = {B00000, B00001, B00011, B10110, B11100, B01000, B00000, B00000};


void setup() {
  Serial.begin(115200);
  delay(100);
  
  // ── Setup Pins ──
  pinMode(LED_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  digitalWrite(LED_PIN, LOW);
  digitalWrite(RELAY_PIN, LOW); // Relay OFF by default
  digitalWrite(BUZZER_PIN, LOW);

  // ── Setup I2C & LCD ──
  Wire.begin(4, 5); // SDA=D2, SCL=D1
  if (ENABLE_LCD) {
    lcd.init();
    lcd.backlight();
    lcd.createChar(0, charThermo);
    lcd.createChar(1, charDrop);
    lcd.createChar(2, charWarn);
    lcd.createChar(3, charOK);
    lcd.setCursor(0, 0);
    lcd.print(" Potato LITE  ");
    lcd.setCursor(0, 1);
    lcd.print(" Booting...   ");
  }

  // ── Setup Sensors ──
  dht.begin();
  
  // ── Setup WiFi ──
  if (ENABLE_WIFI) {
    Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[WiFi] Connected!");
      mqtt.setServer(MQTT_BROKER, MQTT_PORT);
    } else {
      Serial.println("\n[WiFi] Failed. Running offline.");
    }
  }

  Serial.println("[SYSTEM] Ready!");
}

void loop() {
  // MQTT Keep-Alive
  if (ENABLE_WIFI && WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) reconnectMQTT();
    mqtt.loop();
  }

  // Sensor Reading Cycle
  if (millis() - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = millis();
    readSensors();
    evaluateAlerts();
    handleOutputs();
    printSerial();
    if (ENABLE_WIFI && mqtt.connected()) publishMQTT();
  }

  // LCD Rotation Cycle
  if (ENABLE_LCD && millis() - lastLCDRotate >= LCD_ROTATE_MS) {
    lastLCDRotate = millis();
    updateLCD();
  }
}

void readSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  
  if (!isnan(t)) temperature = t;
  if (!isnan(h)) humidity = h;
  
  // Map MQ-135 0-1023 to 0-10000 for backend spec
  gasRaw = analogRead(MQ135_AO_PIN);
  gasMapped = map(gasRaw, 0, 1023, 0, 10000);
}

void evaluateAlerts() {
  alertLevel = 0;
  alertMessage = "";

  // 1. Temperature Check
  if (temperature >= TEMP_CRITICAL) {
    alertLevel = 2; alertMessage = "CRIT:Temp " + String(temperature,1);
  } else if (temperature >= TEMP_WARNING) {
    alertLevel = max(alertLevel, 1); alertMessage = "WARN:Temp " + String(temperature,1);
  }

  // 2. Humidity Check
  if (humidity >= HUMIDITY_CRITICAL) {
    alertLevel = 2; alertMessage = "CRIT:Hum " + String(humidity,0);
  } else if (humidity >= HUMIDITY_WARNING) {
    alertLevel = max(alertLevel, 1); if(alertMessage=="") alertMessage = "WARN:Hum " + String(humidity,0);
  }

  // 3. Gas Check
  if (gasRaw >= MQ135_CRITICAL) {
    alertLevel = 2; alertMessage = "CRIT:Gas " + String(gasRaw);
  } else if (gasRaw >= MQ135_WARNING) {
    alertLevel = max(alertLevel, 1); if(alertMessage=="") alertMessage = "WARN:Gas " + String(gasRaw);
  }
}

void handleOutputs() {
  if (alertLevel == 0) {
    // NORMAL: Everything Off
    digitalWrite(LED_PIN, LOW);
    digitalWrite(RELAY_PIN, LOW); 
    noTone(BUZZER_PIN);
    
  } else if (alertLevel == 1) {
    // WARNING: Blinking LED, Relay Off, No Sound
    digitalWrite(LED_PIN, (millis() / 500) % 2 == 0); // Toggle every 500ms
    digitalWrite(RELAY_PIN, LOW); 
    noTone(BUZZER_PIN);
    
  } else if (alertLevel == 2) {
    // CRITICAL: Solid LED, Relay ON, Buzzing Sound
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(RELAY_PIN, HIGH); // e.g., turns on Exhaust Fan
    
    if (ENABLE_BUZZER) {
      if ((millis() / 300) % 2 == 0) tone(BUZZER_PIN, 3000);
      else noTone(BUZZER_PIN);
    }
  }
}

void updateLCD() {
  lcd.clear();
  char buf[17];
  
  if (lcdScreen == 0) {
    // Screen 1: Sensor Values
    lcd.setCursor(0, 0); lcd.write(0); // Thermo Icon
    snprintf(buf, 17, "%.1fC ", temperature); lcd.print(buf);
    
    lcd.setCursor(8, 0); lcd.write(1); // Drop Icon
    snprintf(buf, 17, "%.0f%%", humidity); lcd.print(buf);
    
    lcd.setCursor(0, 1);
    snprintf(buf, 17, "Gas ADC: %d", gasRaw); lcd.print(buf);
    
  } else {
    // Screen 2: Status & Relay
    lcd.setCursor(0, 0);
    if (alertLevel == 0) {
      lcd.print("Status: OK "); lcd.write(3); // Check Icon
    } else {
      lcd.print(alertMessage);
    }
    
    lcd.setCursor(0, 1);
    lcd.print(digitalRead(RELAY_PIN) ? "Relay: ON(Fan) " : "Relay: OFF     ");
  }
  
  lcdScreen = !lcdScreen; // Cycle 0 -> 1 -> 0
}

void printSerial() {
  Serial.println("\n----------------------------------------");
  Serial.printf("[SENSORS] T:%.1f°C | H:%.0f%% | Gas:%d\n", temperature, humidity, gasRaw);
  Serial.printf("[STATUS]  Alert Lvl:%d (%s) | Relay:%s\n", 
    alertLevel, 
    alertMessage=="" ? "OK" : alertMessage.c_str(), 
    digitalRead(RELAY_PIN) ? "ON" : "OFF");
}

void publishMQTT() {
  JsonDocument doc;
  doc["node_id"] = NODE_ID;
  doc["timestamp"] = millis()/1000;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["gas_raw"] = gasMapped;
  
  // Send hardcoded fallbacks for the sensors we removed 
  // so the Node.js backend doesn't reject the payload
  doc["co2_ppm"] = 400; 
  doc["ethylene_ppm"] = 0.0;

  char payload[128];
  size_t len = serializeJson(doc, payload);
  
  String topic = "potato/node/" + String(NODE_ID) + "/data";
  if (mqtt.publish(topic.c_str(), payload, false)) {
    Serial.printf("[MQTT] Sent %d bytes: %s\n", len, payload);
  }
}

void reconnectMQTT() {
  String clientId = "potato_" + String(NODE_ID);
  if (mqtt.connect(clientId.c_str())) {
    Serial.println("[MQTT] Reconnected to broker.");
  }
}
