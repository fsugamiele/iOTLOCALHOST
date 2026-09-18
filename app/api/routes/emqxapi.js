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
  // DEC-REF-103 (#77) — reconcile SIEMPRE, haya o no confirmación de alive:
  // en EMQX 4.2.3 un recurso sano puede reportar status:[] (vacío) por ~1 min
  // tras el boot y waitForSaverResource vencería sin reconcile, dejando las
  // reglas sin recrear. El reconcile es idempotente; si el recurso está
  // realmente muerto, el watchdog lo remedia después.
  await waitForSaverResource({
    intervalMs: 3000,
    timeoutMs: Math.max(parseInt(process.env.EMQX_RESOURCES_DELAY || 30000) * 4, 120000)
  });
  await reconcileRules();
}

initEmqxResources();

// ════════════════════════════════════════════════════════════════════════════
// BACKLOG-OPS-1 / DEC-REF-103 (#77) — watchdog runtime de recursos EMQX.
//
// Mecanismo del desastre que previene (medido 2026-09-18, gap de ingesta de
// 5,6 h): si EMQX bootea con node sin servir, el resource web_hook queda
// `resource_not_initialized` ⇒ EMQX AUTO-DESABILITA las SAVER-RULE y el
// recurso queda is_alive=false para siempre (4.2.3 no re-inicializa; no hay
// PUT de resources ni `eval` en este build). Desde afuera: matched N /
// success 0 / failed N y db.data vacía con el sim publicando.
//
// Estrategia: poll cada WATCHDOG_INTERVAL_MS; debounce de 2 lecturas malas
// consecutivas (el episodio sano se auto-recupera en segundos y no merece
// cirugía); remediación = DELETE reglas atadas → DELETE recurso → recrear →
// reconcileRules() (camino probado en RISK-SEC-9). Throttle 5 min por recurso.
// Fire-and-forget: ningún error del watchdog puede bajar la API.
// ════════════════════════════════════════════════════════════════════════════
const WATCHDOG_INTERVAL_MS   = 60 * 1000;
const WATCHDOG_FIRST_DELAY_MS = 90 * 1000;   // deja terminar initEmqxResources
const WATCHDOG_DEBOUNCE      = 2;            // lecturas malas consecutivas
const WATCHDOG_THROTTLE_MS   = 5 * 60 * 1000;

const watchdogBadReads = new Map();   // description -> consecutive bad reads
const watchdogLastFix  = new Map();   // description -> ts del último intento
const watchdogDelivery = new Map();   // description -> { success, failed, badTicks }

// Sensor de entrega real (DEC-REF-103, drill #77): el status del recurso tiene
// TRES estados observados en 4.2.3 — is_alive=false (muerto), [] (recién
// creado, sano) y null (no inicializado al boot de EMQX: entrega ROTA con
// status vacío — el drill stop-node+restart-emqx lo midió: success 0 /
// failed 417+ con status null). El status solo no alcanza: la señal honesta
// son las métricas de las acciones de las reglas atadas al recurso. Roto =
// failed crece y success no crece entre ticks (con tráfico constante del
// saver, success crece siempre en estado sano).
async function deliveryStats(resourceId) {
  const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/";
  const res = await axios.get(url, auth);
  if (res.status !== 200 || !Array.isArray(res.data.data)) return null;
  let success = 0, failed = 0, bound = 0;
  for (const rule of res.data.data) {
    for (const a of rule.actions || []) {
      if (!a.params || a.params.$resource !== resourceId) continue;
      bound++;
      for (const m of a.metrics || []) {
        success += m.success || 0;
        failed  += m.failed  || 0;
      }
    }
  }
  return { success, failed, bound };
}

// Borra las reglas EMQX que referencian el recurso (libera dependency_exists)
// y devuelve cuántas borró. reconcileRules() las recrea después con el nuevo
// resource id y los estados enabled de Mongo.
async function deleteRulesBoundTo(resourceId) {
  const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules/";
  const res = await axios.get(url, auth);
  if (res.status !== 200 || !res.data.data) return 0;
  let deleted = 0;
  for (const rule of res.data.data) {
    const bound = (rule.actions || []).some(a =>
      a.params && a.params.$resource === resourceId);
    if (!bound) continue;
    await axios.delete(url + rule.id, auth);
    deleted++;
  }
  return deleted;
}

// Semántica de status en EMQX 4.2.3 (medida en #77): un recurso recién creado
// puede reportar `status: []` (vacío = aún no evaluado) por ~1 min. VACÍO NO
// ES MUERTO — tratarlo como tal hizo que la primera versión del watchdog
// remedieara en loop recursos sanos. Solo se remedia el estado explícito:
// status poblado y ningún nodo vivo.
function isExplicitlyDead(resource) {
  const st = resource.status || [];
  return st.length > 0 && !st.some(s => s.is_alive);
}

// Refresca los globals saverResource/alarmResource/ruleResource desde la API.
// Obligatorio tras recrear un recurso: reconcileSaverRules ata las reglas a
// global.saverResource.id — con el id VIEJO (borrado) la creación falla con
// "13 err" (medido en el drill #77).
async function refreshResourceGlobals() {
  const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/resources/";
  const res = await axios.get(url, auth);
  if (res.status !== 200 || !Array.isArray(res.data.data)) return;
  for (const r of res.data.data) {
    if (r.description === "saver-webhook") global.saverResource = r;
    if (r.description === "alarm-webhook") global.alarmResource = r;
    if (r.description === "rule-webhook")  global.ruleResource  = r;
  }
}

async function remediateDeadResource(resource) {
  const name = resource.description;
  const lastFix = watchdogLastFix.get(name) || 0;
  if (Date.now() - lastFix < WATCHDOG_THROTTLE_MS) return;
  watchdogLastFix.set(name, Date.now());

  console.log((`[EMQX-WATCHDOG] Remediando '${name}' (${resource.id}) — is_alive=false sostenido`).yellow);
  try {
    const deletedRules = await deleteRulesBoundTo(resource.id);
    console.log(`[EMQX-WATCHDOG] '${name}': ${deletedRules} regla(s) desatadas`);
    await axios.delete(
      "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/resources/" + resource.id, auth);

    const key = name === "saver-webhook" ? "saver"
              : name === "alarm-webhook" ? "alarm" : "rule";
    await createMissingResources([key]);

    // reconcile SIEMPRE: las reglas desatadas hay que recrearlas contra el
    // recurso nuevo aunque el status tarde en poblarse (gatearlo al alive
    // dejaba las reglas borradas — bug medido en la primera versión).
    await new Promise(r => setTimeout(r, 5000));
    await refreshResourceGlobals();
    await reconcileRules();
    console.log((`[EMQX-WATCHDOG] '${name}' recreado + reglas reconciliadas — el próximo tick juzga el resultado`).green);
  } catch (err) {
    console.error(`[EMQX-WATCHDOG] remediación de '${name}' falló: ${err.message}`);
  }
}

async function watchdogTick() {
  try {
    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/resources/";
    const res = await axios.get(url, auth);
    if (res.status !== 200 || !Array.isArray(res.data.data)) return;

    const expected = ["saver-webhook", "alarm-webhook", "rule-webhook"];
    const present = [];
    for (const r of res.data.data) {
      if (!expected.includes(r.description)) continue;
      present.push(r.description);
      if (isExplicitlyDead(r)) {
        const bad = (watchdogBadReads.get(r.description) || 0) + 1;
        watchdogBadReads.set(r.description, bad);
        console.log(`[EMQX-WATCHDOG] '${r.description}' no vivo (lectura ${bad}/${WATCHDOG_DEBOUNCE})`);
        if (bad >= WATCHDOG_DEBOUNCE) {
          watchdogBadReads.delete(r.description);
          await remediateDeadResource(r);
          continue;
        }
      } else {
        watchdogBadReads.delete(r.description);
      }

      // Sensor de entrega (complementa al status — ver deliveryStats).
      const stats = await deliveryStats(r.id);
      if (stats && stats.bound > 0) {
        const prev = watchdogDelivery.get(r.description);
        watchdogDelivery.set(r.description, stats);
        if (prev) {
          const failedDelta  = stats.failed  - prev.failed;
          const successDelta = stats.success - prev.success;
          if (successDelta > 0) {
            stats.badTicks = 0;
          } else if (failedDelta > 0 && successDelta === 0) {
            stats.badTicks = (prev.badTicks || 0) + 1;
            console.log(`[EMQX-WATCHDOG] '${r.description}' entregas fallando sin éxitos (Δfailed=${failedDelta}, tick ${stats.badTicks}/${WATCHDOG_DEBOUNCE})`);
            if (stats.badTicks >= WATCHDOG_DEBOUNCE) {
              watchdogDelivery.delete(r.description);
              await remediateDeadResource(r);
            }
          }
        }
      }
    }

    const missing = expected.filter(d => !present.includes(d));
    if (missing.length > 0) {
      console.log((`[EMQX-WATCHDOG] Creando recursos faltantes: ${missing.join(", ")}`).yellow);
      await createMissingResources(missing.map(d =>
        d === "saver-webhook" ? "saver" : d === "alarm-webhook" ? "alarm" : "rule"));
      await refreshResourceGlobals();
      await reconcileRules();
    }
  } catch (err) {
    // EMQX caído o red rota: se loguea y se reintenta en el próximo tick.
    console.log(`[EMQX-WATCHDOG] tick error: ${err.message}`);
  }
}

setTimeout(() => {
  watchdogTick();
  setInterval(watchdogTick, WATCHDOG_INTERVAL_MS);
  console.log(("[EMQX-WATCHDOG] activo — poll cada " + (WATCHDOG_INTERVAL_MS / 1000) + " s (BACKLOG-OPS-1)").cyan);
}, WATCHDOG_FIRST_DELAY_MS);

module.exports = router;
