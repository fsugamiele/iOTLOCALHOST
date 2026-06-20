const express = require("express");
const router = express.Router();
const axios = require("axios");
const { checkAuth } = require("../middlewares/authentication.js");
const colors = require("colors");

import Rule from "../models/emqx_rule.js";
import Device from "../models/device.js";
import Template from "../models/template.js";

const auth = {
  auth: {
    username: "admin",
    password: process.env.EMQX_DEFAULT_APPLICATION_SECRET
  }
};

const VALID_CONDITIONS = [">", "<", ">=", "<=", "=", "!="];

//CREATE RULE
router.post("/rule", checkAuth, async (req, res) => {
  try {
    var newRule = req.body.newRule;

    if (!global.ruleResource) {
      return res.status(503).json({ status: "error", error: "EMQX resources not ready yet, please wait a moment and retry" });
    }

    if (!newRule || !newRule.dId || !newRule.variable || !newRule.condition ||
        newRule.value === undefined || !newRule.triggerTime ||
        !newRule.actuatorVariable || newRule.actuatorValue === undefined) {
      return res.status(400).json({ status: "error", error: "dId, variable, condition, value, triggerTime, actuatorVariable and actuatorValue are required" });
    }

    if (!VALID_CONDITIONS.includes(newRule.condition)) {
      return res.status(400).json({ status: "error", error: "Invalid condition. Allowed: > < >= <= = !=" });
    }

    if (newRule.triggerTime < 1) {
      return res.status(400).json({ status: "error", error: "triggerTime must be at least 1 second" });
    }

    newRule.userId = req.userData._id;

    var r = await createRule(newRule);

    if (r) {
      return res.json({ status: "success" });
    } else {
      return res.status(500).json({ status: "error" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: "error" });
  }
});

//UPDATE RULE STATUS
router.put("/rule", checkAuth, async (req, res) => {
  try {
    var rule = req.body.rule;

    var r = await updateRuleStatus(rule.emqxRuleId, rule.status);

    if (r) {
      return res.json({ status: "success" });
    } else {
      return res.json({ status: "error" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: "error" });
  }
});

//DELETE RULE
router.delete("/rule", checkAuth, async (req, res) => {
  try {
    var emqxRuleId = req.query.emqxRuleId;

    var r = await deleteRule(emqxRuleId);

    if (r) {
      return res.json({ status: "success" });
    } else {
      return res.json({ status: "error" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: "error" });
  }
});


//**********************
//**** FUNCTIONS *******
//**********************

async function createRule(newRule) {
  try {
    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules";

    const topic = newRule.userId + "/" + newRule.dId + "/" + newRule.variable + "/sdata";

    const rawsql =
      'SELECT username, topic, payload FROM "' +
      topic +
      '" WHERE payload.value ' +
      newRule.condition +
      " " +
      newRule.value +
      " AND is_not_null(payload.value)";

    var emqxRule = {
      rawsql: rawsql,
      actions: [
        {
          name: "data_to_webserver",
          params: {
            $resource: global.ruleResource.id,
            payload_tmpl: '{"userId":"' + newRule.userId + '","payload":${payload},"topic":"${topic}"}'
          }
        }
      ],
      description: "REGLA",
      enabled: newRule.status !== undefined ? newRule.status : true
    };

    const res = await axios.post(url, emqxRule, auth);

    if (!res.data || !res.data.data || !res.data.data.id) {
      throw new Error("Invalid EMQX response format");
    }

    var emqxRuleId = res.data.data.id;

    if (res.data.data && res.status === 200) {
      const mongoRule = await Rule.create({
        userId: newRule.userId,
        dId: newRule.dId,
        emqxRuleId: emqxRuleId,
        status: newRule.status !== undefined ? newRule.status : true,
        variable: newRule.variable,
        variableFullName: newRule.variableFullName,
        value: newRule.value,
        condition: newRule.condition,
        triggerTime: newRule.triggerTime,
        actuatorVariable: newRule.actuatorVariable,
        actuatorVariableFullName: newRule.actuatorVariableFullName,
        actuatorValue: newRule.actuatorValue,
        createdTime: Date.now()
      });

      const updateUrl = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + mongoRule.emqxRuleId;

      const payload_templ =
        '{"userId":"' + newRule.userId +
        '","dId":"' + newRule.dId +
        '","deviceName":"' + newRule.deviceName +
        '","payload":${payload},"topic":"${topic}","emqxRuleId":"' + mongoRule.emqxRuleId +
        '","value":' + newRule.value +
        ',"condition":"' + newRule.condition +
        '","variable":"' + newRule.variable +
        '","variableFullName":"' + newRule.variableFullName +
        '","triggerTime":' + newRule.triggerTime +
        ',"actuatorVariable":"' + newRule.actuatorVariable +
        '","actuatorVariableFullName":"' + newRule.actuatorVariableFullName +
        '","actuatorValue":' + newRule.actuatorValue + '}';

      emqxRule.actions[0].params.payload_tmpl = payload_templ;
      await axios.put(updateUrl, emqxRule, auth);

      // Notify device of new effective send frequency for this variable
      const effectiveFreq = await getEffectiveFreq(newRule.userId, newRule.dId, newRule.variable);
      await sendMqttConfigUpdate(newRule.userId, newRule.dId, newRule.variable, effectiveFreq);

      console.log("New Rule Created...".green);
      return true;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

async function updateRuleStatus(emqxRuleId, status) {
  try {
    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + emqxRuleId;

    const res = await axios.put(url, { enabled: status }, auth);

    if (res.status === 200) {
      await Rule.updateOne({ emqxRuleId: emqxRuleId }, { status: status });

      // Notify device of new effective send frequency after status change
      const rule = await Rule.findOne({ emqxRuleId: emqxRuleId });
      if (rule) {
        const effectiveFreq = await getEffectiveFreq(rule.userId, rule.dId, rule.variable);
        await sendMqttConfigUpdate(rule.userId, rule.dId, rule.variable, effectiveFreq);
      }

      console.log("Rule Status Updated...".green);
      return true;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

async function deleteRule(emqxRuleId) {
  try {
    const ruleToDelete = await Rule.findOne({ emqxRuleId: emqxRuleId });

    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + emqxRuleId;
    await axios.delete(url, auth);
    await Rule.deleteOne({ emqxRuleId: emqxRuleId });

    // Notify device of new effective send frequency after deletion
    if (ruleToDelete) {
      const effectiveFreq = await getEffectiveFreq(ruleToDelete.userId, ruleToDelete.dId, ruleToDelete.variable);
      await sendMqttConfigUpdate(ruleToDelete.userId, ruleToDelete.dId, ruleToDelete.variable, effectiveFreq);
    }

    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

// Returns the effective send frequency for a variable on a device.
// = minimum triggerTime among active rules for that variable,
//   or the template's default variableSendFreq if no active rules.
// The template is NEVER modified.
async function getEffectiveFreq(userId, dId, variable) {
  try {
    const activeRules = await Rule.find({ userId, dId, variable, status: true });

    if (activeRules.length > 0) {
      return Math.min(...activeRules.map(r => r.triggerTime));
    }

    // No active rules — return template default
    const device = await Device.findOne({ userId, dId });
    if (device && device.templateId) {
      const template = await Template.findOne({ _id: device.templateId });
      if (template) {
        const widget = template.widgets.find(w => w.variable === variable);
        if (widget) return Number(widget.variableSendFreq) || 30;
      }
    }
    return 30;
  } catch (error) {
    console.log("Error computing effective freq:", error);
    return 30;
  }
}

// Sends MQTT config message to a connected device so it updates its send
// frequency in real time without needing to reconnect.
async function sendMqttConfigUpdate(userId, dId, variable, freqSeconds) {
  try {
    const topic = userId + "/" + dId + "/config";
    const payload = { variable, variableSendFreq: freqSeconds };

    if (global.mqttClient && global.mqttClient.connected) {
      global.mqttClient.publish(topic, JSON.stringify(payload));
      console.log(("Sent config update → " + variable + " = " + freqSeconds + "s").cyan);
    } else {
      console.log("MQTT client not connected, config update skipped".yellow);
    }
  } catch (error) {
    console.log("Error sending MQTT config update:", error);
  }
}

async function getRules(dIds) {
  try {
    return await Rule.find({ dId: { $in: dIds } });
  } catch (error) {
    return [];
  }
}

async function deleteAllRules(userId, dId) {
  try {
    const rules = await Rule.find({ userId, dId });

    for (const rule of rules) {
      const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + rule.emqxRuleId;
      await axios.delete(url, auth);
    }

    await Rule.deleteMany({ userId, dId });
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

global.getRules = getRules;
global.deleteAllRules = deleteAllRules;
global.getEffectiveFreq = getEffectiveFreq;
global.sendMqttConfigUpdate = sendMqttConfigUpdate;

module.exports = router;
