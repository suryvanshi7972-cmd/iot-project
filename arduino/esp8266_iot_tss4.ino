/*
  ================================================================================
  Project: TSS Group 4 - IoT Smart Environment Monitoring & Automation
  Designed and Developed by: TSS GROUP NO. 4
  Hardware:
    - Microcontroller: ESP8266 (NodeMCU / Wemos D1 Mini)
    - Sensor: DHT11 Temperature & Humidity Sensor -> Pin D5 (GPIO 14)
    - Actuator: LED -> Pin D4 (GPIO 2, onboard / external LED)
    - Display: 16x2 LCD with I2C Backpack -> D1 (SCL / GPIO 5), D2 (SDA / GPIO 4)
  
  WiFi Credentials:
    - SSID: IoT
    - Password: 12345678

  Required Arduino Libraries (Install via Arduino Library Manager):
    1. "DHT sensor library" by Adafruit (along with "Adafruit Unified Sensor")
    2. "LiquidCrystal I2C" by Frank de Brabander (or Marco Schwartz)
    3. "ArduinoJson" by Benoit Blanchon (Version 6 or 7)
    4. "ESP8266WiFi" and "ESP8266HTTPClient" (Built-in with ESP8266 Core)
  ================================================================================
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ---------------------- WiFi Credentials ----------------------
const char* WIFI_SSID     = "IoT";
const char* WIFI_PASSWORD = "12345678";

// ---------------------- Server Configuration ------------------
// Replace with your Render URL or Local IP during testing:
// Example Local:  "http://192.168.1.100:3000"
// Example Render: "https://tss-group-4-iot.onrender.com"
const char* SERVER_BASE_URL = "http://192.168.1.100:3000"; 
// Optional API Key for secure device authentication
const char* DEVICE_API_KEY  = "tss4_secret_device_key_2026";

// ---------------------- Pin Definitions -----------------------
#define DHTPIN  D5      // DHT11 Data Pin connected to D5 (GPIO 14)
#define DHTTYPE DHT11   // Sensor type DHT11
#define LEDPIN  D4      // LED connected to D4 (GPIO 2)
#define I2C_SDA D2      // LCD I2C SDA -> D2 (GPIO 4)
#define I2C_SCL D1      // LCD I2C SCL -> D1 (GPIO 5)

// Note for NodeMCU Pin D4:
// NodeMCU onboard LED is connected to D4 and is ACTIVE LOW (LOW = ON, HIGH = OFF).
// If you are using an external LED wired: D4 -> Resistor -> LED Anode -> GND, it is ACTIVE HIGH.
// Set this to true if using standard external LED (HIGH = ON), or false for active-low.
const bool EXTERNAL_LED_ACTIVE_HIGH = true;

// ---------------------- Peripherals Instances -----------------
DHT dht(DHTPIN, DHTTYPE);
// 0x27 or 0x3F are common I2C addresses for 16x2 LCD backpacks
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------------------- Timing Variables ----------------------
unsigned long lastSensorSendTime = 0;
const unsigned long SENSOR_INTERVAL_MS = 10000; // Send DHT11 data every 10 seconds

unsigned long lastActuatorCheckTime = 0;
const unsigned long ACTUATOR_INTERVAL_MS = 3000; // Check LED & LCD every 3 seconds

// Cached states to avoid unnecessary redraws
String currentLcdRow1 = "";
String currentLcdRow2 = "";
bool currentLedState = false;

// ---------------------- Helper: Set Physical LED --------------
void applyLedState(bool turnOn) {
  currentLedState = turnOn;
  if (EXTERNAL_LED_ACTIVE_HIGH) {
    digitalWrite(LEDPIN, turnOn ? HIGH : LOW);
  } else {
    digitalWrite(LEDPIN, turnOn ? LOW : HIGH);
  }
}

// ---------------------- Helper: Update LCD Display ------------
void updateLcdDisplay(String line1, String line2) {
  // Truncate to 16 characters
  if (line1.length() > 16) line1 = line1.substring(0, 16);
  if (line2.length() > 16) line2 = line2.substring(0, 16);

  // Only redraw if text has changed
  if (line1 == currentLcdRow1 && line2 == currentLcdRow2) {
    return;
  }

  currentLcdRow1 = line1;
  currentLcdRow2 = line2;

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);

  Serial.println("[LCD] Updated:");
  Serial.print("  L1: "); Serial.println(line1);
  Serial.print("  L2: "); Serial.println(line2);
}

// ---------------------- Send Sensor Data to Server ------------
void sendSensorData(float temperature, float humidity) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Not connected. Cannot send sensor data.");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  String url = String(SERVER_BASE_URL) + "/api/sensor/data";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  // Create JSON payload
  StaticJsonDocument<200> doc;
  doc["temperature"] = temperature;
  doc["humidity"]    = humidity;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  Serial.print("[HTTP] POST sensor data: ");
  Serial.println(jsonPayload);

  int httpCode = http.POST(jsonPayload);

  if (httpCode > 0) {
    Serial.printf("[HTTP] POST Response Code: %d\n", httpCode);
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      String response = http.getString();
      Serial.println("[HTTP] Response: " + response);
    }
  } else {
    Serial.printf("[HTTP] POST failed, error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ---------------------- Synchronize LCD & LED States ----------
void syncActuators() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;

  // We can fetch from combined device sync endpoint or individual endpoints
  String url = String(SERVER_BASE_URL) + "/api/device/sync";
  http.begin(client, url);
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      // 1. Process LED state
      if (doc.containsKey("led")) {
        bool serverLedState = doc["led"]["status"] | false;
        applyLedState(serverLedState);
      }

      // 2. Process LCD rows
      if (doc.containsKey("lcd")) {
        String row1 = doc["lcd"]["row1"] | "";
        String row2 = doc["lcd"]["row2"] | "";
        updateLcdDisplay(row1, row2);
      }
    } else {
      Serial.print("[JSON] Parse failed: ");
      Serial.println(error.f_str());
    }
  } else {
    // If combined endpoint is not available, fallback to individual endpoints
    http.end();

    // Check LED
    http.begin(client, String(SERVER_BASE_URL) + "/api/led");
    if (http.GET() == HTTP_CODE_OK) {
      StaticJsonDocument<128> ledDoc;
      if (!deserializeJson(ledDoc, http.getString())) {
        applyLedState(ledDoc["status"] | false);
      }
    }
    http.end();

    // Check LCD
    http.begin(client, String(SERVER_BASE_URL) + "/api/lcd");
    if (http.GET() == HTTP_CODE_OK) {
      StaticJsonDocument<256> lcdDoc;
      if (!deserializeJson(lcdDoc, http.getString())) {
        String r1 = lcdDoc["row1"] | "";
        String r2 = lcdDoc["row2"] | "";
        updateLcdDisplay(r1, r2);
      }
    }
  }

  http.end();
}

// ---------------------- Setup Function ------------------------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n========================================");
  Serial.println("  TSS Group 4 - ESP8266 Initializing...  ");
  Serial.println("========================================");

  // Initialize LED Pin
  pinMode(LEDPIN, OUTPUT);
  applyLedState(false);

  // Initialize I2C Bus for LCD on D1/D2
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("  TSS GROUP 4   ");
  lcd.setCursor(0, 1);
  lcd.print("Connecting WiFi ");

  // Initialize DHT11
  dht.begin();

  // Connect to WiFi
  Serial.print("[WiFi] Connecting to SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 30) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
    delay(2000);
    lcd.clear();
  } else {
    Serial.println("\n[WiFi] Connection Failed! Retrying in background...");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Conn Failed");
    lcd.setCursor(0, 1);
    lcd.print("Retrying...");
  }
}

// ---------------------- Main Loop -----------------------------
void loop() {
  // Reconnect WiFi if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Connection lost. Reconnecting...");
    WiFi.reconnect();
    delay(1000);
    return;
  }

  unsigned long currentMillis = millis();

  // 1. Task: Read DHT11 and send every 10 seconds
  if (currentMillis - lastSensorSendTime >= SENSOR_INTERVAL_MS) {
    lastSensorSendTime = currentMillis;

    float humidity = dht.readHumidity();
    float temperature = dht.readTemperature(); // Celsius

    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("[DHT11] Failed to read from sensor!");
    } else {
      Serial.printf("[DHT11] Temp: %.1f C | Humidity: %.1f %%\n", temperature, humidity);
      sendSensorData(temperature, humidity);
    }
  }

  // 2. Task: Sync LED status and LCD messages every 3 seconds
  if (currentMillis - lastActuatorCheckTime >= ACTUATOR_INTERVAL_MS) {
    lastActuatorCheckTime = currentMillis;
    syncActuators();
  }

  delay(50); // Small yield for ESP8266 background tasks
}
