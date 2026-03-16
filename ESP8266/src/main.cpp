#include "Arduino.h"
#include "ESP8266WiFi.h"
#include "ESP8266HTTPClient.h"
#include "Adafruit_Sensor.h"
#include <DHT.h>
#include <DHT_U.h>
#include "Colors.h"
#include "IoTicosSplitter.h"
#include "config.h"
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Adafruit_ST7735.h>
#include "Adafruit_ST77xx.h"
#include <SPI.h>
#include "iconosClima.h"

// WiFi
const char *wifi_ssid = WIFI_SSID;
const char *wifi_password = WIFI_PASSWORD;

// Variables Plataforma
String dId = DEVICE_ID;
String webhook_pass = WEBHOOK_PASSWORD;
String webhook_endpoint = WEBHOOK_ENDPOINT;
const char *mqtt_server = MQTT_SERVER_IP;

// PINES

//RELE
#define led D0

// DISPLAY TFT
#define TFT_DC D1  // TFT DC  pin is connected to NodeMCU pin D1 (GPIO5)
#define TFT_RST D2 // TFT RST pin is con192.168.1.18nected to NodeMCU pin D2 (GPIO4)
#define TFT_CS D7  // TFT CS  pin is connected to NodeMCU pin D8 (GPIO15)

// SENSOR
#define DHTPIN GPIO12
#define DHTTYPE DHT11

// Llamado a Funciones
void connectToWiFi();
bool get_mqtt_credentials();
void check_mqtt_connection();
bool reconnect();
void process_sensors();
void process_actuactors();
void send_data_to_broker();
void callback(char *topic, byte *payload, unsigned int lenght);
void process_incoming_msg(String topic, String incoming);
void print_stats();
void clear();
void pantallaUno();


// Variables Globales
WiFiClient espclient;
PubSubClient client(espclient);
IoTicosSplitter splitter;
DynamicJsonDocument mqtt_data_doc(2048);
DHT dht(D6, DHT11);
Adafruit_ST7789 tft = Adafruit_ST7789 (TFT_CS, TFT_DC, TFT_RST);
long lastReconnectAttemp = 0;
int temp;
int hum;
int sterm;
int prev_temp;
int prev_hum;
int prev_sterm;
long varsLastSend[20];
String last_receives_msg = "";
String last_received_topic = "";
String falloSensores = "";
int hora = 14;
int minutos = 25;
String ciudad = "Rio Cuarto";
int icono;

// SETUP

void setup()
{
  Serial.begin(115200);
  connectToWiFi();
  dht.begin();
  tft.init(240, 240, SPI_MODE2);
}

// LOOP

void loop()
{ 
  //sensores
  process_sensors();

  tft.setRotation(1);
  {
  tft.fillScreen(ST77XX_BLACK);
  for (int16_t x=10; x < tft.width(); x+=10*2) 
  {
    for (int16_t y=10; y < tft.height(); y+=10*2) 
    {
      tft.fillCircle(x, y, 10, ST77XX_MAGENTA);
    }
  }
  }
  tft.fillScreen(ST77XX_BLACK);

  pantallaUno();

  //conexion mqtt
  check_mqtt_connection();
}

// TEMPLATE ⤵

// WIFI FUNTIONS

void connectToWiFi()
{
  Serial.begin(115200);

  pinMode(led, OUTPUT);
  clear();

  WiFi.begin(wifi_ssid, wifi_password);

  Serial.print(underlinePurple + "\n\n\nWiFi Connection in Progress" + fontReset + Purple);

  int counter = 0;

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
    counter++;

    if (counter > 15)
    {
      Serial.print("  ⤵" + fontReset);
      Serial.print(Red + "\n\n         Ups WiFi Connection Failed :( ");
      Serial.println(" -> Restarting..." + fontReset);
      delay(2000);
      ESP.restart();
    }
  }

  Serial.print("  ⤵" + fontReset);

  // Printing local ip
  Serial.println(boldGreen + "\n\n         WiFi Connection -> SUCCESS :)" + fontReset);
  Serial.print("\n         Local IP -> ");
  Serial.print(boldBlue);
  Serial.print(WiFi.localIP());
  Serial.println(fontReset);

  // Metodo que atrapa los mensajes del buffer provinientes de plataforma

  client.setCallback(callback);
}

// Function Process Message

void process_incoming_msg(String topic, String incoming)
{
  last_received_topic = topic;
  last_receives_msg = incoming;

  String variable = splitter.split(topic, '/', 2);

  for (int i = 0; i < mqtt_data_doc["variables"].size(); i++)
  {

    if (mqtt_data_doc["variables"][i]["variable"] == variable)
    {
      DynamicJsonDocument doc(256);
      deserializeJson(doc, incoming);
      mqtt_data_doc["variables"][i]["last"] = doc;

      long counter = mqtt_data_doc["variables"][i]["counter"];
      counter++;
      mqtt_data_doc["variables"][i]["counter"] = counter;
    }
  }

  
  process_actuactors();
}

// Function Callback

void callback(char *topic, byte *payload, unsigned int lenght)
{
  String incoming = "";

  for (int i = 0; i < lenght; i++)
  {
    incoming += (char)payload[i];
  }

  incoming.trim();

  process_incoming_msg(String(topic), incoming);
}

// Send data broker Function

void send_data_to_broker()
{
  long now = millis();

  for (int i = 0; i < mqtt_data_doc["variables"].size(); i++)
  {
    if (mqtt_data_doc["variables"][i]["variableType"] == "output")
    {
      continue;
    }

    int freq = mqtt_data_doc["variables"][i]["variableSendFreq"];

    if (now - varsLastSend[i] > freq * 1000)
    {
      varsLastSend[i] = millis();

      String str_root_topic = mqtt_data_doc["topic"];
      String str_variable = mqtt_data_doc["variables"][i]["variable"];
      String topic = str_root_topic + str_variable + "/sdata";

      String toSend = "";

      serializeJson(mqtt_data_doc["variables"][i]["last"], toSend);

      client.publish(topic.c_str(), toSend.c_str());

      // STATS
      long counter = mqtt_data_doc["variables"][i]["counter"];
      counter++;
      mqtt_data_doc["variables"][i]["counter"] = counter;
    }
  }
}

// Function Reconnect de Check Credential Conection

bool reconnect()
{
  if (!get_mqtt_credentials())
  {
    Serial.print(boldRed + "\n\n         Error getting Mqtt Credentials :(  \n\n RESTARTING IN 10 SECONDS");
    Serial.println(fontReset);
    delay(10000);
    ESP.restart();
  }

  // Setting Up Mqtt Server

  client.setServer(mqtt_server, 1883);

  Serial.print(underlinePurple + "\n\n\n Trying Mqtt Connection" + fontReset + Purple + "  ⤵");

  String str_client_id = "device_" + dId + "_" + random(1, 9999);
  const char *username = mqtt_data_doc["username"];
  const char *password = mqtt_data_doc["password"];
  String str_topic = mqtt_data_doc["topic"];

  if (client.connect(str_client_id.c_str(), username, password))
  {
    Serial.print(boldGreen + "\n\n       Mqtt Client Connected :)" + fontReset);
    delay(2000);

    client.subscribe((str_topic + "+/actdata").c_str());
  }
  else
  {
    Serial.print(boldRed + "\n\n         Mqtt Client Connection Failed :(" + fontReset);
  }
  return true;
}

// Check Credential Conection

void check_mqtt_connection()
{

  // Restarting ESP when fail Internet
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.print("  ⤵" + fontReset);
    Serial.print(Red + "\n\n         Ups WiFi Connection Failed :( ");
    Serial.println(" -> Restarting..." + fontReset);
    delay(15000);
    ESP.restart();
  }

  if (!client.connected())
  {
    long now = millis();
    if (now - lastReconnectAttemp > 5000)
    {
      lastReconnectAttemp = millis();
      if (reconnect())
      {
        lastReconnectAttemp = 0;
      }
    }
  }
  else
  {
    client.loop();
    send_data_to_broker();
    print_stats();
  }
}

// Credenciales mqtt  Funtions

bool get_mqtt_credentials()
{

  Serial.print(underlinePurple + "\n\n\n Getting MQTT Credentials from WebHook" + fontReset + Purple + "  ⤵");
  delay(1000);

  HTTPClient http;
  http.begin(espclient, webhook_endpoint);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  int response_code = http.POST("dId=" + dId + "&password=" + webhook_pass);

  if (response_code < 0)
  {
    Serial.print(boldRed + "\n\n         Error Sending Post Request :(" + fontReset);
    http.end();
    return false;
  }

  if (response_code != 200)
  {
    Serial.print(boldRed + "\n\n         Error in Response :(   error ->" + fontReset + "" + response_code);
    http.end();
    return false;
  }

  if (response_code == 200)
  {
    String responseBody = http.getString();

    Serial.print(boldGreen + "\n\n       Mqtt Credentials Obtained Successfully :)" + fontReset);
    deserializeJson(mqtt_data_doc, responseBody);
    http.end();
    delay(2000);
  }

  return true;
}

// Clear Terminal Funtions

void clear()
{
  Serial.write(27);    // ESC command
  Serial.print("[2J"); // Clear screen comand
  Serial.write(27);
  Serial.print("[H");
}

long lastStats = 0;

// Terminal functions

void print_stats()
{
  long now = millis();

  if (now - lastStats > 2000)
  {
    lastStats = millis();
    clear();

    Serial.print("\n");
    Serial.print(Purple + "\n╔══════════════════════════╗" + fontReset);
    Serial.print(Purple + "\n║       SYSTEM STATS       ║" + fontReset);
    Serial.print(Purple + "\n╚══════════════════════════╝" + fontReset);
    Serial.print("\n\n");
    Serial.print("\n\n");

    Serial.print(boldCyan + "#" + " \t Name" + " \t\t Var" + " \t\t Type" + " \t\t Count" + " \t\t Last V" + fontReset + "\n\n");

    for (int i = 0; i < mqtt_data_doc["variables"].size(); i++)
    {

      String variableFullName = mqtt_data_doc["variables"][i]["variableFullName"];
      String variable = mqtt_data_doc["variables"][i]["variable"];
      String variableType = mqtt_data_doc["variables"][i]["variableType"];
      String lastMsg = mqtt_data_doc["variables"][i]["last"];
      long counter = mqtt_data_doc["variables"][i]["counter"];

      Serial.println(String(i) + " \t " + variableFullName.substring(0, 5) + " \t\t " + variable.substring(0, 10) + " \t " + variableType.substring(0, 5) + " \t\t " + String(counter).substring(0, 10) + " \t\t " + lastMsg);
    }

    Serial.print(boldGreen + "\n\n RAM Libre -> " + fontReset + ESP.getFreeHeap() + " Bytes");

    Serial.print(boldGreen + "\n\n Ultimo Mensaje Entrante -> " + fontReset + last_receives_msg);

    Serial.print(boldGreen + "\n\n Estado Sensores -> " + fontReset + falloSensores);
  }
}

// PROGRAMACION DE SENSORES Y ACTUADORES ⤵

// Sensores

void process_sensors()
{

  // Sensando Temperatura

  temp = dht.readTemperature();

  if (!isnan(temp)) prev_temp = temp;

  // Sensando Humedad

  hum = dht.readHumidity();
  mqtt_data_doc["variables"][1]["last"]["value"] = hum;

  // Siempre guardamos humedad
  mqtt_data_doc["variables"][1]["last"]["save"] = 1;

  if (!isnan(hum)) prev_hum = hum;

  // Sensacion Termica (heat index)

  sterm = dht.computeHeatIndex(temp, hum, false);
  mqtt_data_doc["variables"][0]["last"]["value"] = sterm;
  mqtt_data_doc["variables"][0]["last"]["save"] = 1;

  if (!isnan(sterm)) prev_sterm = sterm;

  // Comprueba si hay algún fallo de lectura del sensor DHT, (si lo hay inicia de nuevo el programa)

  if (isnan(temp) || isnan(hum) || isnan(sterm))
  {

    falloSensores = "Fallo de lectura desde el sensor DHT!";
    return;
  }
  else

  {

    falloSensores = "Sensores Success :)";
  }

  delay(500);
}

// Simulacion de Actuadores

void process_actuactors()
{
  // Index [2] is "Luz" (output variable, Bpk9exkuBZ)
  // Platform sends {"value": true} to turn ON, {"value": false} to turn OFF
  JsonVariant ledCmd = mqtt_data_doc["variables"][2]["last"]["value"];
  if (!ledCmd.isNull()) {
    digitalWrite(led, (bool)ledCmd ? HIGH : LOW);
  }
}

void pantallaUno()
{

  // Imprimir cabecera, donde se muestra la ciudad y la hora

  tft.setCursor(0, 2);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_MAGENTA);
  tft.print(ciudad); // se imprime la ciudad
  tft.setCursor(180, 2);
  tft.print(hora);
  tft.print(":");
  if (minutos < 10) // Condición cuando los minutos sean menos de 10
  {
    tft.print(0); // Que se imprima un 0
  }
  tft.print(minutos); // se imprimen los minutos

  if (prev_sterm <= -1)
  {
    icono = 2;
  }
  else if (prev_sterm <= 5)
  {
    icono = 2;
  }
  else if (prev_sterm <= 10)
  {
    icono = 2;
  }
  else if (prev_sterm <= 15)
  {
    icono = 5;
  }
  else if (prev_sterm <= 20)
  {
    icono = 5;
  }
  else if (prev_sterm <= 25)
  {
    icono = 3;
  }
  else if (prev_sterm <= 29)
  {
    icono = 3;
  }
  else if (prev_sterm <= 34)
  {
    icono = 3;
  }
  else if (prev_sterm <= 50)
  {
    icono = 3;
  }

  // Dibujar icono del clima dependiendo de la variable icono que obtenemos de la función ObtenerDatos
  tft.drawBitmap(15, 60, iconos[icono], 40, 40, ST77XX_MAGENTA);

  // Dibujamos temperatura
  int m = 100; // Variable para recorrer los grados y dejar espacio al signo negativo
  int j = 180;
  int l = 182;
  int tempersig = prev_sterm; // Para no modificar temper guardamos su valor en tempersig y ahora sí modificar tempersig

  if (tempersig < 0) // Condición para imprimir un numero negativo y dejar espacio al signo
  {
    tempersig = tempersig * -1;
    tft.setTextSize(4);
    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(70, 68);
    tft.print("-"); // Imprimimos el símbolo negativo
    m = m + 5;
    j = 180 + 5;
    l = 182 + 5;
  }

  tft.setTextColor(0x679F);
  tft.setTextSize(2);
  tft.setCursor(95, 40);
  tft.print("S/Termica");
  tft.setTextSize(7);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(m, 60);
  tft.print(tempersig); // Imprimimos los grados
  tft.setTextSize(3);
  tft.setCursor(j, 55);
  tft.print("o"); // Se imprime el símbolo de grados
  tft.setTextSize(3);
  tft.setCursor(l, 80);
  tft.print("C"); // Se imprime C para centígrados

  // Para imprimir humedad
  tft.setTextColor(0x679F);
  tft.setTextSize(2);
  tft.setCursor(120, 130);
  tft.print("Humedad");
  tft.drawBitmap(20, 170, iconos[9], 20, 20, ST77XX_MAGENTA); // Imprimir el ícono de la humedad
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(7);
  tft.setCursor(100, 150);
  tft.print(prev_hum); // Imprimimos la variable hum
  tft.setTextSize(5);
  tft.print("%"); // Que se muestre el porcentaje

  {
    tft.setTextSize(2);
    tft.setTextColor(ST77XX_MAGENTA, ST77XX_BLACK);
    String text = " wanomi God Level Sensacion Termica y Humedad      "; // sample text

    const int width = 40; // width of the marquee display (in characters)

    // Loop once through the string

    for (int offset = 0; offset < text.length(); offset++)
    {

      // Construct the string to display for this iteration

      String t = "";

      for (int i = 0; i < width; i++)

        t += text.charAt((offset + i) % text.length());

      // Print the string for this iteration
      tft.setCursor(0, 225);

      tft.print(t);

      // Process MQTT messages while scrolling to avoid command latency
      client.loop();

      // Short delay so the text doesn't move too fast

      delay(200);
    }
  }

}
