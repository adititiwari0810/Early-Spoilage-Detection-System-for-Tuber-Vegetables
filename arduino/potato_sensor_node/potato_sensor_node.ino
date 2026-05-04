/*
 * ════════════════════════════════════════════════════════════════════
 *   EARLY SPOILAGE DETECTION SYSTEM — ESP8266 NodeMCU
 * ════════════════════════════════════════════════════════════════════
 *
 *  HARDWARE:
 *    • 1× ESP8266 NodeMCU
 *    • 1× DHT11           — Temperature & Humidity
 *    • 1× MQ-135 (DOUT)   — Air quality digital alert
 *    • 1× MQ-3  (DOUT)    — Ethanol digital alert
 *    • 1× MG811 (AOUT)    — CO₂ concentration (ppm)
 *    • 1× LCD 16×2 (I2C)  — Local display
 *
 *  WIRING TABLE:
 *  ┌────────────┬────────┬──────────────────────────────────────────┐
 *  │ NodeMCU Pin│ GPIO   │ Connected To                             │
 *  ├────────────┼────────┼──────────────────────────────────────────┤
 *  │ D1         │ GPIO5  │ I2C SCL (LCD SCL)                        │
 *  │ D2         │ GPIO4  │ I2C SDA (LCD SDA)                        │
 *  │ D4         │ GPIO2  │ DHT11 DATA (+ 10kΩ pullup to 3V3)      │
 *  │ D5         │ GPIO14 │ MQ-135 DOUT                              │
 *  │ D6         │ GPIO12 │ MQ-3 DOUT                                │
 *  │ A0         │ ADC0   │ MG811 Analog Output (AOUT)               │
 *  │ 3V3        │  —     │ DHT11 VCC                                │
 *  │ Vin (5V)   │  —     │ LCD VCC, MQ-135 VCC, MQ-3 VCC, MG811   │
 *  │ GND        │  —     │ All component GNDs                       │
 *  └────────────┴────────┴──────────────────────────────────────────┘
 *
 *  MQTT PAYLOAD (topic: sensor/data):
 *  {
 *    "device":"esp8266_1",
 *    "dht_temp":34.8,
 *    "dht_hum":8,
 *    "ambient_temp_est":34.4,
 *    "ambient_hum_est":11.0,
 *    "co2":550,
 *    "air_alert":0,
 *    "ethanol_alert":0
 *  }
 */

#include <DHT.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>

const char* ssid        = "moto g45 5G_6614";
const char* password    = "Abhay151";
const char* mqtt_server = "10.73.26.253";

#define DHT_PIN      D4
#define DHT_TYPE     DHT11
#define MQ135_DOUT   D5
#define MQ3_DOUT     D6
#define MG811_AOUT   A0

DHT dht(DHT_PIN, DHT_TYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

WiFiClient espClient;
PubSubClient client(espClient);

// MG811 parameters
int mgBaseline = 370;
float filteredRaw = 370;

// ---------- WiFi ----------
void setup_wifi() {
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
}

// ---------- MQTT ----------
void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting MQTT... ");

    if (client.connect("ESP8266Client")) {
      Serial.println("connected");
    } else {
      Serial.println("retrying...");
      delay(2000);
    }
  }
}

// ---------- MG811 calibration ----------
void calibrateMG811() {
  long sum = 0;

  Serial.println("Calibrating MG811 (room air)...");

  for (int i = 0; i < 60; i++) {
    sum += analogRead(MG811_AOUT);
    delay(100);
    Serial.print(".");
  }

  mgBaseline = sum / 60;
  filteredRaw = mgBaseline;

  Serial.println();
  Serial.print("MG811 baseline = ");
  Serial.println(mgBaseline);
}

// ---------- MG811 CO2 ----------
float getMG811CO2() {
  long sum = 0;

  // fast read
  for (int i = 0; i < 5; i++) {
    sum += analogRead(MG811_AOUT);
    delay(2);
  }

  float raw = sum / 5.0;

  // balanced smoothing → quick + realistic
  filteredRaw = 0.70 * filteredRaw + 0.30 * raw;

  // exponential mapping
  float delta = (filteredRaw - mgBaseline) / 1023.0;
  float ppm = 550.0 * exp(6.0 * delta);

  ppm = constrain(ppm, 400, 5000);

  Serial.print("RAW=");
  Serial.print(filteredRaw, 1);
  Serial.print(" | Baseline=");
  Serial.print(mgBaseline);
  Serial.print(" | CO2=");
  Serial.println(ppm, 0);

  return ppm;
}

void setup() {
  Serial.begin(115200);

  lcd.init();
  lcd.backlight();

  dht.begin();

  pinMode(MQ135_DOUT, INPUT);
  pinMode(MQ3_DOUT, INPUT);

  setup_wifi();
  client.setServer(mqtt_server, 1883);

  calibrateMG811();

  lcd.clear();
  lcd.print("System Ready");
  delay(1500);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  float dhtTemp = dht.readTemperature();
  float dhtHum  = dht.readHumidity();

  if (isnan(dhtTemp)) dhtTemp = 28.0;
  if (isnan(dhtHum))  dhtHum = 35.0;

  // estimated ambient
  float ambientTempEst = dhtTemp - 0.4;
  float ambientHumEst  = dhtHum + 3.0;

  float co2_ppm = getMG811CO2();

  bool airBad       = (digitalRead(MQ135_DOUT) == LOW);
  bool ethanolAlert = (digitalRead(MQ3_DOUT) == LOW);

  // ---------- LCD ----------
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("T:");
  lcd.print(dhtTemp, 1);
  lcd.print(" H:");
  lcd.print(dhtHum, 0);

  lcd.setCursor(0, 1);
  lcd.print("CO2:");
  lcd.print((int)co2_ppm);
  lcd.print("ppm");

  // ---------- MQTT ----------
  String payload = "{";
  payload += "\"device\":\"esp8266_1\",";
  payload += "\"dht_temp\":" + String(dhtTemp, 1) + ",";
  payload += "\"dht_hum\":" + String(dhtHum, 0) + ",";
  payload += "\"ambient_temp_est\":" + String(ambientTempEst, 1) + ",";
  payload += "\"ambient_hum_est\":" + String(ambientHumEst, 1) + ",";
  payload += "\"co2\":" + String((int)co2_ppm) + ",";
  payload += "\"air_alert\":" + String(airBad ? 1 : 0) + ",";
  payload += "\"ethanol_alert\":" + String(ethanolAlert ? 1 : 0);
  payload += "}";

  client.publish("sensor/data", payload.c_str());
  Serial.println(payload);

  // near-live update
  delay(500);
}
