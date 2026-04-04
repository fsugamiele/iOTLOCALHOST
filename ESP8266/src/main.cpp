// ──────────────────────────────────────────────────────────────────
//  Wanomi IoT — ESP8266 Firmware
//  Supports WiFi AP provisioning on first boot (no /config.json).
//  On subsequent boots loads credentials from LittleFS and runs
//  the normal sensor/MQTT loop.
// ──────────────────────────────────────────────────────────────────

#include "Arduino.h"
#include "ESP8266WiFi.h"
#include "ESP8266HTTPClient.h"
#include <ESP8266WebServer.h>
#include <EEPROM.h>
#include "Adafruit_Sensor.h"
#include <DHT.h>
#include <DHT_U.h>
#include "Colors.h"
#include "IoTicosSplitter.h"
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Adafruit_ST7735.h>
#include "Adafruit_ST77xx.h"
#include <SPI.h>
#include "iconosClima.h"

// ── Runtime config (loaded from LittleFS /config.json) ────────────

String cfg_ssid;
String cfg_wifi_password;
String cfg_dId;
String cfg_device_password;
String cfg_server_ip;
String cfg_server_port = "3001";

// Derived from config
String dId;
String webhook_pass;
String webhook_endpoint;
String mqtt_server_str;

// ── Hardware pins ──────────────────────────────────────────────────

#define led     D0
#define DHTPIN  D6
#define DHTTYPE DHT11

#define TFT_DC  D1
#define TFT_RST D2
#define TFT_CS  D7

// ── Mode flag ─────────────────────────────────────────────────────

bool provisioningMode = false;

// ── Global objects ─────────────────────────────────────────────────

WiFiClient        espclient;
PubSubClient      client(espclient);
IoTicosSplitter   splitter;
DynamicJsonDocument mqtt_data_doc(2048);
DHT               dht(DHTPIN, DHTTYPE);
Adafruit_ST7789   tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);
ESP8266WebServer  provServer(80);

// ── Sensor state ──────────────────────────────────────────────────

long lastReconnectAttemp = 0;
int  temp, hum, sterm;
int  prev_temp, prev_hum, prev_sterm;
long varsLastSend[20];
String last_receives_msg  = "";
String last_received_topic = "";
String falloSensores       = "";
int hora = 14, minutos = 25;
String ciudad = "Rio Cuarto";
int icono;

// ── Non-blocking timers ───────────────────────────────────────────

long lastSensorRead   = 0;
long lastDisplayDraw  = 0;
long lastMarqueeStep  = 0;
long lastStats        = 0;
int  marqueeOffset    = 0;

const String marqueeText  = " wanomi God Level Sensacion Termica y Humedad      ";
const int    marqueeWidth = 40;

// ── Forward declarations ──────────────────────────────────────────

bool hasStoredConfig();
bool loadConfig();
bool saveConfig(String ssid, String wifiPass, String dId,
                String devPass, String serverIP, String serverPort);
void clearConfig();
void startProvisioningMode();
void handleProvisionCors();
void handleProvision();
void pantallaProvisioning(String apSSID);

void connectToWiFi();
bool get_mqtt_credentials();
void check_mqtt_connection();
bool reconnect();
void process_sensors();
void process_actuactors();
void send_data_to_broker();
void callback(char *topic, byte *payload, unsigned int length);
void process_incoming_msg(String topic, String incoming);
void handle_config_update(String incoming);
void print_stats();
void pantallaUno();
void clear();


// ══════════════════════════════════════════════════════════════════
//  EEPROM — CONFIG PERSISTENCE
//  Magic number "WANOMI" at offset 0 validates the stored config.
//  Without it, hasStoredConfig() returns false → provisioning mode.
// ══════════════════════════════════════════════════════════════════

#define EEPROM_SIZE   300
#define MAGIC         "WANOMI"
#define MAGIC_LEN     6

struct StoredConfig {
  char magic[MAGIC_LEN];
  char ssid[64];
  char wifiPassword[64];
  char dId[20];
  char devicePassword[20];
  char serverIP[48];
  char serverPort[8];
};

bool hasStoredConfig() {
  EEPROM.begin(EEPROM_SIZE);
  StoredConfig cfg;
  EEPROM.get(0, cfg);
  return strncmp(cfg.magic, MAGIC, MAGIC_LEN) == 0;
}

bool loadConfig() {
  EEPROM.begin(EEPROM_SIZE);
  StoredConfig cfg;
  EEPROM.get(0, cfg);

  if (strncmp(cfg.magic, MAGIC, MAGIC_LEN) != 0) return false;

  cfg_ssid            = String(cfg.ssid);
  cfg_wifi_password   = String(cfg.wifiPassword);
  cfg_dId             = String(cfg.dId);
  cfg_device_password = String(cfg.devicePassword);
  cfg_server_ip       = String(cfg.serverIP);
  cfg_server_port     = strlen(cfg.serverPort) > 0 ? String(cfg.serverPort) : "3001";

  if (cfg_ssid.isEmpty() || cfg_dId.isEmpty() || cfg_server_ip.isEmpty()) {
    Serial.println("[Config] Incomplete — provisioning mode");
    return false;
  }

  dId              = cfg_dId;
  webhook_pass     = cfg_device_password;
  mqtt_server_str  = cfg_server_ip;
  webhook_endpoint = "http://" + cfg_server_ip + ":" + cfg_server_port + "/api/getdevicecredentials";

  Serial.println("[Config] Loaded OK");
  Serial.println("  ssid:   " + cfg_ssid);
  Serial.println("  dId:    " + dId);
  Serial.println("  server: " + cfg_server_ip + ":" + cfg_server_port);
  return true;
}

bool saveConfig(String ssid, String wifiPass, String dId,
                String devPass, String serverIP, String serverPort) {
  EEPROM.begin(EEPROM_SIZE);
  StoredConfig cfg;

  strncpy(cfg.magic,          MAGIC,              MAGIC_LEN);
  strncpy(cfg.ssid,           ssid.c_str(),       sizeof(cfg.ssid) - 1);
  strncpy(cfg.wifiPassword,   wifiPass.c_str(),   sizeof(cfg.wifiPassword) - 1);
  strncpy(cfg.dId,            dId.c_str(),        sizeof(cfg.dId) - 1);
  strncpy(cfg.devicePassword, devPass.c_str(),    sizeof(cfg.devicePassword) - 1);
  strncpy(cfg.serverIP,       serverIP.c_str(),   sizeof(cfg.serverIP) - 1);
  strncpy(cfg.serverPort,     serverPort.c_str(), sizeof(cfg.serverPort) - 1);

  // Null-terminate all fields
  cfg.ssid[sizeof(cfg.ssid)-1]                   = '\0';
  cfg.wifiPassword[sizeof(cfg.wifiPassword)-1]   = '\0';
  cfg.dId[sizeof(cfg.dId)-1]                     = '\0';
  cfg.devicePassword[sizeof(cfg.devicePassword)-1] = '\0';
  cfg.serverIP[sizeof(cfg.serverIP)-1]           = '\0';
  cfg.serverPort[sizeof(cfg.serverPort)-1]       = '\0';

  EEPROM.put(0, cfg);
  bool ok = EEPROM.commit();
  Serial.println(ok ? "[Config] Saved to EEPROM" : "[Config] EEPROM write failed");
  return ok;
}

void clearConfig() {
  EEPROM.begin(EEPROM_SIZE);
  StoredConfig cfg;
  memset(&cfg, 0, sizeof(cfg));  // Wipes magic → provisioning on next boot
  EEPROM.put(0, cfg);
  EEPROM.commit();
  Serial.println("[Config] Cleared — provisioning mode on next boot");
}


// ══════════════════════════════════════════════════════════════════
//  PROVISIONING MODE — AP + HTTP SERVER
// ══════════════════════════════════════════════════════════════════

void handleProvisionCors() {
  provServer.sendHeader("Access-Control-Allow-Origin", "*");
  provServer.sendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  provServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  provServer.send(204);
}

void handleProvision() {
  provServer.sendHeader("Access-Control-Allow-Origin", "*");
  provServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  String body = provServer.arg("plain");
  Serial.println("[Provision] Body: " + body);

  DynamicJsonDocument doc(512);
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    provServer.send(400, "application/json", "{\"status\":\"error\",\"msg\":\"invalid json\"}");
    return;
  }

  String ssid       = doc["ssid"]           | "";
  String wifiPass   = doc["wifiPassword"]   | "";
  String devId      = doc["dId"]            | "";
  String devPass    = doc["devicePassword"] | "";
  String serverIP   = doc["serverIP"]       | "";
  String serverPort = doc["serverPort"]     | "3001";

  if (ssid.isEmpty() || devId.isEmpty() || serverIP.isEmpty()) {
    provServer.send(400, "application/json", "{\"status\":\"error\",\"msg\":\"missing fields\"}");
    return;
  }

  if (saveConfig(ssid, wifiPass, devId, devPass, serverIP, serverPort)) {
    provServer.send(200, "application/json", "{\"status\":\"ok\"}");
    Serial.println("[Provision] Config saved — rebooting...");
    delay(1000);
    ESP.restart();
  } else {
    provServer.send(500, "application/json", "{\"status\":\"error\",\"msg\":\"save failed\"}");
  }
}

void startProvisioningMode() {
  provisioningMode = true;

  String mac = WiFi.macAddress();
  mac.replace(":", "");
  String apSSID = "Wanomi-Config-" + mac.substring(6);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSSID);

  String ip = WiFi.softAPIP().toString();
  Serial.println("\n[Provisioning] AP started");
  Serial.println("  SSID : " + apSSID);
  Serial.println("  IP   : " + ip);
  Serial.println("  POST http://" + ip + "/provision");

  provServer.on("/provision", HTTP_OPTIONS, handleProvisionCors);
  provServer.on("/provision", HTTP_POST,    handleProvision);
  provServer.begin();

  pantallaProvisioning(apSSID);
}


// ══════════════════════════════════════════════════════════════════
//  SETUP + LOOP
// ══════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  pinMode(led, OUTPUT);

  tft.init(240, 240, SPI_MODE2);
  tft.setRotation(1);
  tft.fillScreen(ST77XX_BLACK);

  // Splash
  for (int16_t x = 10; x < tft.width(); x += 20)
    for (int16_t y = 10; y < tft.height(); y += 20)
      tft.fillCircle(x, y, 10, ST77XX_MAGENTA);
  delay(800);
  tft.fillScreen(ST77XX_BLACK);

  Serial.println("\n[Boot] Checking stored config...");
  if (hasStoredConfig() && loadConfig()) {
    Serial.println("[Boot] Config found — NORMAL MODE");
    dht.begin();
    connectToWiFi();
  } else {
    Serial.println("[Boot] No valid config — PROVISIONING MODE");
    startProvisioningMode();
  }
}

void loop() {
  if (provisioningMode) {
    provServer.handleClient();
    return;
  }

  long now = millis();

  if (now - lastSensorRead > 2000) {
    lastSensorRead = now;
    process_sensors();
  }

  if (now - lastDisplayDraw > 1000) {
    lastDisplayDraw = now;
    tft.fillScreen(ST77XX_BLACK);
    pantallaUno();
  }

  if (now - lastMarqueeStep > 200) {
    lastMarqueeStep = now;
    String t = "";
    for (int i = 0; i < marqueeWidth; i++)
      t += marqueeText.charAt((marqueeOffset + i) % marqueeText.length());
    tft.setCursor(0, 225);
    tft.setTextSize(2);
    tft.setTextColor(ST77XX_MAGENTA, ST77XX_BLACK);
    tft.print(t);
    marqueeOffset = (marqueeOffset + 1) % marqueeText.length();
  }

  check_mqtt_connection();
}


// ══════════════════════════════════════════════════════════════════
//  WIFI
// ══════════════════════════════════════════════════════════════════

void connectToWiFi() {
  clear();
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg_ssid.c_str(), cfg_wifi_password.c_str());

  Serial.print(underlinePurple + "\n\n\nWiFi Connection in Progress" + fontReset + Purple);

  int counter = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    counter++;
    if (counter > 30) {
      Serial.println(Red + "\n\n  WiFi Connection Failed — Restarting..." + fontReset);
      delay(2000);
      ESP.restart();
    }
  }

  Serial.println(boldGreen + "\n\n  WiFi Connected :)" + fontReset);
  Serial.println("  IP: " + WiFi.localIP().toString());

  client.setCallback(callback);
}


// ══════════════════════════════════════════════════════════════════
//  MQTT
// ══════════════════════════════════════════════════════════════════

bool get_mqtt_credentials() {
  Serial.println(underlinePurple + "\n\n\nGetting MQTT Credentials..." + fontReset);
  delay(1000);

  HTTPClient http;
  http.begin(espclient, webhook_endpoint);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  int code = http.POST("dId=" + dId + "&password=" + webhook_pass);

  if (code < 0 || code != 200) {
    Serial.println(boldRed + "  Error getting credentials: " + String(code) + fontReset);
    http.end();
    return false;
  }

  String body = http.getString();
  deserializeJson(mqtt_data_doc, body);
  http.end();

  Serial.println(boldGreen + "  Credentials obtained :)" + fontReset);
  delay(1000);
  return true;
}

bool reconnect() {
  if (!get_mqtt_credentials()) {
    Serial.println(boldRed + "  Failed to get MQTT credentials — restarting in 10s" + fontReset);
    delay(10000);
    ESP.restart();
  }

  client.setServer(mqtt_server_str.c_str(), 1883);

  String clientId = "device_" + dId + "_" + String(random(1, 9999));
  const char *username = mqtt_data_doc["username"];
  const char *password = mqtt_data_doc["password"];
  String topic = mqtt_data_doc["topic"].as<String>();

  if (client.connect(clientId.c_str(), username, password)) {
    Serial.println(boldGreen + "  MQTT Connected :)" + fontReset);
    delay(1000);
    client.subscribe((topic + "+/actdata").c_str());
    client.subscribe((topic + "config").c_str());
  } else {
    Serial.println(boldRed + "  MQTT Connection Failed :(" + fontReset);
  }
  return true;
}

void check_mqtt_connection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(Red + "  WiFi lost — restarting..." + fontReset);
    delay(15000);
    ESP.restart();
  }

  if (!client.connected()) {
    long now = millis();
    if (now - lastReconnectAttemp > 5000) {
      lastReconnectAttemp = millis();
      if (reconnect()) lastReconnectAttemp = 0;
    }
  } else {
    client.loop();
    send_data_to_broker();
    print_stats();
  }
}

void callback(char *topic, byte *payload, unsigned int length) {
  String incoming = "";
  for (unsigned int i = 0; i < length; i++)
    incoming += (char)payload[i];
  incoming.trim();
  process_incoming_msg(String(topic), incoming);
}

void process_incoming_msg(String topic, String incoming) {
  last_received_topic = topic;
  last_receives_msg   = incoming;

  String variable = splitter.split(topic, '/', 2);

  for (int i = 0; i < (int)mqtt_data_doc["variables"].size(); i++) {
    if (mqtt_data_doc["variables"][i]["variable"] == variable) {
      DynamicJsonDocument doc(256);
      if (deserializeJson(doc, incoming) == DeserializationError::Ok) {
        if (!doc["value"].isNull()) mqtt_data_doc["variables"][i]["last"]["value"] = doc["value"];
        if (!doc["save"].isNull())  mqtt_data_doc["variables"][i]["last"]["save"]  = doc["save"];
      }
      long counter = mqtt_data_doc["variables"][i]["counter"];
      mqtt_data_doc["variables"][i]["counter"] = counter + 1;
    }
  }

  if (topic.endsWith("/config")) handle_config_update(incoming);

  process_actuactors();
}

void send_data_to_broker() {
  long now = millis();
  for (int i = 0; i < (int)mqtt_data_doc["variables"].size(); i++) {
    if (mqtt_data_doc["variables"][i]["variableType"] == "output") continue;

    int freq = mqtt_data_doc["variables"][i]["variableSendFreq"];
    if (now - varsLastSend[i] > (long)freq * 1000) {
      varsLastSend[i] = now;

      String topic = mqtt_data_doc["topic"].as<String>()
                     + mqtt_data_doc["variables"][i]["variable"].as<String>()
                     + "/sdata";
      String payload;
      serializeJson(mqtt_data_doc["variables"][i]["last"], payload);
      client.publish(topic.c_str(), payload.c_str());

      long cnt = mqtt_data_doc["variables"][i]["counter"];
      mqtt_data_doc["variables"][i]["counter"] = cnt + 1;
    }
  }
}


// ══════════════════════════════════════════════════════════════════
//  SENSORS / ACTUATORS
// ══════════════════════════════════════════════════════════════════

void process_sensors() {
  temp = dht.readTemperature();
  if (!isnan(temp)) prev_temp = temp;

  hum = dht.readHumidity();
  mqtt_data_doc["variables"][1]["last"]["value"] = hum;
  mqtt_data_doc["variables"][1]["last"]["save"]  = 1;
  if (!isnan(hum)) prev_hum = hum;

  sterm = dht.computeHeatIndex(temp, hum, false);
  mqtt_data_doc["variables"][0]["last"]["value"] = sterm;
  mqtt_data_doc["variables"][0]["last"]["save"]  = 1;
  if (!isnan(sterm)) prev_sterm = sterm;

  falloSensores = (isnan(temp) || isnan(hum) || isnan(sterm))
                  ? "DHT read failed!"
                  : "Sensors OK :)";
}

void process_actuactors() {
  JsonVariant ledCmd = mqtt_data_doc["variables"][2]["last"]["value"];
  if (!ledCmd.isNull()) {
    digitalWrite(led, ledCmd.as<int>() != 0 ? HIGH : LOW);
  }
}

void handle_config_update(String incoming) {
  DynamicJsonDocument doc(256);
  if (deserializeJson(doc, incoming) != DeserializationError::Ok) return;

  String variable = doc["variable"] | "";
  int newFreq     = doc["variableSendFreq"] | 0;

  if (variable.isEmpty() || newFreq <= 0) return;

  for (int i = 0; i < (int)mqtt_data_doc["variables"].size(); i++) {
    if (mqtt_data_doc["variables"][i]["variable"] == variable) {
      int oldFreq = mqtt_data_doc["variables"][i]["variableSendFreq"];
      mqtt_data_doc["variables"][i]["variableSendFreq"] = newFreq;
      Serial.println("[Config] " + variable + " freq: " + oldFreq + "s → " + newFreq + "s");
      return;
    }
  }
}


// ══════════════════════════════════════════════════════════════════
//  DISPLAY
// ══════════════════════════════════════════════════════════════════

void clear() {
  Serial.write(27); Serial.print("[2J");
  Serial.write(27); Serial.print("[H");
}

// Provisioning screen — shown while waiting for config
void pantallaProvisioning(String apSSID) {
  tft.fillScreen(ST77XX_BLACK);

  tft.setTextColor(ST77XX_MAGENTA);
  tft.setTextSize(2);
  tft.setCursor(10, 10);
  tft.print("PROVISIONING");

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(10, 40);
  tft.print("Connect to WiFi:");

  tft.setTextColor(ST77XX_CYAN);
  tft.setTextSize(1);
  tft.setCursor(10, 55);
  tft.print(apSSID);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(10, 80);
  tft.print("Then open platform");
  tft.setCursor(10, 95);
  tft.print("Devices > Provision");

  tft.setTextColor(0x679F);
  tft.setTextSize(1);
  tft.setCursor(10, 120);
  tft.print("IP: 192.168.4.1");

  // Pulsing dot to show it's waiting
  tft.fillCircle(120, 180, 15, ST77XX_MAGENTA);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(85, 205);
  tft.print("Waiting...");
}

void print_stats() {
  long now = millis();
  if (now - lastStats < 2000) return;
  lastStats = now;

  clear();
  Serial.print(Purple + "\n╔══════════════════════════╗\n║       SYSTEM STATS       ║\n╚══════════════════════════╝" + fontReset + "\n\n");
  Serial.print(boldCyan + "#\tName\t\tVar\t\tType\t\tCount\t\tLast V" + fontReset + "\n\n");

  for (int i = 0; i < (int)mqtt_data_doc["variables"].size(); i++) {
    String vName = mqtt_data_doc["variables"][i]["variableFullName"] | "";
    String vVar  = mqtt_data_doc["variables"][i]["variable"]        | "";
    String vType = mqtt_data_doc["variables"][i]["variableType"]    | "";
    String vLast = mqtt_data_doc["variables"][i]["last"]            | "";
    long   cnt   = mqtt_data_doc["variables"][i]["counter"]         | 0;

    Serial.println(String(i) + "\t" + vName.substring(0,5) + "\t\t"
                   + vVar.substring(0,10) + "\t" + vType.substring(0,5)
                   + "\t\t" + String(cnt) + "\t\t" + vLast);
  }

  Serial.println(boldGreen + "\nRAM libre: " + fontReset + ESP.getFreeHeap() + " bytes");
  Serial.println(boldGreen + "Último msg: " + fontReset + last_receives_msg);
  Serial.println(boldGreen + "Sensores:   " + fontReset + falloSensores);
  Serial.println(boldGreen + "Device ID:  " + fontReset + dId);
}

void pantallaUno() {
  tft.setCursor(0, 2);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_MAGENTA);
  tft.print(ciudad);
  tft.setCursor(180, 2);
  tft.print(hora);
  tft.print(":");
  if (minutos < 10) tft.print(0);
  tft.print(minutos);

  if      (prev_sterm <= 10) icono = 2;
  else if (prev_sterm <= 20) icono = 5;
  else                       icono = 3;

  tft.drawBitmap(15, 60, iconos[icono], 40, 40, ST77XX_MAGENTA);

  int m = 100, j = 180, l = 182;
  int tempersig = prev_sterm;
  if (tempersig < 0) {
    tempersig = -tempersig;
    tft.setTextSize(4); tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(70, 68); tft.print("-");
    m += 5; j += 5; l += 5;
  }

  tft.setTextColor(0x679F); tft.setTextSize(2);
  tft.setCursor(95, 40); tft.print("S/Termica");

  tft.setTextSize(7); tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(m, 60); tft.print(tempersig);
  tft.setTextSize(3); tft.setCursor(j, 55); tft.print("o");
  tft.setTextSize(3); tft.setCursor(l, 80); tft.print("C");

  tft.setTextColor(0x679F); tft.setTextSize(2);
  tft.setCursor(120, 130); tft.print("Humedad");
  tft.drawBitmap(20, 170, iconos[9], 20, 20, ST77XX_MAGENTA);

  tft.setTextColor(ST77XX_WHITE); tft.setTextSize(7);
  tft.setCursor(100, 150); tft.print(prev_hum);
  tft.setTextSize(5); tft.print("%");
}
