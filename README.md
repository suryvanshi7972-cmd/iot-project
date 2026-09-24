# TSS Group 4 - IoT Smart Environment Monitoring & Automation Platform

> **Application Name:** TSS Group 4  
> **Footer Text:** Designed and Developed by TSS GROUP NO. 4  
> **Theme:** Cream White Theme  
> **Target Deployment:** Render (with 1-click `render.yaml` blueprint)  
> **Microcontroller:** ESP8266 (NodeMCU / Wemos D1 Mini)  
> **TimeZone:** +5:30 (Asia/Kolkata)

---

## 📋 Table of Contents
1. [System Architecture](#system-architecture)
2. [Hardware Pinout & Wiring](#hardware-pinout--wiring)
3. [Features Overview](#features-overview)
4. [Project Structure](#project-structure)
5. [Local Development Setup](#local-development-setup)
6. [ESP8266 Arduino Setup & Flashing](#esp8266-arduino-setup--flashing)
7. [Deploying to Render](#deploying-to-render)
8. [API Reference](#api-reference)

---

## 🛠️ System Architecture

- **Frontend:** HTML5, Tailwind CSS, Custom Cream White Theme CSS, Chart.js for real-time telemetry curves, FontAwesome icons, SVG radial gauges & level seek bars.
- **Backend:** Node.js (v20+), Express.js, SQLite3 with auto-migrating schema.
- **Microcontroller:** ESP8266 with Adafruit DHT Unified, LiquidCrystal_I2C, and ArduinoJson.
- **Security:** Bcrypt password hashing, JSON Web Tokens (JWT) for authentication with secure cookies and Bearer headers.

---

## 🔌 Hardware Pinout & Wiring

| Component | ESP8266 Pin | GPIO | Description |
|---|---|---|---|
| **DHT11 Sensor** | **D5** | GPIO 14 | Data pin (use 10kΩ pullup if standalone DHT11) |
| **LED** | **D4** | GPIO 2 | Anode (+) via 220Ω resistor; Cathode (-) to GND |
| **16x2 LCD I2C SCL** | **D1** | GPIO 5 | I2C Clock (LiquidCrystal_I2C default `0x27`) |
| **16x2 LCD I2C SDA** | **D2** | GPIO 4 | I2C Data |
| **VCC & GND** | **3V3 / 5V / VIN & GND** | - | Power supply (LCD typically prefers 5V/VIN) |

### WiFi Configuration
- **SSID:** `IoT`
- **Password:** `12345678`

---

## 🌟 Features Overview

### 1. Authentication
- **User Registration:** Name, Email, Password.
- **User Login:** Email, Password with JWT authentication.
- **Demo Account:** Quick login button pre-filling `admin@tssgroup4.com`.

### 2. Tab 1: Environment Monitoring
- **DHT11 Sensor Data every 10 seconds:** Auto-refreshes live via polling.
- **Section 1: Innovative Gauges & Seek Bar:**
  - **Radial SVG Temperature Gauge:** Semicircular progress arc with dynamic thermal coloring (Cool Blue <18°C, Emerald Green 18-27°C, Amber 28-34°C, Crimson Red >34°C). Includes Celsius/Fahrenheit toggle (°C / °F).
  - **Radial SVG Humidity Gauge:** Live percentage indicator with comfort level classification (Dry, Optimal, Humid).
  - **Linear Seek Bars:** Visual min-to-max range level meters.
  - **Live Trend Graph (Chart.js):** Smooth curves tracking recent temperature and humidity fluctuations.
  - **24-Hour Analytics:** Automatic daily Min, Max, and Average telemetry.
- **Section 2: Saved Telemetry Table:**
  - Columns: `# | Temperature | Humidity | Time | Date | Action (Delete)`
  - **Pagination:** Latest records first, 20 records per page.
  - **TimeZone:** Formatted accurately to **+5:30 Asia/Kolkata** (IST).
  - **Actions:** Delete individual records, Clear all records, and Export to CSV.

### 3. Tab 2: Smart LCD 16x2
- **Inputs:** Row 1 `<input>` (16 chars max) and Row 2 `<input>` (16 chars max).
- **Interactive HD44780 Simulation Screen:** Real-time green dot-matrix virtual display showing exact text output.
- **Quick Preset Templates:** Instant presets like "Welcome", "Sensor Telemetry", and "High Heat Alert".
- **Update Display Button:** Sends content to backend; ESP8266 polls and updates the physical LCD display.

### 4. Tab 3: LED Automation
- **Toggle Switch:** Turn physical LED on D4 ON or OFF.
- **Realistic LED Bulb:** Glowing animated indicator (Emerald pulse when ON, standby gray when OFF).
- Synchronizes with ESP8266 every 3 seconds.

### 5. Sensor Simulator (Testing without hardware)
- Top navbar provides a **Sensor Simulator** popup to inject test temperature and humidity readings with auto-simulate mode.

---

## 📁 Project Structure

```
iot_proj/
├── arduino/
│   └── esp8266_iot_tss4.ino      # Complete ESP8266 Arduino firmware
├── data/
│   └── iot.db                    # SQLite database (auto-created)
├── public/
│   ├── css/
│   │   └── style.css             # Cream white theme design system & gauges
│   ├── js/
│   │   ├── auth.js               # Client authentication logic
│   │   └── dashboard.js          # Gauges, charts, pagination, LCD & LED handlers
│   ├── auth.html                 # Sign In & Registration page
│   └── index.html                # Main Dashboard with 3 Tabs & Footer
├── src/
│   ├── api.js                    # REST endpoints for sensors, LCD, and LED
│   ├── auth.js                   # JWT & user registration/login routes
│   ├── db.js                     # SQLite schema & promise helpers
│   └── server.js                 # Express server & Render configuration
├── .env.example                  # Environment configuration template
├── .gitignore
├── Procfile                      # Process execution file
├── render.yaml                   # Render Blueprint for automated deployment
├── package.json
└── README.md
```

---

## 🚀 Local Development Setup

### 1. Start the Server
Node.js v20 LTS has already been configured on your system:
```bash
# In the project directory:
npm install
npm start
```
The application will start on `http://localhost:3000`.

### 2. Access the Application
- Open your browser at `http://localhost:3000/auth.html`.
- Click **"Use Demo Account"** to sign in, or create a new account.
- The dashboard will load with live telemetry, gauges, LCD controls, and LED toggle.

---

## 🤖 ESP8266 Arduino Setup & Flashing

1. Open the [esp8266_iot_tss4.ino](file:///c:/Users/HP/Desktop/iot_proj/arduino/esp8266_iot_tss4.ino) sketch in the **Arduino IDE**.
2. Install the required libraries via **Sketch -> Include Library -> Manage Libraries**:
   - `DHT sensor library` by Adafruit
   - `LiquidCrystal I2C` by Frank de Brabander
   - `ArduinoJson` (v6 or v7)
3. Select your board: **Tools -> Board -> ESP8266 Boards -> NodeMCU 1.0 (ESP-12E Module)**.
4. Set the `SERVER_BASE_URL` in the Arduino code:
   - For local testing: `http://<YOUR_COMPUTER_LOCAL_IP>:3000` (e.g. `http://192.168.1.100:3000`).
   - For Render production: `https://iot-project-59i6.onrender.com`.
5. Connect your ESP8266 via micro-USB and click **Upload**.
6. Open Serial Monitor at **115200 baud** to verify WiFi connection and sensor telemetry transmissions.

---

## ☁️ Deploying to Render

This repository is pre-configured for deployment to [Render](https://render.com).

### Option A: Using the Render Blueprint (`render.yaml`)
1. Push this project to your GitHub repository.
2. In the [Render Dashboard](https://dashboard.render.com), click **New + -> Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically detect `render.yaml` and configure:
   - Web service with `npm install` and `npm start`.
   - SQLite persistent disk storage mounted at `/opt/render/project/src/data`.
   - Node environment variables.
5. Click **Apply** to deploy!

### Option B: Manual Web Service Setup on Render
1. In Render, select **New + -> Web Service**.
2. Connect your repository.
3. Configure the settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Under **Advanced -> Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = `<any-random-secret-string>`
   - `PORT` = `10000`
5. Under **Disks** (optional, recommended for persistent SQLite):
   - **Name:** `sqlite-data`
   - **Mount Path:** `/opt/render/project/src/data`
   - **Size:** `1 GB`
6. Click **Create Web Service**. Your live production app is available at:
   👉 **[https://iot-project-59i6.onrender.com](https://iot-project-59i6.onrender.com)**

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register user (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | Login user (`email`, `password`) -> returns JWT |
| `GET` | `/api/sensor/latest` | Returns latest DHT11 reading and 24h stats |
| `POST` | `/api/sensor/data` | ESP8266 posts `{ temperature, humidity }` |
| `GET` | `/api/sensor/history?page=1&limit=20` | Returns 20 records/page (latest first, IST time) |
| `DELETE` | `/api/sensor/:id` | Deletes record by ID |
| `DELETE` | `/api/sensor/clear/all` | Clears all historical sensor records |
| `GET` | `/api/sensor/chart` | Chronological records for Chart.js |
| `GET` | `/api/lcd` | Returns `{ row1, row2 }` |
| `POST` | `/api/lcd` | Updates LCD text `{ row1, row2 }` (max 16 chars each) |
| `GET` | `/api/led` | Returns LED status `{ status: true/false }` |
| `POST` | `/api/led` | Toggles or sets LED state `{ status: true/false }` |
| `ALL` | `/api/device/sync` | Combined ESP8266 sync (telemetry in, actuators out) |
| `GET` | `/health` | Server uptime and health check |

---
**Designed and Developed by TSS GROUP NO. 4**
