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
  constructor({ dId, role, siteCode, mqttUsername, mqttPassword, userId, variables, sharedState }) {
    this._dId = dId;
    this._role = role;
    this._siteCode = siteCode;
    this._username = mqttUsername;
    this._password = mqttPassword; // MQTT credential — NUNCA logueado
    this._userId = userId;
    this._variables = variables;
    this._sharedState = sharedState || {};
    this._state = this._initialState(role);
    this._client = null;
    this._timers = [];
    this._connected = false;
  }

  _initialState(role) {
    switch (role) {
      case 'SEC':     return engine.initialSecState();
      case 'ATS':     return engine.initialAtsState();
      case 'CUMMINS': return engine.initialCumminsState();
      default:        return engine.initialGenState();  // GEN y legacy
    }
  }

  get tag() {
    return `[${this._siteCode}/${this._role}]`;
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

      this._client.once('connect', () => {
        clearTimeout(timeout);
        this._connected = true;
        console.log(`${this.tag} connected dId=${this._dId}`);

        // DEFENSA EN PROFUNDIDAD: control channel solo si SIMULATOR_MODE=true
        if (SIMULATOR_MODE) {
          const ctrlTopic = `simulator/${this._dId}/control`;
          this._client.subscribe(ctrlTopic, { qos: 1 }, err => {
            if (err) console.error(`${this.tag} control subscribe error: ${err.message}`);
            else     console.log(`${this.tag} control topic active: ${ctrlTopic}`);
          });
        }
        resolve();
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
    console.log(`${this.tag} ${this._variables.length} variables publishing @ individual freqs`);
  }

  _tick(varName) {
    if (!this._connected) return;
    if (this._state[varName] === undefined) return;
    // Evolucionar el valor (booleanos no cambian, floats hacen drift)
    this._state[varName] = engine.evolve(varName, this._state[varName], this._state, this._sharedState);
    if (varName === 'gen_status') this._syncSharedState();
    this._publish(varName);
  }

  _syncSharedState() {
    this._sharedState.gen_running = this._state.gen_status === 'RUNNING';
  }

  _publish(varName) {
    if (!this._connected) return;
    const value = this._state[varName];
    // Defensa: nunca publicar undefined o null
    if (value === undefined || value === null) {
      console.warn(`${this.tag} skipping publish of ${varName}: invalid value`);
      return;
    }
    const topic = `${this._userId}/${this._dId}/${varName}/sdata`;
    const payload = JSON.stringify({ value, save: 1 });
    this._client.publish(topic, payload, { qos: 0 });
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
      // Permanente: setea el valor hasta nuevo comando
      this._set(sensor, Number(value));
    } else if (command === 'scenario') {
      // Ejecuta un escenario pre-grabado (cmd.value es el nombre)
      this._runScenario(value);
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
  }

  _runScenario(name) {
    const scenario = engine.SCENARIOS[name];
    if (!scenario) {
      console.warn(`${this.tag} unknown scenario: ${name}`);
      return;
    }

    // Validar que TODAS las variables del scenario existen en el device
    const allVars = new Set();
    for (const step of scenario.steps) {
      for (const v of Object.keys(step.set)) allVars.add(v);
    }
    const missing = [...allVars].filter(v => this._state[v] === undefined);
    if (missing.length > 0) {
      console.warn(`${this.tag} scenario "${name}" aborted — variables not in device: ${missing.join(', ')}`);
      return;
    }

    // Cancelar timers activos (escenario previo o trigger pendiente)
    this._cancelActiveTimers();

    const flags = [];
    if (scenario.noCleanup) flags.push('noCleanup');
    if (scenario.isMaintenanceEvent) flags.push('MAINTENANCE');
    const flagsStr = flags.length ? ` [${flags.join(', ')}]` : '';

    console.log(`${this.tag} running scenario "${name}" (${scenario.steps.length} steps, ${scenario.duration_ms}ms)${flagsStr}`);

    // Programar cada step
    for (const step of scenario.steps) {
      const t = setTimeout(() => {
        for (const [varName, val] of Object.entries(step.set)) {
          this._set(varName, val);
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
        console.log(`${this.tag} scenario "${name}" complete — state restored`);
        this.startPublishing();
      }, scenario.duration_ms);
      this._timers.push(cleanup);
    } else {
      const endLog = setTimeout(() => {
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
