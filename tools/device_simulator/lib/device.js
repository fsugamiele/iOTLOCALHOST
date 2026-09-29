'use strict';

const mqtt = require('mqtt');
const engine = require('./sensor-engine.js');

const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883', 10);
const SIMULATOR_MODE = process.env.SIMULATOR_MODE === 'true';
const CONNECT_TIMEOUT_MS = 10000;

// SimulatedDevice: encapsula UN device físico simulado.
// Tiene su propio mqtt.Client, su mapa de estado de sensores, sus timers de
// publicación periódica, y (si SIMULATOR_MODE=true) su suscripción al control topic.
//
// Defensa en profundidad: la suscripción al control topic SOLO se activa con
// SIMULATOR_MODE=true. Sin ese flag, el simulador es un publicador pasivo
// que NO acepta comandos externos. Esto previene que código del simulador
// llegado por error a producción pueda ser controlado remotamente.
class SimulatedDevice {
  /**
   * @param {Object}   opts
   * @param {string}   opts.dId            8-char device id (de devices_state.json)
   * @param {string}   opts.role           'SEC' | 'GEN' | 'ATS' | 'CUMMINS'
   * @param {string}   opts.siteCode       siteCode al que pertenece (CR00015, etc.)
   * @param {string}   opts.mqttUsername   credencial MQTT (de getDeviceCredentials)
   * @param {string}   opts.mqttPassword   credencial MQTT plain (NUNCA loguear)
   * @param {string}   opts.userId         extraído del topic prefix
   * @param {Array}    opts.variables      [{variable, variableSendFreq, ...}] del template
   * @param {Object}   opts.sharedState    estado compartido del site (default: {})
   */
  constructor({ dId, role, siteCode, mqttUsername, mqttPassword, userId, variables, sharedState, heartbeatSec }) {
    this._dId = dId;
    this._role = role;
    this._siteCode = siteCode;
    this._username = mqttUsername;
    this._password = mqttPassword; // MQTT credential — NUNCA logueado
    this._userId = userId;
    // DEC-REF-115 (#85) — autonomy_hours deja de publicarla el equipo: la
    // calcula la PLATAFORMA (edge-engine/autonomy.js) desde fuel_level +
    // parámetros de la ficha/override. Si el sim la publicara también,
    // dos fuentes escribirían la misma variable con valores distintos
    // (flip-flop). El sim modela el caso real: la controladora NO la da.
    // Filtra variables sin nombre (widgets de sitio como siteMap/cascada que no
    // tienen `variable` → antes generaban "skipping publish of undefined" en loop).
    this._variables = variables.filter(v => v.variable && v.variable !== 'autonomy_hours');
    this._sharedState = sharedState || {};
    this._state = this._initialState(role);
    this._client = null;
    this._timers = [];
    this._connected = false;
    // P2 (#79) — report-by-exception. deadband por variable (numéricas);
    // _lastPublished guarda el último valor EFECTIVAMENTE publicado.
    this._deadbandByVar = new Map();
    for (const v of variables) {
      const db = Number(v.deadband);
      if (Number.isFinite(db) && db > 0) this._deadbandByVar.set(v.variable, db);
    }
    this._lastPublished = new Map();
    // Latido: aunque nada supere el umbral, publicar TODO cada heartbeatSec
    // (default 300). Es la señal de vida contra la que el panel calcula online.
    this._heartbeatSec = Number(heartbeatSec) > 0 ? Number(heartbeatSec) : 300;
  }

  _initialState(role) {
    // Prefix match para roles con suffix numérico (ELTEK-01, ELTEK-02, ...).
    // El role viene del key de devices_state.json → puede ser 'ELTEK-01', no 'ELTEK'.
    // Verificación de prefix cubre ambos casos: rol exacto o rol-N.
    if (role === 'SEC')                    return engine.initialSecState();
    if (role === 'ATS')                    return engine.initialAtsState();
    // DEC-REF-79 (vi) — siteCode habilita overrides con evidencia de campo
    // (ej. run_hours=2969.1 del Cummins de CR00061, relevamiento #15).
    if (role === 'CUMMINS')                return engine.initialCumminsState(this._siteCode);
    if (role === 'ELTEK' || role.startsWith('ELTEK-')) return engine.initialEltekState();  // SF-6 · DEC-REF-65.c
    if (role === 'LITIO')                  return engine.initialLitioState();  // Ola B — batería litio
    if (role === 'AA')                     return engine.initialAaState();     // Ola B — aire acondicionado
    return engine.initialGenState();  // GEN y legacy
  }

  get tag() {
    return `[${this._siteCode}/${this._role}]`;
  }

  // Accessors públicos para orquestación externa (scheduler en run.js).
  get role()     { return this._role; }
  get siteCode() { return this._siteCode; }

  // Fachada pública para disparar un escenario. Usado por el scheduler de
  // weekly_exercise en run.js. Reusa el pipeline de _runScenario (cancela
  // timers activos, ejecuta steps, cleanup automático o preservado según
  // noCleanup del scenario).
  runScenario(name) {
    this._runScenario(name);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => { if (!this._connected) reject(new Error(`${this.tag} MQTT connect timeout`)); },
        CONNECT_TIMEOUT_MS
      );

      this._client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
        clientId: `sim_${this._dId}_${Math.random().toString(16).slice(2, 6)}`,
        username: this._username,
        password: this._password, // NUNCA logueado, queda solo en memoria interna del cliente mqtt
        clean: true,
        reconnectPeriod: 5000,
        keepalive: 60,
      });

      // `on` y no `once` (deuda #74): mqtt.js re-emite 'connect' en CADA
      // reconexión al broker. Con `once`, tras un restart de emqx el cliente
      // reconectaba pero _connected quedaba false para siempre → _tick()
      // early-return eterno: proceso vivo, cero publicaciones. Así moría el
      // sim en silencio (medido 2026-09-19: 12 h sin datos con proceso "vivo").
      this._client.on('connect', () => {
        clearTimeout(timeout);
        const isReconnect = this._connected;
        this._connected = true;
        console.log(isReconnect
          ? `${this.tag} reconnected — publishing resumes`
          : `${this.tag} connected dId=${this._dId}`);

        // DEFENSA EN PROFUNDIDAD: control channel solo si SIMULATOR_MODE=true.
        // mqtt.js resuscribe solo tras reconexión (resubscribe default true),
        // pero suscribir de nuevo es idempotente — cubre clean=true edge cases.
        if (SIMULATOR_MODE) {
          const ctrlTopic = `simulator/${this._dId}/control`;
          this._client.subscribe(ctrlTopic, { qos: 1 }, err => {
            if (err) console.error(`${this.tag} control subscribe error: ${err.message}`);
            else if (!isReconnect) console.log(`${this.tag} control topic active: ${ctrlTopic}`);
          });
        }
        resolve(); // idempotente: resolves posteriores son no-op
      });

      this._client.on('message', (topic, msg) => {
        if (!SIMULATOR_MODE) return;
        if (topic !== `simulator/${this._dId}/control`) return;
        try {
          this.applyCommand(JSON.parse(msg.toString()));
        } catch (e) {
          console.warn(`${this.tag} non-JSON on control channel, ignored: ${e.message}`);
        }
      });

      this._client.on('error', e => {
        console.error(`${this.tag} MQTT error: ${e.message}`);
      });
      this._client.on('reconnect', () => console.log(`${this.tag} reconnecting...`));
      this._client.on('offline', () => { this._connected = false; });
    });
  }

  startPublishing() {
    for (const v of this._variables) {
      const varName = v.variable;
      const freqMs = (Number(v.variableSendFreq) || 30) * 1000;

      // Stagger 0-2s solo: queremos que TODOS los devices estén visibles en el
      // dashboard dentro de los primeros ~2s de bootstrap, no después de su
      // primer ciclo de publicación.
      const jitter = Math.floor(Math.random() * 2000);

      const startTimer = setTimeout(() => {
        this._tick(varName);
        const intervalTimer = setInterval(() => this._tick(varName), freqMs);
        this._timers.push(intervalTimer);
      }, jitter);

      this._timers.push(startTimer);
    }

    // P2 (#79) — latido: republica TODAS las variables cada heartbeatSec,
    // aunque ninguna haya superado su umbral. Es la señal de vida del device.
    const hb = setInterval(() => {
      if (!this._connected) return;
      for (const v of this._variables) this._publish(v.variable, { force: true });
    }, this._heartbeatSec * 1000);
    this._timers.push(hb);

    console.log(`${this.tag} ${this._variables.length} variables @ cambio(umbral) + latido ${this._heartbeatSec}s`);
  }

  // P2 (#79) — decisión de publicación (report-by-exception):
  //   · nunca publicó            → publica (primer valor visible de inmediato)
  //   · numérica con deadband>0  → publica si |nuevo - último| >= deadband
  //   · resto (bool/string/0)    → publica ante cualquier cambio de valor
  _shouldPublish(varName) {
    const value = this._state[varName];
    const last = this._lastPublished.get(varName);
    if (last === undefined) return true;
    const db = this._deadbandByVar.get(varName);
    if (db !== undefined && typeof value === 'number' && typeof last === 'number') {
      return Math.abs(value - last) >= db;
    }
    return value !== last;
  }

  _tick(varName) {
    if (!this._connected) return;
    this._syncGenTransition();
    if (this._state[varName] === undefined) return;
    // Evolucionar el valor (booleanos no cambian, floats hacen drift)
    this._state[varName] = engine.evolve(varName, this._state[varName], this._state, this._sharedState);
    if (varName === 'gen_status') this._syncSharedState();
    if (this._shouldPublish(varName)) this._publish(varName);
  }

  // DEC-REF-104 D-4 (#78) — transición de marcha ACOPLADA. Física real: la
  // presión de aceite la genera el cigüeñal girando — sube CON el arranque y
  // cae CON la parada. Sin este acople, los timers independientes por variable
  // dejaban una ventana de ~65 s con rpm>300 y oil_pressure=0 (medido
  // 23:32:39→23:33:43) que cruzaba el graceSec=60 de las reglas A0/A1 y
  // disparaba una CRÍTICA falsa en cada arranque del grupo. Con el acople la
  // condición `rpm>300 AND oil<2` jamás se cumple en una transición sana;
  // graceSec queda como segunda red, no como parche del sim.
  _syncGenTransition() {
    if (this._state.rpm === undefined || this._state.oil_pressure === undefined) return;
    const running = !!this._sharedState.gen_running;
    if (this._lastGenRunning === undefined) { this._lastGenRunning = running; return; }
    if (running === this._lastGenRunning) return;
    this._lastGenRunning = running;
    if (running) {
      this._set('rpm', 1500);
      this._set('oil_pressure', 40);
    } else {
      this._set('rpm', 0);
      this._set('oil_pressure', 0);
    }
  }

  _syncSharedState() {
    this._sharedState.gen_running = this._state.gen_status === 'RUNNING';
  }

  _publish(varName, { force = false } = {}) {
    if (!this._connected) return;
    const value = this._state[varName];
    // Defensa: nunca publicar undefined.
    // null se permite EXPLÍCITAMENTE para variables que matchean /setpoint/i —
    // modela pérdida del setpoint del driver Modbus (DEC-REF-66.d + EDGE-2);
    // edge asigna siteState=null y typeC entra en fallback/no-ref/escalada.
    if (value === undefined) {
      console.warn(`${this.tag} skipping publish of ${varName}: undefined value`);
      return;
    }
    if (value === null && !/setpoint/i.test(varName)) {
      console.warn(`${this.tag} skipping publish of ${varName}: null value (only allowed for setpoint_* vars)`);
      return;
    }
    const topic = `${this._userId}/${this._dId}/${varName}/sdata`;
    const payload = JSON.stringify({ value, save: 1 });
    this._client.publish(topic, payload, { qos: 0 });
    this._lastPublished.set(varName, value);
  }

  applyCommand(cmd) {
    const { command, sensor, duration_ms = 5000 } = cmd;

    // Normalizar value a número: API/Vue puede mandar boolean nativo,
    // pero el protocolo MQTT siempre usa 0|1 para booleanos.
    const value = cmd.value === undefined
      ? undefined
      : typeof cmd.value === 'boolean'
        ? (cmd.value ? 1 : 0)
        : cmd.value; // strings (ej. nombre de escenario) y números pasan tal cual

    console.log(`${this.tag} CMD ${command} sensor=${sensor || '-'} value=${value !== undefined ? value : '-'}`);

    if (command === 'trigger') {
      // Pulso: setea el sensor y vuelve a 0 después de duration_ms
      const triggerValue = value !== undefined ? Number(value) : 1;
      this._set(sensor, triggerValue);
      const t = setTimeout(() => this._set(sensor, 0), duration_ms);
      this._timers.push(t);
    } else if (command === 'set_sensor') {
      // Permanente: setea el valor hasta nuevo comando.
      // DEC-REF-99 — si el estado actual del sensor es string (categorical,
      // ej. gen_status='RUNNING'), preservar el string; Number() lo haría NaN.
      const next = typeof this._state[sensor] === 'string' ? String(value) : Number(value);
      this._set(sensor, next);
    } else if (command === 'scenario') {
      // Ejecuta un escenario pre-grabado (cmd.value es el nombre)
      this._runScenario(value);
    } else if (command === 'snapshot') {
      // #79-d — republica el estado ACTUAL de todas las variables (como el
      // latido, bajo demanda) SIN tocar _state ni timers. Lo usa la UI del
      // simulador al abrir para pintar valores al instante; antes usaba
      // 'reset' y pisaba los valores cargados con los defaults.
      for (const v of this._variables) {
        this._publish(v.variable, { force: true });
      }
    } else if (command === 'reset') {
      // Restaura todos los sensores a initialState y reinicia publicación periódica.
      // _cancelActiveTimers() mata también los setInterval de startPublishing(),
      // por eso se llama startPublishing() al final para reanudarlos.
      this._cancelActiveTimers();
      this._state = this._initialState(this._role);
      for (const v of this._variables) {
        this._publish(v.variable);
      }
      this.startPublishing();
    } else if (command === 'stop_publishing') {
      // SF-6 · E2E frescura — apagar publicaciones de ESTE device sin
      // resetear estado ni desconectar del broker. Simula un device
      // "dead" para probar la ventana de frescura de la hoja sum.
      // Reactivar con `resume_publishing` o `reset`.
      this._cancelActiveTimers();
      console.log(`${this.tag} publishing STOPPED (frescura test)`);
    } else if (command === 'resume_publishing') {
      this._cancelActiveTimers();
      this.startPublishing();
      console.log(`${this.tag} publishing RESUMED`);
    } else {
      console.warn(`${this.tag} unknown command: ${command}`);
    }
  }

  _set(varName, value) {
    if (this._state[varName] === undefined) {
      console.warn(`${this.tag} unknown sensor: ${varName}`);
      return;
    }
    this._state[varName] = value;
    if (varName === 'gen_status') this._syncSharedState();
    this._publish(varName);
  }

  _cancelActiveTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    this._holdVars = null;   // M4 — corta un hold (sensor_muerto) en curso
  }

  _runScenario(name) {
    const scenario = engine.SCENARIOS[name];
    if (!scenario) {
      console.warn(`${this.tag} unknown scenario: ${name}`);
      return;
    }

    // Validar que TODAS las variables del scenario existen en el device.
    // SF-6 · DEC-REF-65.c — `step.sharedSet` (opcional) toca sharedState del
    // site en lugar de _state del device; no requiere que las claves estén
    // en el device (por diseño: el sharedState existe justamente para
    // coordinar múltiples devices del site — mains_failure, eltek_load_high,
    // etc.).
    const allVars = new Set();
    for (const step of scenario.steps) {
      if (step.set) for (const v of Object.keys(step.set)) allVars.add(v);
    }
    const missing = [...allVars].filter(v => this._state[v] === undefined);
    if (missing.length > 0) {
      console.warn(`${this.tag} scenario "${name}" aborted — variables not in device: ${missing.join(', ')}`);
      return;
    }
    // M4 sensor_muerto — validar las variables a congelar (holdVars).
    if (Array.isArray(scenario.holdVars)) {
      const missingHold = scenario.holdVars.filter(v => this._state[v] === undefined);
      if (missingHold.length > 0) {
        console.warn(`${this.tag} scenario "${name}" aborted — holdVars not in device: ${missingHold.join(', ')}`);
        return;
      }
    }

    // Cancelar timers activos (escenario previo o trigger pendiente)
    this._cancelActiveTimers();

    // M4 sensor_muerto — hold: las variables quedan CONGELADAS (el step las fija y
    // nada las evoluciona, porque _cancelActiveTimers apagó los _tick) y un interval
    // propio las re-publica IDÉNTICAS durante el escenario. Genera la serie plana
    // (rango≈0) que flatline detecta pese al report-by-exception. Activar DESPUÉS de
    // _cancelActiveTimers (que limpia _holdVars).
    this._holdVars = (Array.isArray(scenario.holdVars) && scenario.holdVars.length)
      ? new Set(scenario.holdVars) : null;
    if (this._holdVars) {
      const holdTimer = setInterval(() => {
        if (!this._connected || !this._holdVars) return;   // no-op tras el fin del escenario
        for (const v of this._holdVars) {
          if (this._state[v] !== undefined) this._publish(v);
        }
      }, 3000);
      this._timers.push(holdTimer);
    }

    const flags = [];
    if (scenario.noCleanup) flags.push('noCleanup');
    if (scenario.isMaintenanceEvent) flags.push('MAINTENANCE');
    if (this._holdVars) flags.push('HOLD:' + scenario.holdVars.join(','));
    const flagsStr = flags.length ? ` [${flags.join(', ')}]` : '';

    console.log(`${this.tag} running scenario "${name}" (${scenario.steps.length} steps, ${scenario.duration_ms}ms)${flagsStr}`);

    // Programar cada step. SF-6 · DEC-REF-65.c — soporte para `step.sharedSet`
    // (aditivo): setea claves en sharedState del site (todos los devices del
    // site las verán en su próximo evolve()). Coherente con el patrón de
    // `sharedState.gen_running` que device.js:140 ya mantiene.
    for (const step of scenario.steps) {
      const t = setTimeout(() => {
        if (step.set) {
          for (const [varName, val] of Object.entries(step.set)) {
            this._set(varName, val);
          }
        }
        if (step.sharedSet) {
          for (const [k, v] of Object.entries(step.sharedSet)) {
            this._sharedState[k] = v;
          }
          console.log(`${this.tag} sharedSet: ${JSON.stringify(step.sharedSet)}`);
        }
      }, step.at);
      this._timers.push(t);
    }

    // Cleanup automático al final, salvo flag noCleanup
    if (!scenario.noCleanup) {
      const cleanup = setTimeout(() => {
        const initial = this._initialState(this._role);
        for (const v of this._variables) {
          const varName = v.variable;
          if (this._state[varName] !== initial[varName]) {
            this._set(varName, initial[varName]);
          }
        }
        this._holdVars = null;   // M4 — fin del hold (sensor_muerto)
        console.log(`${this.tag} scenario "${name}" complete — state restored`);
        this.startPublishing();
      }, scenario.duration_ms);
      this._timers.push(cleanup);
    } else {
      const endLog = setTimeout(() => {
        this._holdVars = null;   // M4 — fin del hold (sensor_muerto)
        console.log(`${this.tag} scenario "${name}" complete — state preserved (noCleanup)`);
        this.startPublishing();
      }, scenario.duration_ms);
      this._timers.push(endLog);
    }
  }

  // Snapshot para que el panel Vue (Sim-3) pueda leer el estado actual
  getState() {
    return { ...this._state };
  }

  disconnect() {
    return new Promise(resolve => {
      this._timers.forEach(t => clearTimeout(t));
      this._timers = [];
      if (this._client && this._connected) {
        this._client.end(false, {}, resolve);
      } else {
        resolve();
      }
    });
  }
}

module.exports = { SimulatedDevice };
