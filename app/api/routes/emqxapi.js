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
        // All resources ready — reconcile MongoDB rules with EMQX
        reconcileRules();
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

        setTimeout(() => {
            console.log("***** Emqx WH resources created! Refreshing... *****".green);
            listResources();
        }, 1000);
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
          publish: [{ topic: "#" }],
          subscribe: [{ topic: "#" }],
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
  let recreated = 0;

  for (const rule of rules) {
    const exists = await emqxRuleExists(rule.emqxRuleId);
    if (exists) continue;

    try {
      const topic = rule.userId + "/" + rule.dId + "/+/sdata";
      const rawsql = 'SELECT topic, payload FROM "' + topic + '" WHERE payload.save = 1';

      const emqxRule = {
        rawsql: rawsql,
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

      const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules";
      const res = await axios.post(url, emqxRule, auth);

      if (res.status === 200 && res.data.data) {
        await SaverRule.updateOne({ _id: rule._id }, { emqxRuleId: res.data.data.id });
        recreated++;
        console.log(("  ✔ SaverRule recreated for dId=" + rule.dId).green);
      }
    } catch (err) {
      console.log(("  ✘ Error recreating SaverRule for dId=" + rule.dId + ": " + err.message).red);
    }
  }

  return recreated;
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
    const [s, a, r] = await Promise.all([
      reconcileSaverRules(),
      reconcileAlarmRules(),
      reconcileActuatorRules()
    ]);
    console.log(
      ("***** Reconciliation complete — recreated: " +
       s + " saver, " + a + " alarm, " + r + " actuator rules *****").cyan
    );
  } catch (err) {
    console.log("Error during rules reconciliation:".red);
    console.log(err);
  }
}

setTimeout(() => {
  console.log("LISTING RESORUCES!!!!!!!!!");
  listResources();
}, process.env.EMQX_RESOURCES_DELAY);

module.exports = router;
