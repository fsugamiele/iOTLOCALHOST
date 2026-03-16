import paho.mqtt.client as mqtt

# MQTT settings
broker = "192.168.1.186"
port = 1883
username = "h3K5ci6Roh"
password = "FlATlbKepC"
client_id = "test_client"
topic = "69aa00efff0c3d2e00eece09/2020/"

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected successfully")
        client.subscribe(topic + "+/actdata")
    else:
        print(f"Connection failed with code {rc}")

def on_message(client, userdata, msg):
    print(f"Message received: {msg.topic} {msg.payload}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id)
client.username_pw_set(username, password)
client.on_connect = on_connect
client.on_message = on_message

print("Connecting to MQTT...")
client.connect(broker, port, 60)
client.loop_start()

# Wait a bit
import time
time.sleep(5)
client.loop_stop()
client.disconnect()