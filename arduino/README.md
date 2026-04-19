# 🥔 Potato Spoilage Detection — Arduino Sensor Node

Complete guide for setting up the ESP32-based sensor node with **Arduino IDE 2.3.8**.

---

## 📦 Hardware Required

| Component | Model | Purpose | Approx. Cost |
|-----------|-------|---------|-------------|
| Microcontroller | **ESP32 DevKit V1** | Wi-Fi + processing | ₹450 |
| Temp & Humidity | **DHT22** (AM2302) | Temperature (°C) & Humidity (%RH) | ₹250 |
| CO₂ Sensor | **MH-Z19B** (NDIR) | CO₂ concentration (ppm) | ₹1,800 |
| Gas Sensor 1 | **MQ-3** | Ethylene proxy (ppm) | ₹120 |
| Gas Sensor 2 | **MQ-135** | General air quality (raw ADC) | ₹120 |
| Resistor | **10kΩ** | Pull-up for DHT22 data line | ₹2 |
| Breadboard | Full-size | Prototyping | ₹100 |
| Jumper Wires | M-M, M-F | Connections | ₹80 |
| Power Supply | USB 5V / 2A | ESP32 + sensors | ₹150 |

---

## 🔌 Wiring Diagram

```
                          ┌─────────────────────┐
                          │     ESP32 DevKit     │
                          │                      │
    ┌──────────┐          │                      │          ┌──────────┐
    │  DHT22   │          │                      │          │  MH-Z19B │
    │          │          │                      │          │          │
    │ VCC ─────┼──────────┤ 3.3V            5V ──┼──────────┤ Vin      │
    │ DATA ────┼───┬──────┤ GPIO 4               │          │          │
    │ GND ─────┼───┼──────┤ GND            GND ──┼──────────┤ GND      │
    └──────────┘   │      │                      │          │          │
              10kΩ │      │ GPIO 16 (RX2) ───────┼──────────┤ TX       │
              to   │      │ GPIO 17 (TX2) ───────┼──────────┤ RX       │
              3.3V │      │                      │          └──────────┘
                   └──3.3V│                      │
                          │                      │
    ┌──────────┐          │                      │          ┌──────────┐
    │  MQ-135  │          │                      │          │   MQ-3   │
    │          │          │                      │          │          │
    │ VCC ─────┼──────────┤ 5V (Vin)        5V ──┼──────────┤ VCC      │
    │ AOUT ────┼──────────┤ GPIO 34              │          │          │
    │ GND ─────┼──────────┤ GND            GND ──┼──────────┤ GND      │
    └──────────┘          │         GPIO 35 ─────┼──────────┤ AOUT     │
                          │                      │          └──────────┘
                          │                      │
                          │  GPIO 2 = On-board LED│
                          └──────────────────────┘
```

> ⚠️ **Important Notes:**
> - MQ-3 and MQ-135 need **5V** for their heaters. Power them from the ESP32's **Vin** pin (USB 5V pass-through).
> - DHT22 runs on **3.3V**. A 10kΩ pull-up resistor is required between DATA and 3.3V.
> - MH-Z19B runs on **5V** (Vin) but its UART TX is 3.3V-compatible, so direct connection to ESP32 RX is safe.
> - MQ sensors need a **24–48 hour burn-in** period on first use for accurate readings.

---

## 🛠️ Arduino IDE 2.3.8 Setup (Step-by-Step)

### Step 1: Install ESP32 Board Support

1. Open Arduino IDE 2.3.8
2. Go to **File → Preferences**
3. In **"Additional Board Manager URLs"**, paste:
   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
4. Click **OK**
5. Go to **Tools → Board → Board Manager**
6. Search for **"esp32"**
7. Install **"esp32 by Espressif Systems"** (version 2.0.x or later)
8. Select board: **Tools → Board → ESP32 Arduino → "ESP32 Dev Module"**

### Step 2: Install Required Libraries

Open **Tools → Manage Libraries** (or `Ctrl+Shift+I`) and install:

| Library | Author | Version | Search Term |
|---------|--------|---------|-------------|
| **PubSubClient** | Nick O'Leary | 2.8+ | `PubSubClient` |
| **DHT sensor library** | Adafruit | 1.4+ | `DHT sensor library` |
| **Adafruit Unified Sensor** | Adafruit | 1.1+ | `Adafruit Unified Sensor` |
| **ArduinoJson** | Benoit Blanchon | 7.x | `ArduinoJson` |
| **MH-Z19** | Jonathan Dempsey | 1.5+ | `MH-Z19` |

> 💡 When installing "DHT sensor library", Arduino IDE will prompt to install "Adafruit Unified Sensor" as a dependency — click **Install All**.

### Step 3: Configure the Sketch

Open `potato_spoilage_node.ino` and update these values:

```cpp
// Wi-Fi credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";       // ← Your Wi-Fi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // ← Your Wi-Fi password

// MQTT Broker IP (machine running Docker/Mosquitto)
const char* MQTT_BROKER   = "192.168.1.100";         // ← Your server IP

// Unique node identifier (change for each sensor node)
const char* NODE_ID       = "node_01";               // ← node_01, node_02, etc.
```

**Finding your server IP:**
- Windows: Open CMD → `ipconfig` → look for IPv4 Address
- Linux/Mac: Terminal → `ip addr` or `ifconfig`

### Step 4: Upload

1. Connect ESP32 via USB
2. Select the correct port: **Tools → Port → COMx** (Windows) or `/dev/ttyUSBx` (Linux)
3. Click **Upload** (→ button)
4. Open **Serial Monitor** (`Ctrl+Shift+M`) at **115200 baud** to verify

### Step 5: Verify Connection

You should see output like:
```
╔══════════════════════════════════════════════╗
║   Potato Spoilage Detection — Sensor Node   ║
╚══════════════════════════════════════════════╝
  Node ID : node_01

[DHT22]  Initialized on GPIO 4
[MH-Z19B] Initialized on UART2 (RX=16, TX=17)
[MQ-135] Analog input on GPIO 34
[MQ-3]   Analog input on GPIO 35
[WiFi] Connecting to MyNetwork .....
[WiFi] ✔ Connected! IP: 192.168.1.42
[WiFi]   RSSI: -45 dBm
[NTP]  ✔ Time synchronized: 2026-04-17 21:10:30
[MQTT] Connecting to 192.168.1.100:1883 ... ✔ Connected!

[READY] Entering main loop...
─────────────────────────────────────────────
┌──── Reading Sensors ────────────────────────┐
│ [DHT22]  Temp: 25.4°C   Humidity: 78.2%
│ [MH-Z19B] CO₂: 820 ppm
│ [MQ-3]   Raw: 1200  →  Ethylene: 14.65 ppm
│ [MQ-135]  Gas Raw: 1540
│ [TIME]   Epoch: 1713371430
└─────────────────────────────────────────────┘
[MQTT] ✔ Published 127 bytes to potato/node/node_01/data
[JSON] {"node_id":"node_01","timestamp":1713371430,"temperature":25.4,"humidity":78.2,"co2_ppm":820,"ethylene_ppm":14.65,"gas_raw":1540}
```

---

## 🧪 Testing Without Hardware

If you don't have the physical sensors yet, use the included **`potato_spoilage_simulator.ino`** sketch. It generates realistic fake sensor data and publishes it over MQTT — perfect for testing the full pipeline (MQTT → Backend → Dashboard).

---

## 🔧 Troubleshooting

### ESP32 Not Detected
- Install CP2102 or CH340 USB driver (depends on your ESP32 board's USB chip)
- Try a different USB cable (some are charge-only, no data)
- Hold **BOOT** button while uploading

### Wi-Fi Won't Connect
- Ensure SSID/password are correct (case-sensitive)
- ESP32 only supports **2.4 GHz** Wi-Fi (not 5 GHz)
- Check if router has MAC filtering enabled

### MQTT Connection Fails
- Verify Mosquitto is running: `docker ps` or `mosquitto -v`
- Ensure `mosquitto.conf` has `allow_anonymous true` and `listener 1883`
- Check firewall: port 1883 must be open on the server
- Test from PC first: `mosquitto_pub -h <IP> -t test -m "hello"`

### DHT22 Read Failures
- Check 10kΩ pull-up resistor between DATA and 3.3V
- Minimum 2 seconds between reads (handled in code)
- Try a different GPIO pin

### MH-Z19B Shows 0 or -1
- Sensor needs **3 minutes warm-up** after power-on
- Check UART wiring: ESP32 RX → MH-Z19B TX (crossed)
- Ensure 5V power supply is adequate (needs ~150mA)

### MQ Sensor Readings Too Low/High
- First-time use: **24–48 hour burn-in** required
- Readings stabilize after 5-10 minutes of warm-up each power cycle
- Calibrate `MQ3_SCALE_FACTOR` in real environment

---

## 🏗️ Multi-Node Deployment

To deploy multiple sensor nodes:

1. Flash each ESP32 with a **unique `NODE_ID`** (`node_01`, `node_02`, etc.)
2. All nodes publish to the same MQTT broker
3. The backend automatically discovers new nodes and creates analysis windows
4. Dashboard shows all active nodes in real-time

```
Node 01 → potato/node/node_01/data ─┐
Node 02 → potato/node/node_02/data ──┼→ Mosquitto → Backend → Dashboard
Node 03 → potato/node/node_03/data ─┘
```

---

## 📡 Data Flow

```
ESP32 Sensors
     │
     ▼
  MQTT Publish (JSON)
  Topic: potato/node/{NODE_ID}/data
     │
     ▼
  Mosquitto Broker (:1883)
     │
     ▼
  Node.js Backend
  ├── Validates fields & ranges
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
