# 🧪 Early Spoilage Detection — Arduino Sensor Node

Complete guide for setting up the ESP8266-based sensor node with **Arduino IDE 2.3.8**.

---

## 📦 Hardware Required

| Component | Model | Purpose | Approx. Cost |
|-----------|-------|---------|-------------|
| Microcontroller | **ESP8266 NodeMCU** | Wi-Fi + processing | ₹300 |
| Temp & Humidity | **DHT11** | Temperature (°C) & Humidity (%RH) | ₹100 |
| CO₂ Sensor | **MG811** (Analog) | CO₂ concentration (ppm, calibrated) | ₹1,500 |
| Gas Sensor 1 | **MQ-135** (DOUT) | Air quality digital alert | ₹120 |
| Gas Sensor 2 | **MQ-3** (DOUT) | Ethanol digital alert | ₹120 |
| Display | **LCD 16×2 (I2C)** | Local status display | ₹180 |
| Resistor | **10kΩ** | Pull-up for DHT11 data line | ₹2 |
| Breadboard | Full-size | Prototyping | ₹100 |
| Jumper Wires | M-M, M-F | Connections | ₹80 |
| Power Supply | USB 5V / 2A | ESP8266 + sensors | ₹150 |

---

## 🔌 Wiring Diagram

```
                          ┌─────────────────────────┐
                          │    ESP8266 NodeMCU       │
                          │                          │
    ┌──────────┐          │                          │
    │  DHT11   │          │                          │
    │ VCC ─────┼──────────┤ 3V3                      │
    │ DATA ────┼───┬──────┤ D4 (GPIO2)               │
    │ GND ─────┼───┼──────┤ GND                      │
    └──────────┘   │      │                          │
              10kΩ │      │                          │
              to   │      │                          │
              3V3  └──3V3 │                          │
                          │                          │
    ┌──────────┐          │                          │
    │  MG811   │          │                          │
    │ VCC ─────┼──────────┤ Vin (5V)                 │
    │ AOUT ────┼──────────┤ A0 (ADC0)                │
    │ GND ─────┼──────────┤ GND                      │
    └──────────┘          │                          │
                          │                          │
    ┌──────────┐          │          ┌──────────┐    │
    │  MQ-135  │          │          │   MQ-3   │    │
    │ VCC ─────┼──────────┤ Vin(5V)  │          │    │
    │ DOUT ────┼──────────┤ D5       │ VCC ─────┼────┤ Vin (5V)
    │ GND ─────┼──────────┤ GND      │ DOUT ────┼────┤ D6
    └──────────┘          │          │ GND ─────┼────┤ GND
                          │          └──────────┘    │
    ┌──────────┐          │                          │
    │ LCD I2C  │          │                          │
    │ VCC ─────┼──────────┤ Vin (5V)                 │
    │ SDA ─────┼──────────┤ D2 (GPIO4)               │
    │ SCL ─────┼──────────┤ D1 (GPIO5)               │
    │ GND ─────┼──────────┤ GND                      │
    └──────────┘          │                          │
                          └──────────────────────────┘
```

> ⚠️ **Important Notes:**
> - MQ-3, MQ-135, and MG811 need **5V** for their heaters. Power them from the ESP8266's **Vin** pin (USB 5V pass-through).
> - DHT11 runs on **3.3V**. A 10kΩ pull-up resistor is required between DATA and 3.3V.
> - MQ-135 and MQ-3 use **digital output (DOUT)** pins only — no analog readings from these sensors.
> - MG811 uses the **analog output (AOUT)** — connected to the single A0 pin on ESP8266.
> - MQ sensors need a **24–48 hour burn-in** period on first use for accurate readings.
> - MG811 auto-calibrates on startup by sampling room air for ~6 seconds.

---

## 🛠️ Arduino IDE 2.3.8 Setup (Step-by-Step)

### Step 1: Install ESP8266 Board Support

1. Open Arduino IDE 2.3.8
2. Go to **File → Preferences**
3. In **"Additional Board Manager URLs"**, paste:
   ```
   https://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
4. Click **OK**
5. Go to **Tools → Board → Board Manager**
6. Search for **"esp8266"**
7. Install **"esp8266 by ESP8266 Community"** (version 3.x or later)
8. Select board: **Tools → Board → ESP8266 Boards → "NodeMCU 1.0 (ESP-12E Module)"**

### Step 2: Install Required Libraries

Open **Tools → Manage Libraries** (or `Ctrl+Shift+I`) and install:

| Library | Author | Version | Search Term |
|---------|--------|---------|-------------|
| **PubSubClient** | Nick O'Leary | 2.8+ | `PubSubClient` |
| **DHT sensor library** | Adafruit | 1.4+ | `DHT sensor library` |
| **Adafruit Unified Sensor** | Adafruit | 1.1+ | `Adafruit Unified Sensor` |
| **LiquidCrystal I2C** | Frank de Brabander | 1.1+ | `LiquidCrystal I2C` |

> 💡 When installing "DHT sensor library", Arduino IDE will prompt to install "Adafruit Unified Sensor" as a dependency — click **Install All**.

### Step 3: Configure the Sketch

Open `potato_sensor_node.ino` and update these values:

```cpp
// Wi-Fi credentials
const char* ssid        = "YOUR_WIFI_SSID";       // ← Your Wi-Fi name
const char* password    = "YOUR_WIFI_PASSWORD";    // ← Your Wi-Fi password

// MQTT Broker IP (machine running Docker/Mosquitto)
const char* mqtt_server = "10.73.26.253";          // ← Your server IP
```

**Finding your server IP:**
- Windows: Open CMD → `ipconfig` → look for IPv4 Address
- Linux/Mac: Terminal → `ip addr` or `ifconfig`

### Step 4: Upload

1. Connect ESP8266 via USB
2. Select the correct port: **Tools → Port → COMx** (Windows) or `/dev/ttyUSBx` (Linux)
3. Click **Upload** (→ button)
4. Open **Serial Monitor** (`Ctrl+Shift+M`) at **115200 baud** to verify

### Step 5: Verify Connection

You should see output like:
```
Calibrating MG811 (room air)...
............................................................
MG811 baseline = 370

WiFi connected
Connecting MQTT... connected
System Ready

RAW=370.0 | Baseline=370 | CO2=550
{"device":"esp8266_1","dht_temp":28.4,"dht_hum":45,"ambient_temp_est":28.0,"ambient_hum_est":48.0,"co2":550,"air_alert":0,"ethanol_alert":0}
```

---

## 🧪 Testing Without Hardware

If you don't have the physical sensors yet, use the included **`potato_spoilage_simulator.ino`** sketch. It generates realistic fake sensor data and publishes it over MQTT in the exact same JSON format — perfect for testing the full pipeline (MQTT → Backend → Dashboard).

---

## 🔧 Troubleshooting

### ESP8266 Not Detected
- Install CP2102 or CH340 USB driver (depends on your ESP8266 board's USB chip)
- Try a different USB cable (some are charge-only, no data)
- Hold **FLASH** button while uploading

### Wi-Fi Won't Connect
- Ensure SSID/password are correct (case-sensitive)
- ESP8266 only supports **2.4 GHz** Wi-Fi (not 5 GHz)
- Check if router has MAC filtering enabled

### MQTT Connection Fails
- Verify Mosquitto is running: `docker ps` or `mosquitto -v`
- Ensure `mosquitto.conf` has `allow_anonymous true` and `listener 1883`
- Check firewall: port 1883 must be open on the server
- Test from PC first: `mosquitto_pub -h <IP> -t test -m "hello"`

### DHT11 Read Failures
- Check 10kΩ pull-up resistor between DATA and 3.3V
- Minimum 2 seconds between reads (handled in code with fallback values)
- Try a different GPIO pin

### MG811 Shows Unstable Readings
- Sensor needs **3–5 minutes warm-up** after power-on
- Calibration runs automatically on startup (~6 seconds)
- Ensure adequate ventilation during baseline calibration
- The exponential mapping constrains CO₂ to 400–5000 ppm range

### MQ Sensor Digital Alerts Not Triggering
- First-time use: **24–48 hour burn-in** required
- Adjust the potentiometer on the MQ sensor breakout board to set trigger threshold
- MQ-135 and MQ-3 DOUT pins go **LOW** when gas is detected

---

## 📡 MQTT Payload Format

**Topic:** `sensor/data`

```json
{
  "device": "esp8266_1",
  "dht_temp": 34.8,
  "dht_hum": 45,
  "ambient_temp_est": 34.4,
  "ambient_hum_est": 48.0,
  "co2": 550,
  "air_alert": 0,
  "ethanol_alert": 0
}
```

| Field | Type | Source | Range |
|-------|------|--------|-------|
| `device` | string | Hardcoded | `"esp8266_1"` |
| `dht_temp` | float | DHT11 | -10 to 60 °C |
| `dht_hum` | float | DHT11 | 0 to 100 % |
| `ambient_temp_est` | float | Computed | dht_temp − 0.4 |
| `ambient_hum_est` | float | Computed | dht_hum + 3.0 |
| `co2` | int | MG811 (calibrated) | 400 to 5000 ppm |
| `air_alert` | int (0/1) | MQ-135 DOUT | 0 = normal, 1 = alert |
| `ethanol_alert` | int (0/1) | MQ-3 DOUT | 0 = normal, 1 = alert |

---

## 📡 Data Flow

```
ESP8266 Sensors (DHT11 + MG811 + MQ-135 + MQ-3)
     │
     ▼
  MQTT Publish (JSON)
  Topic: sensor/data
     │
     ▼
  Mosquitto Broker (:1883)
     │
     ▼
  Node.js Backend
  ├── Parses & validates JSON
  ├── Enriches with statistical analysis (EMA, Z-score, slopes)
  ├── Computes spoilage score (0.0 – 1.0)
  ├── Evaluates alert thresholds
  ├── Writes to InfluxDB (time-series)
  └── Writes to PostgreSQL (alerts)
     │
     ▼
  WebSocket (Socket.IO)
     │
     ▼
  React Dashboard (real-time)
```
