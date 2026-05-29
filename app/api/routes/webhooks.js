const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
var mqtt = require("mqtt");
const axios = require("axios");
const colors = require("colors");
const crypto = require("crypto");

const hashPassword = (pwd) => crypto.createHash("sha256").update(pwd).digest("hex");

import Data from "../models/data.js";
import Device from "../models/device.js";
import EmqxAuthRule from "../models/emqx_auth.js";
import Notification from "../models/notifications.js";
import AlarmRule from "../models/emqx_alarm_rule.js";
import Rule from "../models/emqx_rule.js";
import Template from "../models/template.js";
import { dispatchForensicEvent } from "../services/forensic_dispatcher.js";

var client;

// In-memory cooldown trackers — O(1) lookup, no DB on critical path
// key: emqxRuleId  value: last trigger timestamp (ms)
const alarmTriggerTimes = new Map();
const ruleTriggerTimes  = new Map();

//******************
//**** A P I *******
//******************


// Health-check endpoints for EMQX resource initialization probes
router.get("/saver-webhook", (req, res) => res.status(200).json());
router.get("/alarm-webhook", (req, res) => res.status(200).json());
router.get("/rule-webhook",  (req, res) => res.status(200).json());

//DEVICE CREDENTIALS WEBHOOK
router.post("/getdevicecredentials", async (req, res) => {
  try {
    const dId = req.body.dId;
    const password = req.body.password;

    const device = await Device.findOne({ dId });
    if (!device) return res.status(404).json();
    if (password != device.password) return res.status(401).json();

    const userId = device.userId;
    const credentials = await getDeviceMqttCredentials(dId, userId, device.firmwareType);
    const template = await Template.findOne({ _id: device.templateId });

    // Load all active rules for this device to compute effective send frequencies.
    // The template is never modified — effective freq is calculated on the fly.
    const activeRules = await Rule.find({ userId, dId, status: true });

    const variables = template.widgets.map(widget => {
      const { variable, variableFullName, variableType, variableSendFreq } = widget;

      // Among all active rules for this variable, use the minimum triggerTime.
      // If no active rules exist for this variable, fall back to the template default.
      const rulesForVar = activeRules.filter(r => r.variable === variable);
      const effectiveFreq = rulesForVar.length > 0
        ? Math.min(...rulesForVar.map(r => r.triggerTime))
        : Number(variableSendFreq) || 30;

      return { variable, variableFullName, variableType, variableSendFreq: effectiveFreq };
    });

    res.json({
      username: credentials.username,
      password: credentials.password,
      topic: userId + "/" + dId + "/",
      variables
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
}); 
 
//SAVER WEBHOOK
router.post("/saver-webhook", async (req, res) => {
  try {
    if (req.headers.token != process.env.EMQX_API_TOKEN) {
      res.status(404).json();
      return;
    }

    const data = req.body;

    const splittedTopic = data.topic.split("/");
    const dId = splittedTopic[1];
    const variable = splittedTopic[2];

    var result = await Device.find({ dId: dId, userId: data.userId });

    if (result.length == 1) {
      try {
        const savedData = await Data.create({
          userId: data.userId,
          dId: dId,
          variable: variable,
          value: data.payload.value,
          time: Date.now()
        });
        console.log("Data created successfully:", {
          userId: data.userId,
          dId: dId,
          variable: variable,
          value: data.payload.value,
          _id: savedData._id
        });
      } catch (createError) {
        console.log("Error creating data:", createError);
      }
    } else {
      console.log("Device not found:", { dId: dId, userId: data.userId, resultLength: result.length });
    }

    return res.status(200).json();
  } catch (error) {
    console.log(error);
    return res.status(500).json();
  }
});

//ALARMS WEBHOOK
router.post("/alarm-webhook", async (req, res) => {
  try {
    if (req.headers.token != process.env.EMQX_API_TOKEN) {
      res.status(404).json();
      return;
    }

    res.status(200).json();

    const incomingAlarm = req.body;
    const now = Date.now();
    const lastTrigger = alarmTriggerTimes.get(incomingAlarm.emqxRuleId) || 0;
    const cooldownMs = incomingAlarm.triggerTime * 900; // 90% of triggerTime to absorb jitter

    if ((now - lastTrigger) >= cooldownMs) {
      alarmTriggerTimes.set(incomingAlarm.emqxRuleId, now);
      sendMqttNotif(incomingAlarm);
      saveNotifToMongo(incomingAlarm);       // async, non-blocking
      updateAlarmCounter(incomingAlarm.emqxRuleId); // async, non-blocking
      dispatchForensicEvent(incomingAlarm);  // async, non-blocking — skipped if device has no siteId
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json();
  }
});

//RULE WEBHOOK
router.post("/rule-webhook", async (req, res) => {
  try {
    if (req.headers.token != process.env.EMQX_API_TOKEN) {
      res.status(404).json();
      return;
    }

    res.status(200).json();

    const incomingRule = req.body;
    const now = Date.now();
    const lastTrigger = ruleTriggerTimes.get(incomingRule.emqxRuleId) || 0;
    const cooldownMs = incomingRule.triggerTime * 900; // 90% of triggerTime to absorb jitter
    const timeSinceLastTrigger = now - lastTrigger;

    // DEBUG: Uncomment for troubleshooting rule timing issues
    // console.log(`🔥 RULE WEBHOOK DEBUG: Rule ID: ${incomingRule.emqxRuleId}, TriggerTime: ${incomingRule.triggerTime}s, Cooldown: ${cooldownMs}ms, Time since last: ${timeSinceLastTrigger}ms, Will execute: ${timeSinceLastTrigger >= cooldownMs}`);

    if ((now - lastTrigger) >= cooldownMs) {
      ruleTriggerTimes.set(incomingRule.emqxRuleId, now);
      sendActuatorCommand(incomingRule);         // crítico — primero
      sendMqttRuleNotif(incomingRule);           // crítico — segundo
      saveRuleNotifToMongo(incomingRule);        // async, non-blocking
      updateRuleCounter(incomingRule.emqxRuleId); // async, non-blocking
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json();
  }
});

//GET NOTIFICATIONS
router.get("/notifications", checkAuth, async (req, res) => {
  try {
    const userId = req.userData._id;

    const notifications = await getNotifications(userId);

    const response = {
      status: "success",
      data: notifications
    };

    res.json(response);
  } catch (error) {
    console.log("ERROR GETTING NOTIFICATIONS");
    console.log(error);

    const response = {
      status: "error",
      error: error
    };

    return res.status(500).json(response);
  }
});

//UPDATE NOTIFICATION (readed status)
router.put("/notifications", checkAuth, async (req, res) => {
  try {
    const userId = req.userData._id;

    const notificationId = req.body.notifId;

    await Notification.updateOne(
      { userId: userId, _id: notificationId },
      { readed: true }
    );

    const response = {
      status: "success"
    };

    res.json(response);
  } catch (error) {
    console.log("ERROR UPDATING NOTIFICATION STATUS");
    console.log(error);

    const response = {
      status: "error",
      error: error
    };

    return res.status(500).json(response);
  }
});

//**********************
//**** FUNCTIONS *******
//**********************

async function getDeviceMqttCredentials(dId, userId, firmwareType) {
  try {
    var rule = await EmqxAuthRule.find({
      type: "device",
      userId: userId,
      dId: dId
    });

    const subscribeTopics = [
      userId + "/" + dId + "/+/actdata",
      userId + "/" + dId + "/config"
    ];
    if (firmwareType === 'wanomi-sim') {
      subscribeTopics.push(`simulator/${dId}/control`);
    }

    if (rule.length == 0) {
      const plainPassword = makeid(10);
      const newRule = {
        userId: userId,
        dId: dId,
        username: makeid(10),
        password: hashPassword(plainPassword),
        publish: [userId + "/" + dId + "/+/sdata"],
        subscribe: subscribeTopics,
        type: "device",
        time: Date.now(),
        updatedTime: Date.now()
      };

      const result = await EmqxAuthRule.create(newRule);

      return {
        username: result.username,
        password: plainPassword
      };
    }

    const newUserName = makeid(10);
    const newPassword = makeid(10);

    const result = await EmqxAuthRule.updateOne(
      { type: "device", userId: userId, dId: dId },
      {
        $set: {
          username: newUserName,
          password: hashPassword(newPassword),
          publish: [userId + "/" + dId + "/+/sdata"],
          subscribe: subscribeTopics,
          updatedTime: Date.now()
        }
      }
    );

    // update response example
    //{ n: 1, nModified: 1, ok: 1 }

    if (result.n == 1 && result.ok == 1) {
      return {
        username: newUserName,
        password: newPassword
      };
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

function startMqttClient() {
  const options = {
    port: 1883,
    host: process.env.EMQX_API_HOST,
    clientId:
      "webhook_superuser" + Math.round(Math.random() * (0 - 10000) * -1),
    username: process.env.EMQX_NODE_SUPERUSER_USER,
    password: process.env.EMQX_NODE_SUPERUSER_PASSWORD,
    keepalive: 60,
    reconnectPeriod: 5000,
    protocolId: "MQIsdp",
    protocolVersion: 3,
    clean: true,
    encoding: "utf8"
  };

  client = mqtt.connect("mqtt://" + process.env.EMQX_API_HOST, options);
  global.mqttClient = client;

  client.on("connect", function() {
    console.log("MQTT CONNECTION -> SUCCESS;".green);
    console.log("\n");
    global.startTasmotaBridge(client);
  });

  client.on("reconnect", error => {
    console.log("RECONNECTING MQTT");
    console.log(error);
  });

  client.on("error", error => {
    console.log("MQTT CONNECIONT FAIL -> ");
    console.log(error);
  });
}

function sendMqttNotif(notif) {
  const topic = notif.userId + "/dummy-did/dummy-var/notif";
  const msg =
    "The rule: when the " +
    notif.variableFullName +
    " is " +
    notif.condition +
    " than " +
    notif.value;
  client.publish(topic, msg);
}

//GET ALL NOT READED NOTIFICATIONS
async function getNotifications(userId) {
  try {
    const res = await Notification.find({ userId: userId, readed: false });
    return res;
  } catch (error) {
    console.log(error);
    return false;
  }
}

function saveNotifToMongo(incomingAlarm) {
  try {
    var newNotif = incomingAlarm;
    newNotif.time = Date.now();
    newNotif.readed = false;
    Notification.create(newNotif);
  } catch (error) {
    console.log(error);
    return false;
  }
}

function sendActuatorCommand(rule) {
  try {
    const topic = rule.userId + "/" + rule.dId + "/" + rule.actuatorVariable + "/actdata";
    const msg = JSON.stringify({ value: rule.actuatorValue });
    client.publish(topic, msg);
    console.log("Actuator command sent to: " + topic + " value: " + rule.actuatorValue);
  } catch (error) {
    console.log(error);
  }
}

function sendMqttRuleNotif(rule) {
  const topic = rule.userId + "/dummy-did/dummy-var/notif";
  const msg =
    "Regla activada: " +
    rule.variableFullName +
    " " + rule.condition +
    " " + rule.value +
    " → " + rule.actuatorVariableFullName +
    " = " + (rule.actuatorValue == 1 ? "Activado" : "Desactivado");
  client.publish(topic, msg);
}

function saveRuleNotifToMongo(rule) {
  try {
    Notification.create({
      userId: rule.userId,
      dId: rule.dId,
      deviceName: rule.deviceName,
      payload: rule.payload,
      emqxRuleId: rule.emqxRuleId,
      topic: rule.topic,
      value: rule.value,
      condition: rule.condition,
      variable: rule.variable,
      variableFullName: rule.variableFullName,
      readed: false,
      time: Date.now()
    });
  } catch (error) {
    console.log(error);
  }
}

async function updateRuleCounter(emqxRuleId) {
  try {
    await Rule.updateOne(
      { emqxRuleId: emqxRuleId },
      { $inc: { counter: 1 } }
    );
  } catch (error) {
    console.log(error);
  }
}

async function updateAlarmCounter(emqxRuleId) {
  try {
    await AlarmRule.updateOne(
      { emqxRuleId: emqxRuleId },
      { $inc: { counter: 1 } }
    );
  } catch (error) {
    console.log(error);
    return false;
  }
}

function makeid(length) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

global.startMqttClient = startMqttClient;

module.exports = router;
