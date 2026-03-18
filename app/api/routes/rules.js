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

      // Sync variableSendFreq in template so firmware publishes at rule frequency
      try {
        const device = await Device.findOne({ dId: newRule.dId, userId: newRule.userId });
        if (device && device.templateId) {
          const template = await Template.findOne({ _id: device.templateId });
          if (template) {
            const widgetIndex = template.widgets.findIndex(w => w.variable === newRule.variable);
            if (widgetIndex !== -1) {
              const currentFreq = Number(template.widgets[widgetIndex].variableSendFreq) || 30;
              const newFreq = Math.min(currentFreq, newRule.triggerTime);
              template.widgets[widgetIndex].variableSendFreq = newFreq;
              await Template.updateOne(
                { _id: device.templateId },
                { $set: { widgets: template.widgets } }
              );
              console.log(("variableSendFreq → " + newFreq + "s for variable '" + newRule.variable + "' (triggerTime=" + newRule.triggerTime + ", prev=" + currentFreq + ")").green);
            }
          }
        }
        // Kick device so it reconnects and fetches the updated variableSendFreq immediately
        kickDevice(newRule.dId); // fire-and-forget
      } catch (e) {
        console.log("Warning: could not update variableSendFreq:", e.message);
      }

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
    // Fetch rule before deletion to recalculate variableSendFreq after
    const ruleDoc = await Rule.findOne({ emqxRuleId: emqxRuleId });

    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + emqxRuleId;
    await axios.delete(url, auth);
    await Rule.deleteOne({ emqxRuleId: emqxRuleId });

    // Restore variableSendFreq based on remaining rules for this variable
    if (ruleDoc) {
      try {
        const remaining = await Rule.find({ userId: ruleDoc.userId, dId: ruleDoc.dId, variable: ruleDoc.variable });
        const device = await Device.findOne({ dId: ruleDoc.dId, userId: ruleDoc.userId });
        if (device && device.templateId) {
          const template = await Template.findOne({ _id: device.templateId });
          if (template) {
            const widgetIndex = template.widgets.findIndex(w => w.variable === ruleDoc.variable);
            if (widgetIndex !== -1) {
              const newFreq = remaining.length > 0
                ? Math.min(...remaining.map(r => r.triggerTime))
                : 30; // default when no rules remain
              template.widgets[widgetIndex].variableSendFreq = newFreq;
              await Template.updateOne(
                { _id: device.templateId },
                { $set: { widgets: template.widgets } }
              );
              console.log(("variableSendFreq restored → " + newFreq + "s for variable '" + ruleDoc.variable + "'").yellow);
            }
          }
        }
        kickDevice(ruleDoc.dId); // fire-and-forget
      } catch (e) {
        console.log("Warning: could not restore variableSendFreq:", e.message);
      }
    }

    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

// Exported for use in devices.js
async function getRules(userId) {
  try {
    const rules = await Rule.find({ userId: userId });
    return rules;
  } catch (error) {
    return [];
  }
}

async function deleteAllRules(userId, dId) {
  try {
    const rules = await Rule.find({ userId: userId, dId: dId });

    for (const rule of rules) {
      const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + rule.emqxRuleId;
      await axios.delete(url, auth);
    }

    await Rule.deleteMany({ userId: userId, dId: dId });
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

// Kick the device from EMQX so it reconnects and re-fetches variableSendFreq.
// Searches by clientId pattern "device_{dId}_" to avoid username rotation mismatch.
async function kickDevice(dId) {
  try {
    const listRes = await axios.get("http://" + process.env.EMQX_API_HOST + ":8085/api/v4/clients", auth);
    const clients = listRes.data && listRes.data.data ? listRes.data.data : [];
    const prefix = "device_" + dId + "_";

    for (const c of clients) {
      if (c.clientid && c.clientid.startsWith(prefix)) {
        await axios.delete("http://" + process.env.EMQX_API_HOST + ":8085/api/v4/clients/" + c.clientid, auth);
        console.log(("Device kicked from EMQX: " + c.clientid).yellow);
      }
    }
  } catch (e) {
    console.log("Warning: could not kick device:", e.message);
  }
}

global.getRules = getRules;
global.deleteAllRules = deleteAllRules;

module.exports = router;
