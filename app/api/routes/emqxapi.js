const express = require("express");
const router = express.Router();
const axios = require("axios");
const colors = require("colors");
const crypto = require("crypto");

const hashPassword = (pwd) => crypto.createHash("sha256").update(pwd).digest("hex");


import EmqxAuthRule from "../models/emqx_auth.js";
import SaverRule from "../models/emqx_saver_rule.js";
import AlarmRule from "../models/emqx_alarm_rule.js";
import Rule from "../models/emqx_rule.js";

const auth = {
  auth: {
    username: "admin",
    password: process.env.EMQX_DEFAULT_APPLICATION_SECRET
  }
};

global.saverResource = null;
global.alarmResource = null;
global.ruleResource = null;

// ****************************************
// ******** EMQX RESOURCES MANAGER ********
// ****************************************

/* This manager corroborates that there are 2 resources,
If there are none, then create them.
If there are one or more than two, issue a warning.
To manually delete the resources and restart node */

/* Este administrador corrobora que existan 2 recursos,
Si no hay ninguno, entonces los crea.
Si hay uno o más de dos, lanza advertencia. 
Para borrar manualmente los recursos y reiniciemos node */

//https://docs.emqx.io/en/broker/v4.1/advanced/http-api.html#response-code

//list resources
async function listResources() {

try {
    const url = "http://" + process.env.EMQX_API_HOST +":8085/api/v4/resources/";

    const res = await axios.get(url, auth);
  
    const size = res.data.data.length;
  
    if (res.status === 200) {

      res.data.data.forEach(resource => {
        if (resource.description == "alarm-webhook") {
          global.alarmResource = resource;
          console.log("▼ ▼ ▼ ALARM RESOURCE FOUND ▼ ▼ ▼ ".bgMagenta);
          console.log(global.alarmResource);
          console.log("▲ ▲ ▲ ALARM RESOURCE FOUND ▲ ▲ ▲ ".bgMagenta);
          console.log("\n");
        }
        if (resource.description == "saver-webhook") {
          global.saverResource = resource;
          console.log("▼ ▼ ▼ SAVER RESOURCE FOUND ▼ ▼ ▼ ".bgMagenta);
          console.log(global.saverResource);
          console.log("▲ ▲ ▲ SAVER RESOURCE FOUND ▲ ▲ ▲ ".bgMagenta);
          console.log("\n");
        }
        if (resource.description == "rule-webhook") {
          global.ruleResource = resource;
          console.log("▼ ▼ ▼ RULE RESOURCE FOUND ▼ ▼ ▼ ".bgMagenta);
          console.log(global.ruleResource);
          console.log("▲ ▲ ▲ RULE RESOURCE FOUND ▲ ▲ ▲ ".bgMagenta);
          console.log("\n");
        }
      });

      const missing = [];
      if (!global.saverResource) missing.push("saver");
      if (!global.alarmResource) missing.push("alarm");
      if (!global.ruleResource) missing.push("rule");

      if (missing.length > 0) {
        console.log(("***** Creating missing emqx webhook resources: " + missing.join(", ") + " *****").green);
        createMissingResources(missing);
      } else {
        console.log("[EMQX] All webhook resources present.".green);
      }

    } else {
        console.log("Error in emqx api");
    }
} catch (error) {
    console.log("Error listing emqx resources");
    console.log(error);
}



 
}

//create missing resources by name
async function createMissingResources(missing) {

    try {
        const url = "http://" + process.env.EMQX_API_HOST +":8085/api/v4/resources";

        const resourceDefs = {
            saver: {
                "type": "web_hook",
                "config": {
                    url: "http://" + process.env.WEBHOOKS_HOST +":3001/api/saver-webhook",
                    headers: { token: process.env.EMQX_API_TOKEN },
                    method: "POST"
                },
                description: "saver-webhook"
            },
            alarm: {
                "type": "web_hook",
                "config": {
                    url: "http://" + process.env.WEBHOOKS_HOST +":3001/api/alarm-webhook",
                    headers: { token: process.env.EMQX_API_TOKEN },
                    method: "POST"
                },
                description: "alarm-webhook"
            },
            rule: {
                "type": "web_hook",
                "config": {
                    url: "http://" + process.env.WEBHOOKS_HOST +":3001/api/rule-webhook",
                    headers: { token: process.env.EMQX_API_TOKEN },
                    method: "POST"
                },
                description: "rule-webhook"
            }
        };

        for (const name of missing) {
            const res = await axios.post(url, resourceDefs[name], auth);
            if (res.status === 200) {
                console.log((name + " resource created!").green);
            }
        }

        console.log("***** Emqx WH resources created *****".green);
    } catch (error) {
        console.log("Error creating resources");
        console.log(error);
    }

}



//check if superuser exist if not we create one
global.check_mqtt_superuser = async function checkMqttSuperUser(){

  try {
    const hashedPassword = hashPassword(process.env.EMQX_NODE_SUPERUSER_PASSWORD);

    await EmqxAuthRule.updateOne(
      { type: "superuser" },
      {
        $set: {
          publish: ["#"],
          subscribe: ["#"],
          userId: "emqxmqttsuperuser",
          username: process.env.EMQX_NODE_SUPERUSER_USER,
          password: hashedPassword,
          type: "superuser",
          updatedTime: Date.now()
        },
        $setOnInsert: { time: Date.now() }
      },
      { upsert: true }
    );

    console.log("Mqtt superuser synced");

  } catch (error) {
    console.log("error syncing mqtt superuser");
    console.log(error);
  }
}

// Function to create user in EMQX auth
async function createEmqxUser(username, password) {
  try {
    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/auth_username";
    const data = {
      username: username,
      password: password
    };
    const res = await axios.post(url, data, auth);
    if (res.status === 200) {
      console.log(`EMQX user ${username} created successfully`.green);
    }
  } catch (error) {
    console.log(`Error creating EMQX user ${username}:`, error.message);
  }
}

// Function to create ACL rules in EMQX
async function createEmqxAcl(username, publishTopics, subscribeTopics) {
  try {
    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/acl";
    const aclRules = [];

    publishTopics.forEach(topic => {
      aclRules.push({
        username: username,
        topic: topic,
        action: "pub",
        allow: true
      });
    });

    subscribeTopics.forEach(topic => {
      aclRules.push({
        username: username,
        topic: topic,
        action: "sub",
        allow: true
      });
    });

    for (const rule of aclRules) {
      const res = await axios.post(url, rule, auth);
      if (res.status === 200) {
        console.log(`EMQX ACL created for ${username} on ${rule.topic} (${rule.action})`.green);
      }
    }
  } catch (error) {
    console.log(`Error creating EMQX ACL for ${username}:`, error.message);
  }
}

// Export functions for use in other files
global.createEmqxUser = createEmqxUser;
global.createEmqxAcl = createEmqxAcl;

// ****************************************
// ******** RULES RECONCILIATION **********
// ****************************************

async function emqxRuleExists(emqxRuleId) {
  try {
    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + emqxRuleId;
    const res = await axios.get(url, auth);
    return res.status === 200 && res.data.code === 0;
  } catch (error) {
    return false;
  }
}

async function reconcileSaverRules() {
  const rules = await SaverRule.find({});
  let ok = 0, fixed = 0, errors = 0;

  for (const rule of rules) {
    try {
      const ruleUrl = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + rule.emqxRuleId;
      let existingRule = null;
      try {
        const res = await axios.get(ruleUrl, auth);
        if (res.status === 200 && res.data.code === 0) existingRule = res.data.data;
      } catch (_) {}

      if (existingRule && existingRule.enabled) {
        ok++;
        continue;
      }

      // Exists but disabled — attempt PUT to re-enable
      // Fallback to recreate if PUT is unsupported (EMQX 4.2.x returns 404/405)
      if (existingRule && !existingRule.enabled && rule.status) {
        let enabledViaput = false;
        try {
          const putRes = await axios.put(ruleUrl, { enabled: true }, auth);
          if (putRes.status === 200) {
            fixed++;
            enabledViaput = true;
            console.log(("  ✔ SaverRule enabled (PUT) dId=" + rule.dId).green);
          } else {
            console.log(("  ⚠ PUT → HTTP " + putRes.status + " for dId=" + rule.dId + " — falling back to recreate").yellow);
          }
        } catch (putErr) {
          console.log(("  ⚠ PUT failed dId=" + rule.dId + ": " + putErr.message + " — falling back to recreate").yellow);
        }
        if (enabledViaput) continue;
        // Fall through to recreate path below
      }

      // Missing or PUT fallback — recreate
      const topic = rule.userId + "/" + rule.dId + "/+/sdata";
      const rawsql = 'SELECT topic, payload FROM "' + topic + '" WHERE payload.save = 1';
      const emqxRule = {
        rawsql,
        actions: [{
          name: "data_to_webserver",
          params: {
            $resource: global.saverResource.id,
            payload_tmpl: '{"userId":"' + rule.userId + '","payload":${payload},"topic":"${topic}"}'
          }
        }],
        description: "SAVER-RULE",
        enabled: rule.status
      };
      const createUrl = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules";
      const createRes = await axios.post(createUrl, emqxRule, auth);
      if (createRes.status === 200 && createRes.data.data) {
        await SaverRule.updateOne({ _id: rule._id }, { emqxRuleId: createRes.data.data.id });
        fixed++;
        console.log(("  ✔ SaverRule recreated dId=" + rule.dId).green);
      } else {
        errors++;
        console.log(("  ✘ SaverRule create failed dId=" + rule.dId + " (HTTP " + (createRes.status || '?') + ")").red);
      }
    } catch (err) {
      errors++;
      console.log(("  ✘ Error reconciling SaverRule dId=" + rule.dId + ": " + err.message).red);
    }
  }

  return { ok, fixed, errors };
}

async function reconcileAlarmRules() {
  const rules = await AlarmRule.find({});
  let recreated = 0;

  for (const rule of rules) {
    const exists = await emqxRuleExists(rule.emqxRuleId);
    if (exists) continue;

    try {
      const topic = rule.userId + "/" + rule.dId + "/" + rule.variable + "/sdata";
      const rawsql =
        'SELECT username, topic, payload FROM "' + topic +
        '" WHERE payload.value ' + rule.condition + " " + rule.value +
        " AND is_not_null(payload.value)";

      const emqxRule = {
        rawsql: rawsql,
        actions: [{
          name: "data_to_webserver",
          params: {
            $resource: global.alarmResource.id,
            payload_tmpl: '{"userId":"' + rule.userId + '","payload":${payload},"topic":"${topic}"}'
          }
        }],
        description: "ALARM-RULE",
        enabled: rule.status
      };

      const createUrl = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules";
      const res = await axios.post(createUrl, emqxRule, auth);

      if (res.status === 200 && res.data.data) {
        const newEmqxId = res.data.data.id;

        const fullPayload =
          '{"userId":"' + rule.userId +
          '","dId":"' + rule.dId +
          '","deviceName":"","payload":${payload},"topic":"${topic}","emqxRuleId":"' + newEmqxId +
          '","value":' + rule.value +
          ',"condition":"' + rule.condition +
          '","variable":"' + rule.variable +
          '","variableFullName":"' + rule.variableFullName +
          '","triggerTime":' + rule.triggerTime + '}';

        emqxRule.actions[0].params.payload_tmpl = fullPayload;
        const updateUrl = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + newEmqxId;
        await axios.put(updateUrl, emqxRule, auth);

        await AlarmRule.updateOne({ _id: rule._id }, { emqxRuleId: newEmqxId });
        recreated++;
        console.log(("  ✔ AlarmRule recreated for dId=" + rule.dId + " var=" + rule.variable).green);
      }
    } catch (err) {
      console.log(("  ✘ Error recreating AlarmRule for dId=" + rule.dId + ": " + err.message).red);
    }
  }

  return recreated;
}

async function reconcileActuatorRules() {
  const rules = await Rule.find({});
  let recreated = 0;

  for (const rule of rules) {
    const exists = await emqxRuleExists(rule.emqxRuleId);
    if (exists) continue;

    try {
      const topic = rule.userId + "/" + rule.dId + "/" + rule.variable + "/sdata";
      const rawsql =
        'SELECT username, topic, payload FROM "' + topic +
        '" WHERE payload.value ' + rule.condition + " " + rule.value +
        " AND is_not_null(payload.value)";

      const emqxRule = {
        rawsql: rawsql,
        actions: [{
          name: "data_to_webserver",
          params: {
            $resource: global.ruleResource.id,
            payload_tmpl: '{"userId":"' + rule.userId + '","payload":${payload},"topic":"${topic}"}'
          }
        }],
        description: "REGLA",
        enabled: rule.status
      };

      const createUrl = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules";
      const res = await axios.post(createUrl, emqxRule, auth);

      if (res.status === 200 && res.data.data) {
        const newEmqxId = res.data.data.id;

        const fullPayload =
          '{"userId":"' + rule.userId +
          '","dId":"' + rule.dId +
          '","deviceName":"","payload":${payload},"topic":"${topic}","emqxRuleId":"' + newEmqxId +
          '","value":' + rule.value +
          ',"condition":"' + rule.condition +
          '","variable":"' + rule.variable +
          '","variableFullName":"' + rule.variableFullName +
          '","triggerTime":' + rule.triggerTime +
          ',"actuatorVariable":"' + rule.actuatorVariable +
          '","actuatorVariableFullName":"' + rule.actuatorVariableFullName +
          '","actuatorValue":' + rule.actuatorValue + '}';

        emqxRule.actions[0].params.payload_tmpl = fullPayload;
        const updateUrl = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/" + newEmqxId;
        await axios.put(updateUrl, emqxRule, auth);

        await Rule.updateOne({ _id: rule._id }, { emqxRuleId: newEmqxId });
        recreated++;
        console.log(("  ✔ ActuatorRule recreated for dId=" + rule.dId + " var=" + rule.variable).green);
      }
    } catch (err) {
      console.log(("  ✘ Error recreating ActuatorRule for dId=" + rule.dId + ": " + err.message).red);
    }
  }

  return recreated;
}

async function reconcileRules() {
  console.log("***** Starting EMQX ↔ MongoDB rules reconciliation *****".cyan);
  try {
    const [saver, alarm, actuator] = await Promise.all([
      reconcileSaverRules(),
      reconcileAlarmRules(),
      reconcileActuatorRules()
    ]);
    console.log(
      ("***** Reconcile — saver: " + saver.ok + " ok, " + saver.fixed + " fixed, " + saver.errors +
       " err | alarm: " + alarm + " recreated | actuator: " + actuator + " recreated *****").cyan
    );
  } catch (err) {
    console.log("Error during rules reconciliation:".red);
    console.log(err);
  }
}

// ----------------------------------------
// Active polling — replaces fixed delay
// ----------------------------------------
async function waitForSaverResource({ intervalMs = 3000, timeoutMs = 120000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    try {
      const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/resources/";
      const res = await axios.get(url, auth);

      if (res.status === 200) {
        res.data.data.forEach(r => {
          if (r.description === "saver-webhook") global.saverResource = r;
          if (r.description === "alarm-webhook")  global.alarmResource = r;
          if (r.description === "rule-webhook")   global.ruleResource  = r;
        });

        const missing = [];
        if (!global.saverResource) missing.push("saver");
        if (!global.alarmResource) missing.push("alarm");
        if (!global.ruleResource)  missing.push("rule");

        if (missing.length > 0) {
          console.log(("[EMQX] Creating missing resources: " + missing.join(", ")).yellow);
          await createMissingResources(missing);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        const statusRes = await axios.get(
          "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/resources/" + global.saverResource.id,
          auth
        );
        const isAlive = (statusRes.data?.data?.status || []).some(s => s.is_alive);

        if (isAlive) {
          console.log(("[EMQX] saver resource ready — attempt " + attempt).green);
          return true;
        }

        console.log(("[EMQX] saver resource not alive yet (attempt " + attempt + ") — retrying in " + intervalMs + "ms...").yellow);
      }
    } catch (e) {
      console.log(("[EMQX] probe error (attempt " + attempt + "): " + e.message).yellow);
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  console.error("[EMQX] ERROR: saver resource not ready after " + timeoutMs + "ms — rules for NEW devices will NOT be created until next restart");
  return false;
}

async function initEmqxResources() {
  const ready = await waitForSaverResource({
    intervalMs: 3000,
    timeoutMs: Math.max(parseInt(process.env.EMQX_RESOURCES_DELAY || 30000) * 4, 120000)
  });
  if (ready) await reconcileRules();
}

initEmqxResources();

module.exports = router;
