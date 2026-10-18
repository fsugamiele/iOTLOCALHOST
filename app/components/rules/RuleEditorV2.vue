<template>
  <!-- spec_editor_reglas_v2 — editor de reglas v2 (mockup aprobado por Franco 2026-10-18).
       Una pantalla, cuatro pasos, tarjetas de condición con su gráfico, "La regla dice",
       prueba con las últimas 24 h (motor real, QA /simulate) y, al guardar, el panel "Ahora". -->
  <div class="rv2">
    <div class="rv2-head">
      <div>
        <div class="rv2-crumb">Reglas › {{ packKind }}</div>
        <div class="rv2-title">{{ view === 'guardada' ? (model.nombre || 'Regla') + ' · guardada' : (model.nombre || (rule ? 'Editar regla' : 'Nueva regla')) }}</div>
      </div>
      <div class="rv2-actions">
        <template v-if="view === 'editar'">
          <button type="button" class="rv2-btn sec" @click="$emit('cancel')">Cancelar</button>
          <button type="button" class="rv2-btn pri" :disabled="!canSave || saving" @click="save">{{ saving ? 'Guardando…' : 'Guardar regla' }}</button>
        </template>
        <template v-else>
          <button type="button" class="rv2-btn sec" @click="view = 'editar'">Editar</button>
          <button type="button" class="rv2-btn sec" @click="$emit('cancel')">Cerrar</button>
        </template>
      </div>
    </div>

    <div class="rv2-body">
      <!-- ═════════ EDITOR ═════════ -->
      <section v-if="view === 'editar'" class="rv2-main" aria-label="Pasos de la regla">
        <div class="rv2-card">
          <div class="rv2-step"><div class="rv2-num">1</div><div class="rv2-sbody">
            <div class="rv2-st">¿Qué vas a vigilar?</div>
            <p class="rv2-sh">Ponele un nombre que diga el problema, y elegí si querés una alarma por cada {{ packKindLower }} o una sola para el sitio.</p>
            <div class="rv2-grid2">
              <div class="rv2-fld"><label class="rv2-lab" for="rv2-nom">Nombre de la regla</label><input id="rv2-nom" v-model="model.nombre" class="rv2-in" placeholder="Ej.: Batería en riesgo con red caída"></div>
              <div class="rv2-fld"><span class="rv2-lab">Una alarma por</span>
                <div class="rv2-seg" role="group" aria-label="Alcance">
                  <button type="button" :class="{ on: model.alcance === 'equipo' }" @click="setAlcance('equipo')">cada {{ packKindLower }}</button>
                  <button type="button" :class="{ on: model.alcance === 'sitio' }" @click="setAlcance('sitio')">todo el sitio</button>
                </div>
              </div>
            </div>
          </div></div>
        </div>

        <div class="rv2-card">
          <div class="rv2-step"><div class="rv2-num">2</div><div class="rv2-sbody">
            <div class="rv2-st">¿Cuándo tiene que avisar?</div>
            <p class="rv2-sh">Agregá una o más condiciones. Cada una mira una medición de uno o más equipos.</p>
            <div v-if="model.conds.length > 1" class="rv2-union">
              <span>Avisar cuando se cumplan</span>
              <div class="rv2-seg" role="group" aria-label="Unión">
                <button type="button" :class="{ on: model.union === 'todas' }" @click="model.union = 'todas'">todas</button>
                <button type="button" :class="{ on: model.union === 'alguna' }" @click="model.union = 'alguna'">alguna</button>
              </div>
              <span>estas condiciones:</span>
            </div>

            <article v-for="(c, i) in model.conds" :key="c.uid" class="rv2-cond" :aria-label="'Condición ' + (i + 1)">
              <div class="rv2-condh">
                <b>Condición {{ i + 1 }}</b>
                <button v-if="model.conds.length > 1" type="button" class="rv2-btn sec sm" @click="model.conds.splice(i, 1)">Quitar</button>
              </div>

              <div class="rv2-fld">
                <span class="rv2-lab">Equipos</span>
                <div class="rv2-chips">
                  <span v-for="e in c.equipos" :key="e" class="rv2-chip">{{ equipoNombre(e) }}<button type="button" class="rv2-x" :aria-label="'Quitar ' + equipoNombre(e)" @click="quitarEquipo(c, e)">×</button></span>
                  <select class="rv2-in rv2-add" value="" aria-label="Agregar equipo" @change="agregarEquipo(c, $event)">
                    <option value="">+ Agregar equipo…</option>
                    <template v-for="g in opcionesEquipo(c)">
                      <template v-if="!g.label"><option v-for="o in g.opts" :key="o.v" :value="o.v" :disabled="o.dis">{{ o.t }}</option></template>
                      <optgroup v-else :key="'g-' + g.label" :label="g.label">
                        <option v-for="o in g.opts" :key="o.v" :value="o.v" :disabled="o.dis">{{ o.t }}</option>
                      </optgroup>
                    </template>
                  </select>
                </div>
                <span v-if="avisoSitio(c)" class="rv2-warn">{{ avisoSitio(c) }}</span>
                <div v-if="variosEquipos(c)" class="rv2-union sm">
                  <span class="rv2-hint">Con varios equipos:</span>
                  <div class="rv2-seg" role="group" aria-label="Varios equipos">
                    <button type="button" :class="{ on: c.modo === 'uno' }" @click="c.modo = 'uno'">basta con uno</button>
                    <button type="button" :class="{ on: c.modo === 'todos' }" @click="c.modo = 'todos'">tienen que ser todos</button>
                  </div>
                </div>
              </div>

              <div class="rv2-grid2">
                <div class="rv2-fld"><span class="rv2-lab">Medición</span>
                  <select v-model="c.variable" class="rv2-in">
                    <option value="" disabled>Elegí la medición</option>
                    <option v-for="v in variablesDe(c.deviceType)" :key="v.name" :value="v.name">{{ varEtiqueta(v) }}</option>
                  </select>
                </div>
                <div class="rv2-fld"><span class="rv2-lab">Qué mirar</span>
                  <select :value="c.medida" class="rv2-in" @change="setMedida(c, $event.target.value)">
                    <option v-for="m in medidasDe(c)" :key="m.v" :value="m.v">{{ m.t }}</option>
                  </select>
                </div>
              </div>

              <div class="rv2-row">
                <div class="rv2-fld w220"><span class="rv2-lab">Condición</span>
                  <select v-model="c.op" class="rv2-in"><option v-for="o in opsDe(c)" :key="o.v" :value="o.v">{{ o.t }}</option></select>
                </div>
                <div v-if="tipoVar(c) === 'bool' && c.medida === 'valor'" class="rv2-fld w140"><span class="rv2-lab">valor</span>
                  <select v-model="c.valor" class="rv2-in"><option value="1">sí</option><option value="0">no</option></select>
                </div>
                <div v-else-if="enumDe(c).length && c.medida === 'valor'" class="rv2-fld w220"><span class="rv2-lab">valor</span>
                  <select v-model="c.valor" class="rv2-in"><option v-for="e in enumDe(c)" :key="e.value" :value="e.value">{{ e.label }}</option></select>
                </div>
                <div v-else class="rv2-fld w150"><span class="rv2-lab">{{ c.medida === 'limite' ? 'respaldo si el equipo no informa' : (valorLab[c.medida] || unidadDe(c) || 'valor') }}</span>
                  <input v-model="c.valor" class="rv2-in" inputmode="decimal" :placeholder="valorAtado(c) ? valorAtado(c).corto : ''">
                </div>
                <div v-if="c.medida === 'limite'" class="rv2-fld w220"><span class="rv2-lab">límite que informa el equipo</span>
                  <select v-model="c.limiteVar" class="rv2-in"><option value="" disabled>Elegí</option><option v-for="v in variablesDe(c.deviceType)" :key="v.name" :value="v.name">{{ varEtiqueta(v) }}</option></select>
                </div>
                <div v-if="c.medida === 'proyeccion'" class="rv2-fld w150"><span class="rv2-lab">llega a {{ unidadDe(c) ? '(' + unidadDe(c) + ')' : '' }}</span><input v-model="c.objetivo" class="rv2-in" inputmode="decimal"></div>
                <div v-if="c.medida === 'relacion' || c.medida === 'diferencia'" class="rv2-fld w220"><span class="rv2-lab">comparada con</span>
                  <select v-model="c.otra" class="rv2-in"><option value="" disabled>Elegí</option><option v-for="v in variablesDe(c.deviceType).filter(x => x.name !== c.variable)" :key="v.name" :value="v.name">{{ varEtiqueta(v) }}</option></select>
                </div>
                <div v-if="conVentana.includes(c.medida)" class="rv2-fld w170"><span class="rv2-lab">mirando los últimos (min)</span><input v-model="c.ventana" class="rv2-in" inputmode="decimal"></div>
                <div v-if="c.medida === 'salto' || c.medida === 'anormal'" class="rv2-fld w170"><span class="rv2-lab">cuenta durante (s)</span><input v-model="c.cuenta" class="rv2-in" inputmode="numeric"></div>
              </div>

              <div class="rv2-frase">“{{ frase(c) }}”</div>
              <span v-if="valorAtado(c)" class="rv2-hint">{{ valorAtado(c).largo }}</span>
              <span v-if="problema(c)" class="rv2-err">{{ problema(c) }}</span>
              <span v-else-if="ayuda[c.medida]" class="rv2-hint">{{ ayuda[c.medida] }}</span>

              <figure class="rv2-fig">
                <div class="rv2-figh">
                  <figcaption class="rv2-lab">{{ chartTitle }}</figcaption>
                  <div class="rv2-figc">
                    <span class="rv2-pill" :class="grafico(i).cls"><span class="rv2-dot"></span>{{ grafico(i).leyenda }}</span>
                    <button type="button" class="rv2-btn sec sm" :aria-label="playing ? 'Pausar' : 'Reproducir'" @click="togglePlay">{{ playTxt }}</button>
                  </div>
                </div>
                <svg :viewBox="'0 0 ' + W + ' ' + H" width="100%" role="img" :aria-label="'Gráfico de ' + grafico(i).yl">
                  <path :d="grafico(i).sinDato" class="g-sin"></path>
                  <path :d="grafico(i).zona" class="g-zona"></path>
                  <line :x1="PL" :y1="H - PB" :x2="W - PR" :y2="H - PB" class="g-eje"></line>
                  <polyline :points="grafico(i).thr" class="g-thr"></polyline>
                  <text :x="W - PR" :y="grafico(i).thrY" dy="-5" text-anchor="end" class="g-thrt">{{ grafico(i).thrTxt }}</text>
                  <polyline :points="grafico(i).pts" class="g-serie"></polyline>
                  <line :x1="cx" y1="8" :x2="cx" :y2="H - PB" class="g-cursor"></line>
                  <text x="4" y="14" class="g-txt">{{ grafico(i).yl }}</text>
                  <text :x="PL" :y="H - 8" class="g-txt">{{ ejeX[0] }}</text>
                  <text :x="(PL + W - PR) / 2" :y="H - 8" text-anchor="middle" class="g-txt">{{ ejeX[1] }}</text>
                  <text :x="W - PR" :y="H - 8" text-anchor="end" class="g-txt">{{ ejeX[2] }}</text>
                </svg>
                <span class="rv2-hint">Zona roja: cuando se cumple · gris: sin dato · línea amarilla: el umbral.</span>
              </figure>
            </article>

            <button type="button" class="rv2-addc" :disabled="model.conds.length >= 8" @click="agregarCond">+ Agregar otra condición</button>
            <span class="rv2-hint" :class="{ 'rv2-err': excede }">{{ contador }}</span>

            <figure class="rv2-fig rv2-cycle">
              <div class="rv2-figh">
                <figcaption><b>Así se comportaría la regla completa</b> <span class="rv2-hint">· {{ fuenteTxt }}</span></figcaption>
                <div class="rv2-figc">
                  <select v-if="simInstances.length > 1" v-model.number="instIdx" class="rv2-in rv2-mini" aria-label="Equipo a mostrar">
                    <option v-for="(x, k) in simInstances" :key="x.key" :value="k">{{ x.deviceName }}</option>
                  </select>
                  <button type="button" class="rv2-btn pri sm" @click="togglePlay">{{ playTxt }}</button>
                  <button type="button" class="rv2-btn sec sm" @click="playFromStart">Desde el principio</button>
                </div>
              </div>
              <svg :viewBox="'0 0 ' + W + ' 78'" width="100%" role="img" aria-label="Etapas de la regla en el tiempo">
                <path v-for="b in ciclo.bandas" :key="b.e" :d="b.d" :class="'b-' + b.e"></path>
                <g v-for="(x, k) in ciclo.avisos" :key="'a' + k"><line :x1="x" y1="4" :x2="x" y2="52" class="m-aviso"></line><text :x="x" y="63" text-anchor="middle" class="m-aviso-t">avisa</text></g>
                <g v-for="(x, k) in ciclo.cierres" :key="'c' + k"><line :x1="x" y1="4" :x2="x" y2="52" class="m-cierre"></line><text :x="x" y="63" text-anchor="middle" class="m-cierre-t">se cierra</text></g>
                <line :x1="cx" y1="4" :x2="cx" y2="52" class="g-cursor"></line>
                <text :x="PL" y="75" class="g-txt">{{ ejeX[0] }}</text>
                <text :x="(PL + W - PR) / 2" y="75" text-anchor="middle" class="g-txt">{{ ejeX[1] }}</text>
                <text :x="W - PR" y="75" text-anchor="end" class="g-txt">{{ ejeX[2] }}</text>
              </svg>
              <div class="rv2-legend">
                <span><i class="b-E1"></i> Vigilando</span><span><i class="b-E2"></i> Observando (cuenta la espera)</span><span><i class="b-E3"></i> Alarma</span>
                <span><i class="b-E4"></i> Recuperándose (cuenta el cierre)</span><span><i class="b-E6"></i> Esperando confirmación</span><span><i class="b-E5"></i> Sin datos</span>
              </div>
              <p class="rv2-cycle-txt"><b>{{ ciclo.ahora }}</b> — {{ ciclo.resumen }}</p>
            </figure>
          </div></div>
        </div>

        <div class="rv2-card">
          <div class="rv2-step"><div class="rv2-num">3</div><div class="rv2-sbody">
            <div class="rv2-st">¿Cuánto esperar y cómo se cierra?</div>
            <p class="rv2-sh">La espera evita avisos por un pico de un instante. El cierre evita que la alarma se abra y cierre una y otra vez.</p>
            <div class="rv2-grid3">
              <div class="rv2-fld"><label class="rv2-lab" for="rv2-esp">Avisar si sigue así durante (s)</label><input id="rv2-esp" v-model="model.espera" class="rv2-in" inputmode="numeric"></div>
              <div class="rv2-fld"><label class="rv2-lab" for="rv2-cie">Cerrar si se normaliza durante (s)</label><input id="rv2-cie" v-model="model.cierre" class="rv2-in" inputmode="numeric"></div>
              <div class="rv2-fld"><span class="rv2-lab">Al normalizarse</span>
                <div class="rv2-seg" role="group" aria-label="Cierre">
                  <button type="button" :class="{ on: model.cierreModo === 'auto' }" @click="model.cierreModo = 'auto'">se cierra sola</button>
                  <button type="button" :class="{ on: model.cierreModo === 'manual' }" @click="model.cierreModo = 'manual'">espera confirmación</button>
                </div>
              </div>
            </div>
          </div></div>
        </div>

        <div class="rv2-card">
          <div class="rv2-step"><div class="rv2-num">4</div><div class="rv2-sbody">
            <div class="rv2-st">¿Qué tan grave es y qué hay que hacer?</div>
            <p class="rv2-sh">La recomendación es lo que lee el técnico de guardia cuando llega el aviso.</p>
            <div class="rv2-seg" role="group" aria-label="Gravedad">
              <button type="button" :class="{ on: model.gravedad === 'info' }" @click="model.gravedad = 'info'">Informativa</button>
              <button type="button" :class="{ on: model.gravedad === 'warning' }" @click="model.gravedad = 'warning'">Advertencia</button>
              <button type="button" :class="{ on: model.gravedad === 'critical', crit: model.gravedad === 'critical' }" @click="model.gravedad = 'critical'">Crítica</button>
            </div>
            <div class="rv2-fld" style="margin-top: 14px;"><label class="rv2-lab" for="rv2-rec">Qué tiene que hacer el operador</label>
              <textarea id="rv2-rec" v-model="model.reco" class="rv2-in" rows="3" placeholder="Ej.: Despachar técnico con grupo portátil y verificar el arranque del grupo"></textarea>
            </div>
          </div></div>
        </div>
      </section>

      <!-- ═════════ GUARDADA: AHORA ═════════ -->
      <section v-else class="rv2-main" aria-label="Estado de la regla">
        <div class="rv2-card">
          <div class="rv2-condh"><span class="rv2-st">Ahora</span><span class="rv2-hint">se actualiza solo · {{ nowAge }}</span></div>
          <p v-if="!ahora.length" class="rv2-hint">Todavía no hay datos de esta regla.</p>
          <div v-for="eq in ahora" :key="eq.key" class="rv2-cond">
            <div class="rv2-condh"><b>{{ eq.nombre }}</b><span class="rv2-pill" :class="eq.cls"><span class="rv2-dot"></span>{{ eq.etapa }}</span></div>
            <span class="rv2-hint">{{ eq.porque }}</span>
            <div v-for="(x, k) in eq.conds" :key="k" class="rv2-nowc"><span class="rv2-pill" :class="x.cls"><span class="rv2-dot"></span>{{ x.estado }}</span><span>{{ x.texto }}</span></div>
          </div>
        </div>
        <div class="rv2-card">
          <span class="rv2-st">Así lo contó el motor</span>
          <p class="rv2-hint">Los últimos cambios de etapa. En el log del edge se ven igual: <code>docker logs wanomi-edge | grep "«{{ model.nombre }}»"</code></p>
          <p v-if="!transiciones.length" class="rv2-hint">Sin cambios de etapa todavía.</p>
          <pre v-else class="rv2-log">{{ transiciones.join('\n') }}</pre>
        </div>
      </section>

      <!-- ═════════ COSTADO ═════════ -->
      <aside class="rv2-side" aria-label="Resumen">
        <div class="rv2-card">
          <span class="rv2-lab">La regla dice</span>
          <p class="rv2-resumen">{{ resumen }}</p>
        </div>
        <div v-if="view === 'editar'" class="rv2-card">
          <div class="rv2-condh"><b>Prueba con las últimas 24 h</b><button type="button" class="rv2-btn sec sm" :disabled="simLoading || !simulable" @click="simular(true)">{{ simLoading ? 'Calculando…' : 'Probar de nuevo' }}</button></div>
          <p v-if="simError" class="rv2-err">{{ simError }}</p>
          <p v-else-if="!simulable" class="rv2-hint">Completá las condiciones para probarla.</p>
          <template v-else-if="simInst">
            <div class="rv2-grid3 tiles">
              <div class="rv2-tile"><div class="rv2-lab">Habría avisado</div><div class="rv2-big">{{ simInst.avisos.length }} {{ simInst.avisos.length === 1 ? 'vez' : 'veces' }}</div></div>
              <div class="rv2-tile"><div class="rv2-lab">En alarma</div><div class="rv2-big">{{ dur(simInst.alarmaMs) }}</div></div>
              <div class="rv2-tile"><div class="rv2-lab">Sin datos</div><div class="rv2-big">{{ dur(simInst.sinDatosMs) }}</div></div>
            </div>
            <p v-if="faltanteTxt" style="margin: 8px 0 0;">{{ faltanteTxt }}</p>
            <p class="rv2-hint">No avisa a nadie: corre la regla con el mismo motor sobre los datos guardados del sitio ({{ simInstances.length }} {{ simInstances.length === 1 ? 'equipo' : 'equipos' }}).</p>
          </template>
          <p v-else-if="sim" class="rv2-hint">En las últimas 24 h no hay datos de estos equipos: el gráfico muestra datos de ejemplo.</p>
        </div>
        <div v-else class="rv2-card"><b>Guardada</b><p class="rv2-hint">Los equipos del sitio la aplican al instante, sin reiniciar nada.</p></div>
      </aside>
    </div>
  </div>
</template>

<script>
import { deviceTypeName, fillThresholdText, resolveCondValue, LIMIT_REF_LABELS } from '@/components/rules/ruleSentence.js';
import {
  MEDIDAS, CON_VENTANA, SOLO_BOOL, VALOR_LAB, opsFor, emptyCond, emptyModel, ruleToModel, modelToRule, condProblem,
} from '@/components/rules/ruleModelV2.js';

const STEP = { E1: 'Vigilando', E2: 'Observando', E3: 'Alarma', E4: 'Recuperándose', E5: 'Sin datos', E6: 'Esperando confirmación' };
const STEP_CLS = { E1: 'p-no', E2: 'p-jun', E3: 'p-ala', E4: 'p-rec', E5: 'p-sin', E6: 'p-conf' };
const STATE = { si: ['p-si', 'sí'], no: ['p-no', 'no'], jun: ['p-jun', 'juntando lecturas'], sin: ['p-sin', 'sin dato'] };
const AYUDA = {
  limite: 'Usa el límite que el propio equipo tiene configurado; si el equipo no lo informa, usa el valor de respaldo.',
  clavado: 'Mirá al menos 15 minutos: un sensor clavado solo manda su lectura cada 5 minutos.',
  salto: 'Un salto dura un instante: para combinarlo con otras condiciones, cuenta como cumplido durante los segundos indicados.',
  anormal: 'Compara con lo que viene midiendo este equipo. 3 = muy fuera de lo normal.',
  vida: 'Vuelve a cero cuando se registra el service desde el detalle de la alarma.',
  tendencia: 'Cuánto cambia por minuto, mirando el período indicado.',
  proyeccion: 'Las horas que faltan para llegar al valor indicado, según cómo viene.',
};

export default {
  name: 'RuleEditorV2',
  props: {
    pack: { type: Object, required: true },
    sheets: { type: Array, default: () => [] },
    rule: { type: Object, default: null },
    editingIndex: { default: null },
    // async (rule, index) => boolean — guarda el pack (lo hace la página, camino de siempre).
    saveFn: { type: Function, required: true },
  },
  data() {
    const m = this.rule ? ruleToModel(this.rule, this.pack) : emptyModel(this.pack);
    // {umbral} en el nombre o la recomendación: en pantalla se ve el valor; al guardar vuelve el
    // marcador si el texto lo conserva, así sigue al límite de la ficha si cambia.
    const umb = { txt: '', nombre: null, reco: null };
    if (m && this.rule) {
      umb.txt = fillThresholdText('{umbral}', this.rule, this.sheets);
      for (const [k, f] of [['nombre', 'label'], ['reco', 'recommendation']]) {
        const orig = this.rule[f];
        if (typeof orig === 'string' && orig.includes('{umbral}')) { m[k] = fillThresholdText(orig, this.rule, this.sheets); umb[k] = { orig, shown: m[k] }; }
      }
    }
    return {
      umb,
      model: m || emptyModel(this.pack), view: 'editar', saving: false, savedRule: null,
      devices: [], devicesLoaded: false, sim: null, simLoading: false, simError: '', simKey: '', instIdx: 0,
      t: 1, playing: false, nowData: null, nowAt: 0, tickNow: 0,
      W: 640, H: 150, PL: 52, PR: 12, PT: 12, PB: 26,
      conVentana: CON_VENTANA, valorLab: VALOR_LAB, ayuda: AYUDA,
    };
  },
  computed: {
    packType() { return this.model.packType || this.pack.deviceType; },
    packKind() { return deviceTypeName(this.packType, this.sheets); },
    packKindLower() { return this.packKind.toLowerCase(); },
    sheetByType() { const m = {}; for (const s of this.sheets) m[s.deviceType] = s; return m; },
    builtRule() {
      const r = modelToRule(this.model, { pack: this.pack, existing: this.rule, editingIndex: this.editingIndex, isBoolVar: (dt, v) => this.tipoVarDe(dt, v) === 'bool' });
      const back = (u, txt) => {
        if (!u || typeof txt !== 'string') return txt;
        if (txt === u.shown) return u.orig;
        return this.umb.txt && txt.includes(this.umb.txt) ? txt.replace(this.umb.txt, '{umbral}') : txt;
      };
      r.label = back(this.umb.nombre, r.label);
      r.recommendation = back(this.umb.reco, r.recommendation);
      return r;
    },
    leafIdsBuilt() { const r = this.builtRule; return r.type === 'cross' ? r.crossExpr.children.map((l) => l.leafId) : ['L1']; },
    excede() { return this.model.conds.length > 8 || this.nMetricas > 3; },
    nMetricas() { return this.model.conds.filter((c) => !['valor', 'limite'].includes(c.medida)).length; },
    contador() { return `${this.model.conds.length} de 8 condiciones · ${this.nMetricas} de 3 que miran cómo evoluciona la medición`; },
    simulable() { return this.model.conds.every((c) => !condProblem(c)); },
    canSave() { return !!this.model.nombre.trim() && this.simulable && !this.excede; },
    resumen() {
      const g = { info: 'informativa', warning: 'de advertencia', critical: 'crítica' }[this.model.gravedad];
      const u = this.model.union === 'todas' ? 'y' : 'o';
      const fr = this.model.conds.map((c) => this.frase(c)).map((f) => f.charAt(0).toLowerCase() + f.slice(1));
      const cierre = this.model.cierreModo === 'auto' ? `Se cierra sola tras ${this.model.cierre || 0} s normal.` : 'Al normalizarse espera la confirmación del operador.';
      return `Alarma ${g} ${this.model.alcance === 'equipo' ? 'en cada ' + this.packKindLower : 'para el sitio'} cuando ${fr.join(fr.length > 2 ? `, ${u} ` : ` ${u} `)}, durante ${this.model.espera || 0} s. ${cierre}`;
    },
    // ── simulación ──
    simInstances() { return (this.sim && this.sim.instances) || []; },
    simInst() { return this.simInstances[Math.min(this.instIdx, this.simInstances.length - 1)] || null; },
    fuenteTxt() { return this.simInst ? `datos reales de ${this.simInst.deviceName}, últimas ${this.sim.hours} h` : (this.simLoading ? 'calculando con los datos reales…' : 'datos de ejemplo'); },
    chartTitle() { return this.simInst ? 'Cómo se comportó esta condición en las últimas 24 h' : 'Cómo se vería esta condición (datos de ejemplo)'; },
    nS() { return this.simInst ? this.simInst.steps.length : 81; },
    k() { return Math.max(0, Math.min(this.nS - 1, Math.round(this.t * (this.nS - 1)))); },
    cx() { return this.X(this.k); },
    ejeX() { return this.simInst ? [`hace ${this.sim.hours} h`, `hace ${Math.round(this.sim.hours / 2)} h`, 'ahora'] : ['0', this.fmtSeg(this.ejemplo.T / 2), this.fmtSeg(this.ejemplo.T)]; },
    playTxt() { return this.playing ? 'Pausa' : (this.t >= 1 ? '▶ Reproducir' : '▶ Seguir'); },
    ejemplo() { return this.generarEjemplo(); },
    ciclo() {
      const steps = this.simInst ? this.simInst.steps : this.ejemplo.steps;
      const k = this.k;
      const bandas = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'].map((e) => ({ e, d: this.zonas(steps.map((x) => x === e), k, 10, 46) }));
      let avisos = [], cierres = [];
      if (this.simInst) {
        const { from, to } = this.sim; const xt = (ts) => this.PL + ((ts - from) / (to - from)) * (this.W - this.PL - this.PR);
        avisos = this.simInst.avisos.filter((ts) => (ts - from) / (to - from) <= this.t).map(xt);
        cierres = this.simInst.cierres.filter((ts) => (ts - from) / (to - from) <= this.t).map(xt);
      } else {
        avisos = this.ejemplo.avisos.filter((j) => j <= k).map(this.X); cierres = this.ejemplo.cierres.filter((j) => j <= k).map(this.X);
      }
      const nA = this.simInst ? this.simInst.avisos.length : this.ejemplo.avisos.length;
      const resumen = this.simInst
        ? (nA ? `En las últimas ${this.sim.hours} h habría avisado ${nA} ${nA === 1 ? 'vez' : 'veces'}.` : `En las últimas ${this.sim.hours} h no habría avisado.`)
        : (nA ? 'Con estos datos de ejemplo avisa y después se cierra.' : 'Con estos datos de ejemplo no llegaría a avisar: revisá la espera o las condiciones.');
      const ahora = this.simInst ? this.momento(k) : this.fmtSeg(k * this.ejemplo.dt);
      return { bandas, avisos, cierres, resumen, ahora: `${ahora} · ${STEP[steps[k]] || ''}` };
    },
    faltanteTxt() {
      const f = this.simInst && this.simInst.faltante; if (!f) return '';
      const i = this.leafIdsBuilt.indexOf(f.leafId); if (i < 0) return '';
      return `Estuvo cerca varias veces: lo que faltó fue “${this.frase(this.model.conds[i])}”.`;
    },
    // ── ahora ──
    nowAge() { this.tickNow; if (!this.nowAt) return 'cargando…'; const s = Math.round((Date.now() - this.nowAt) / 1000); return `última lectura hace ${s} s`; },
    ahora() {
      const d = this.nowData; if (!d) return [];
      const out = d.instances.map((x) => ({
        key: x.key, nombre: x.deviceName || (x.key.endsWith(':' + x.siteId) ? 'Sitio ' + x.siteId : x.dId),
        etapa: STEP[x.step] || x.step, cls: STEP_CLS[x.step] || 'p-no', porque: this.porque(x, d),
        conds: this.condsAhora(x),
      }));
      if (!out.length) out.push({ key: 'reposo', nombre: this.model.alcance === 'equipo' ? `Todos los equipos «${this.packKind}»` : 'El sitio', etapa: 'Vigilando', cls: 'p-no', porque: 'Ningún equipo cumple las condiciones ahora.', conds: [] });
      return out;
    },
    transiciones() {
      const d = this.nowData; if (!d || !d.transitions) return [];
      return d.transitions.map((t) => `${new Date(t.ts).toLocaleTimeString('es-AR')} ${t.deviceName || t.dId || 'sitio'}: ${STEP[t.from] || t.from} → ${STEP[t.to] || t.to}${t.action === 'notify' ? ' · AVISO' : t.action === 'resolve' ? ' · alarma cerrada' : ''}`);
    },
  },
  watch: {
    model: { deep: true, handler() { this.programarSim(); } },
  },
  async mounted() {
    await this.cargarEquipos();
    this.programarSim(0);
  },
  beforeDestroy() { this.parar(); clearTimeout(this._simT); clearInterval(this._nowI); clearInterval(this._ageI); },
  methods: {
    hdr() { return { headers: { token: this.$store.state.auth.token } }; },
    async cargarEquipos() {
      try { const r = await this.$axios.get(`/rulepacks/${encodeURIComponent(this.pack.packId)}/devices`, this.hdr()); this.devices = (r.data && r.data.data) || []; }
      catch (e) { this.devices = []; }
      this.devicesLoaded = true;
    },
    // ── equipos ──
    equipoNombre(e) {
      if (e === 'este') return `Este ${this.packKindLower}`;
      if (e.startsWith('tipo:')) return `Los «${deviceTypeName(e.slice(5), this.sheets)}» del mismo sitio`;
      const d = this.devices.find((x) => x.dId === e); return d ? d.name : (this.devicesLoaded ? 'Equipo que ya no está en el sitio' : 'cargando equipo…');
    },
    tipoEquipo(e) { if (e === 'este') return this.packType; if (e.startsWith('tipo:')) return e.slice(5); const d = this.devices.find((x) => x.dId === e); return d ? d.deviceType : null; },
    opcionesEquipo(c) {
      const t0 = c.equipos.length ? this.tipoEquipo(c.equipos[0]) : null;
      const tiene = (e) => c.equipos.includes(e);
      const conEste = tiene('este'), conTipo = c.equipos.some((e) => e.startsWith('tipo:'));
      // Primero lo que vale en cualquier sitio (este equipo / los del mismo sitio); después los
      // equipos puntuales agrupados por sitio: un equipo elegido solo existe en su sitio.
      const generales = [];
      if (this.model.alcance === 'equipo' && !conEste) generales.push({ v: 'este', t: `Este ${this.packKindLower}`, dis: !!t0 && (t0 !== this.packType || c.equipos.length > 0) });
      const tipos = [...new Set(this.devices.map((d) => d.deviceType).concat(this.sheets.map((s) => s.deviceType)))].filter(Boolean);
      for (const dt of tipos) if (!tiene(`tipo:${dt}`)) generales.push({ v: `tipo:${dt}`, t: `Los «${deviceTypeName(dt, this.sheets)}» del mismo sitio`, dis: c.equipos.length > 0 });
      const out = [{ label: null, opts: generales }];
      const porSitio = new Map();
      for (const d of this.devices) {
        if (tiene(d.dId)) continue;
        const k = this.sitioDe(d);
        if (!porSitio.has(k)) porSitio.set(k, []);
        porSitio.get(k).push({ v: d.dId, t: `${d.name} · ${deviceTypeName(d.deviceType, this.sheets)}`, dis: conEste || conTipo || (!!t0 && d.deviceType !== t0) });
      }
      for (const k of [...porSitio.keys()].sort()) out.push({ label: `Solo en ${k}`, opts: porSitio.get(k) });
      return out;
    },
    sitioDe(d) { return d.siteId ? (d.siteName && d.siteName !== d.siteId ? `${d.siteId} · ${d.siteName}` : d.siteId) : 'sin sitio asignado'; },
    // Aviso cuando se eligen equipos puntuales: la regla corre en todos los sitios del tipo, pero
    // esos equipos están en uno solo; en los otros la condición queda "sin dato".
    avisoSitio(c) {
      const elegidos = c.equipos.filter((e) => e !== 'este' && !e.startsWith('tipo:'));
      if (!elegidos.length) return '';
      const todos = new Set(this.devices.map((d) => d.siteId || ''));
      if (todos.size < 2) return '';
      const sit = [...new Set(elegidos.map((e) => { const d = this.devices.find((x) => x.dId === e); return d ? (d.siteId || 'sin sitio asignado') : null; }).filter(Boolean))];
      if (!sit.length) return '';
      return sit.length === 1
        ? `Esta condición solo aplica en el sitio ${sit[0]}; en los demás sitios va a quedar sin dato.`
        : `Esta condición solo aplica en los sitios ${sit.join(' y ')} (cada uno con sus equipos); en los demás sitios va a quedar sin dato.`;
    },
    agregarEquipo(c, ev) {
      const v = ev.target.value; ev.target.value = ''; if (!v) return;
      c.equipos.push(v);
      const dt = this.tipoEquipo(v);
      if (dt && dt !== c.deviceType) { c.deviceType = dt; c.variable = ''; c.limiteVar = ''; c.otra = ''; }
    },
    quitarEquipo(c, e) { c.equipos.splice(c.equipos.indexOf(e), 1); },
    variosEquipos(c) { return c.equipos.length > 1 || c.equipos.some((e) => e.startsWith('tipo:')); },
    setAlcance(a) {
      this.model.alcance = a;
      if (a === 'sitio') for (const c of this.model.conds) { const i = c.equipos.indexOf('este'); if (i >= 0) c.equipos.splice(i, 1, `tipo:${this.packType}`); }
    },
    agregarCond() { const c = emptyCond(this.model.alcance, this.packType); this.model.conds.push(c); },
    // ── mediciones ──
    variablesDe(dt) { const s = this.sheetByType[dt]; return (s && s.variables) || []; },
    varDe(dt, v) { return this.variablesDe(dt).find((x) => x.name === v) || null; },
    tipoVarDe(dt, v) { const x = this.varDe(dt, v); return (x && x.type) || 'float'; },
    tipoVar(c) { return this.tipoVarDe(c.deviceType, c.variable); },
    enumDe(c) { const x = this.varDe(c.deviceType, c.variable); return ((x && x.enumValues) || []).map((e) => (typeof e === 'object' ? { value: e.value, label: e.label || e.value } : { value: e, label: e })); },
    unidadDe(c) { const x = this.varDe(c.deviceType, c.variable); return (x && x.unit) || ''; },
    varEtiqueta(v) { return (v.label || String(v.name).replace(/_/g, ' ')) + (v.unit ? ` (${v.unit})` : ''); },
    medidasDe(c) { const b = ['bool', 'categorical', 'string'].includes(this.tipoVar(c)); return b ? MEDIDAS.filter((m) => SOLO_BOOL.includes(m.v)) : MEDIDAS; },
    opsDe(c) { const b = ['bool', 'categorical', 'string'].includes(this.tipoVar(c)); return opsFor(c.medida, b); },
    setMedida(c, v) { c.medida = v; const ops = this.opsDe(c); if (!ops.some((o) => o.v === c.op)) c.op = ops[0].v; const md = MEDIDAS.find((m) => m.v === v); if (md && md.win && !c.ventana) c.ventana = String(md.win); },
    problema(c) { return condProblem(c); },
    // Condición sin número propio que sigue al límite de la ficha o a otra medición: qué valor
    // usa hoy, para mostrarlo en el campo, la frase y el gráfico (nunca se guarda ese número).
    valorAtado(c) {
      if (c.valor !== '' && c.valor != null) return null;
      const ex = (c.extra && c.extra.condition) || {};
      const u = this.unidadDe(c) ? ` ${this.unidadDe(c)}` : '';
      if (ex.limitRef) {
        const val = resolveCondValue({ op: c.op, limitRef: ex.limitRef }, c.deviceType, c.variable, this.sheets);
        const lab = LIMIT_REF_LABELS[ex.limitRef] || 'límite de la ficha';
        const num = typeof val === 'number' ? String(val).replace('.', ',') : null;
        return { valor: typeof val === 'number' ? val : null, corto: num || 'ficha',
          frase: num ? `${num} (${lab})` : `el ${lab}`,
          largo: num ? `Usa el ${lab}: ${num}${u}. Si cambia en la ficha, la regla lo sigue. Si escribís un número, queda fijo.` : `Usa el ${lab}, que todavía no tiene valor cargado. Escribí un número o cargalo en la ficha.` };
      }
      if (ex.ref) {
        return { valor: null, corto: 'relativo', frase: 'el valor relativo configurado',
          largo: 'Se compara contra otra medición (configurado en el editor anterior). Si escribís un número, queda fijo.' };
      }
      return null;
    },
    frase(c) {
      const x = this.varDe(c.deviceType, c.variable);
      const vl = x ? (x.label || String(x.name).replace(/_/g, ' ')) : 'la medición';
      const u = x && x.unit ? ` ${x.unit}` : '';
      const nom = c.equipos.map((e) => (e === 'este' ? `este ${this.packKindLower}` : this.equipoNombre(e)));
      const quien = !nom.length ? 'de [elegí un equipo]' : nom.length === 1 ? `de ${nom[0]}` : c.modo === 'todos' ? `de ${nom.slice(0, -1).join(', ')} y ${nom[nom.length - 1]} (todos)` : `de ${nom.slice(0, -1).join(', ')} o ${nom[nom.length - 1]}`;
      const opT = (this.opsDe(c).find((o) => o.v === c.op) || {}).t || '';
      const at = this.valorAtado(c);
      const v = c.valor === '' ? (at ? at.frase : '…') : c.valor;
      const tv = this.tipoVar(c);
      if (c.medida === 'valor' && tv === 'bool') return `${vl} ${quien} ${c.op === 'eq' ? 'sea' : 'no sea'} «${c.valor === '1' ? 'sí' : 'no'}»`;
      if (c.medida === 'valor' && this.enumDe(c).length) { const e = this.enumDe(c).find((z) => String(z.value) === String(c.valor)); return `${vl} ${quien} ${opT} «${e ? e.label : v}»`; }
      switch (c.medida) {
        case 'valor': return `${vl} ${quien} ${opT} ${v}${u}`;
        case 'limite': return `${vl} ${quien} ${opT} el límite que informa el equipo`;
        case 'tendencia': return `${vl} ${quien} ${opT} ${v}${u} por minuto (últimos ${c.ventana} min)`;
        case 'proyeccion': return `${vl} ${quien} vaya a llegar a ${c.objetivo || '…'}${u} en menos de ${v} h`;
        case 'relacion': case 'diferencia': { const o = this.varDe(c.deviceType, c.otra); return `la ${c.medida} entre ${vl.toLowerCase()} y ${o ? (o.label || o.name).toLowerCase() : 'otra medición'} ${quien} ${opT} ${v}`; }
        case 'sinreporte': return `${vl} ${quien} lleve más de ${v} min sin reportarse`;
        case 'salto': return `${vl} ${quien} dé un salto de más de ${v}${u} (cuenta ${c.cuenta} s)`;
        case 'vida': return `${vl} ${quien} acumule más de ${v} horas de uso`;
        default: { const md = MEDIDAS.find((m) => m.v === c.medida); return `${vl} ${quien}: ${md ? md.t : ''} — ${opT} ${v}${VALOR_LAB[c.medida] ? ' ' + VALOR_LAB[c.medida] : u}`; }
      }
    },
    // ── simulación con el motor real (QA /simulate) ──
    programarSim(ms = 1200) { clearTimeout(this._simT); this._simT = setTimeout(() => this.simular(false), ms); },
    async simular(force) {
      if (!this.simulable) return;
      const rule = this.builtRule;
      const key = JSON.stringify([rule.type, rule.deviceType, rule.variable, rule.condition, rule.crossExpr, rule.scope, rule.metric, rule.mWindow, rule.mParams, rule.inputs, rule.setpointSource, rule.graceSec, rule.resolveGraceSec, rule.reset_behavior]);
      if (!force && key === this.simKey) return;
      this.simKey = key; this.simLoading = true; this.simError = '';
      try {
        const r = await this.$axios.post('/qa/simulate', { rule, hours: 24 }, { ...this.hdr(), timeout: 95000 });
        if (key === this.simKey) { this.sim = r.data && r.data.ok ? r.data : null; this.instIdx = 0; }
      } catch (e) {
        if (key === this.simKey) { this.sim = null; this.simError = (e.response && e.response.data && e.response.data.error) || 'No se pudo probar la regla ahora.'; }
      } finally { if (key === this.simKey) this.simLoading = false; }
    },
    // ── gráfico de una condición ──
    X(j) { return this.PL + (j / Math.max(1, this.nS - 1)) * (this.W - this.PL - this.PR); },
    zonas(arr, upto, y0, y1) {
      let d = '', st = -1;
      for (let j = 0; j <= upto && j < arr.length; j++) {
        if (arr[j] && st < 0) st = j;
        if ((!arr[j] || j === upto || j === arr.length - 1) && st >= 0) { const e = arr[j] ? j : j - 1; d += `M${this.X(st)} ${y0}H${this.X(e) + (e === st ? 2 : 0)}V${y1}H${this.X(st)}Z`; st = -1; }
      }
      return d;
    },
    grafico(i) {
      const c = this.model.conds[i]; const x = this.varDe(c.deviceType, c.variable);
      let vals, states, thrs, real = false;
      const leaf = this.simInst && this.simInst.leaves.find((l) => l.leafId === this.leafIdsBuilt[i]);
      if (leaf) { real = true; vals = leaf.values; states = leaf.states; thrs = leaf.thresholds; }
      else { const ex = this.ejemplo.series[i] || { vals: [], states: [], thr: null }; vals = ex.vals; states = ex.states; thrs = ex.vals.map(() => ex.thr); }
      const nums = vals.map((v) => (typeof v === 'number' ? v : (v == null ? null : (states ? null : null))));
      const numeric = nums.some((v) => v != null);
      const tv = numeric ? nums : states.map((s) => (s === 'si' ? 1 : s === 'no' ? 0 : null));
      const thrN = (thrs || []).map((v) => (typeof v === 'number' ? v : null));
      const all = tv.concat(thrN).filter((v) => v != null);
      let lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1; const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad;
      const Y = (v) => this.PT + (1 - (v - lo) / (hi - lo)) * (this.H - this.PT - this.PB);
      const k = this.k;
      const pts = tv.slice(0, k + 1).map((v, j) => (v == null ? null : `${this.X(j).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(' ');
      const thr = thrN.slice(0, this.nS).map((v, j) => (v == null ? null : `${this.X(j).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(' ');
      const lastThr = thrN.filter((v) => v != null).pop();
      const md = MEDIDAS.find((m) => m.v === c.medida);
      const u = x && x.unit ? x.unit : '';
      const yl = c.medida === 'valor' || c.medida === 'limite' ? `${x ? (x.label || x.name) : 'medición'}${u ? ' (' + u + ')' : ''}` : (md ? md.t : '');
      const sk = states[k]; const vk = vals[k];
      const fmt = (v) => (typeof v === 'number' ? `${Math.round(v * 100) / 100}` : (v == null ? '—' : String(v)));
      return {
        pts, thr, thrY: lastThr != null ? Y(lastThr) : -10, thrTxt: lastThr != null ? `umbral ${fmt(lastThr)}` : '',
        zona: this.zonas(states.map((s) => s === 'si'), k, this.PT, this.H - this.PB),
        sinDato: this.zonas(states.map((s) => s === 'sin'), k, this.PT, this.H - this.PB), yl,
        leyenda: `${real ? this.momento(k) : this.fmtSeg(k * this.ejemplo.dt)} · ${fmt(vk)} · ${sk === 'si' ? 'se cumple' : sk === 'sin' ? 'sin dato' : sk === 'jun' ? 'juntando lecturas' : 'no se cumple'}`,
        cls: sk === 'si' ? 'p-si' : sk === 'sin' ? 'p-sin' : 'p-no',
      };
    },
    // Datos de ejemplo (solo cuando no hay historia): cruzan el umbral y vuelven, respetando la espera y el cierre.
    generarEjemplo() {
      const N = 81, esp = Number(this.model.espera) || 0, cie = Number(this.model.cierre) || 0;
      const T = Math.max(600, 6 * (esp + cie)), dt = T / (N - 1);
      const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
      const series = this.model.conds.map((c, i) => {
        const a = 0.22 + 0.07 * i, b = 0.68 - 0.04 * i; const ins = (x) => sm(a - 0.04, a + 0.04, x) * (1 - sm(b - 0.04, b + 0.04, x));
        const at = this.valorAtado(c);
        let thr = Number(String(c.valor === '' && at && at.valor != null ? at.valor : c.valor).replace(',', '.')); if (!Number.isFinite(thr)) thr = 50;
        const up = ['gt', 'gte', 'sube', 'neq', 'eq'].includes(c.op) || ['salto', 'anormal', 'vida', 'caida', 'sinreporte'].includes(c.medida);
        if (this.tipoVar(c) === 'bool') { const want = c.op === 'eq' ? Number(c.valor) : 1 - Number(c.valor); const vals = Array.from({ length: N }, (_, j) => (ins(j / (N - 1)) > 0.5 ? want : 1 - want)); return { vals, states: vals.map((v) => (v === want ? 'si' : 'no')), thr: null }; }
        if (c.medida === 'tendencia' && c.op === 'baja') thr = -thr;
        const b0 = up ? thr * 0.85 : thr * 1.15, p0 = up ? thr * 1.12 : thr * 0.88;
        const vals = Array.from({ length: N }, (_, j) => b0 + (p0 - b0) * ins(j / (N - 1)) + Math.sin(j * 1.7 + i) * 0.015 * Math.abs(thr || 1));
        return { vals, states: vals.map((v) => ((c.medida === 'tendencia' && c.op === 'baja') || !up ? v < thr : v > thr) ? 'si' : 'no'), thr };
      });
      const comb = Array.from({ length: N }, (_, j) => (this.model.union === 'todas' ? series.every((s) => s.states[j] === 'si') : series.some((s) => s.states[j] === 'si')));
      const steps = []; let e = 'E1', desde = 0; const avisos = [], cierres = [];
      for (let j = 0; j < N; j++) {
        const ts = j * dt, on = comb[j];
        if (e === 'E1' && on) { e = 'E2'; desde = ts; } else if (e === 'E2' && !on) e = 'E1';
        if (e === 'E2' && ts - desde >= esp) { e = 'E3'; avisos.push(j); }
        else if (e === 'E3' && !on) { e = this.model.cierreModo === 'auto' ? 'E4' : 'E6'; desde = ts; } else if (e === 'E4' && on) e = 'E3';
        if (e === 'E4' && ts - desde >= cie) { e = 'E1'; cierres.push(j); }
        steps.push(e);
      }
      return { N, T, dt, series, steps, avisos, cierres };
    },
    momento(k) { if (!this.sim) return ''; const ts = this.sim.from + (k / Math.max(1, this.nS - 1)) * (this.sim.to - this.sim.from); return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); },
    fmtSeg(s) { return s < 120 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`; },
    dur(ms) { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`; },
    // ── reproductor ──
    togglePlay() { if (this.playing) return this.parar(); if (this.t >= 1) this.t = 0; this.playing = true; this._pi = setInterval(() => { this.t = Math.min(1, this.t + 0.01); if (this.t >= 1) this.parar(); }, 70); },
    playFromStart() { this.parar(); this.t = 0; this.togglePlay(); },
    parar() { clearInterval(this._pi); this._pi = null; this.playing = false; },
    // ── guardar y "Ahora" ──
    async save() {
      if (!this.canSave) return;
      this.saving = true;
      try {
        const rule = this.builtRule;
        const ok = await this.saveFn(rule, this.editingIndex);
        if (ok) { this.savedRule = rule; this.view = 'guardada'; this.cargarAhora(); clearInterval(this._nowI); this._nowI = setInterval(this.cargarAhora, 5000); clearInterval(this._ageI); this._ageI = setInterval(() => { this.tickNow++; }, 1000); }
      } finally { this.saving = false; }
    },
    async cargarAhora() {
      const r = this.savedRule || this.rule; if (!r) return;
      try { const res = await this.$axios.get(`/rulepacks/${encodeURIComponent(this.pack.packId)}/rules/${encodeURIComponent(r.ruleId)}/now`, this.hdr()); this.nowData = res.data && res.data.data; this.nowAt = Date.now(); }
      catch (e) { /* se reintenta en el próximo ciclo */ }
    },
    porque(x, d) {
      const s = Math.round(((d.now || Date.now()) - new Date(x.since).getTime()) / 1000);
      if (x.step === 'E2') return `Se cumple: avisa si sigue así ${Math.max(0, (d.graceSec || 0) - s)} s más.`;
      if (x.step === 'E3') return 'En alarma: el aviso ya salió.';
      if (x.step === 'E4') return `Se normalizó: se cierra si sigue así ${Math.max(0, (d.resolveGraceSec || 0) - s)} s más.`;
      if (x.step === 'E5') return 'No llega la medición: no abre ni cierra hasta que vuelva el dato.';
      if (x.step === 'E6') return 'Se normalizó: espera la confirmación del operador.';
      return 'No se cumple.';
    },
    condsAhora(x) {
      if (Array.isArray(x.leaves)) return x.leaves.map((l, i) => ({ cls: (STATE[l.state] || STATE.no)[0], estado: (STATE[l.state] || STATE.no)[1], texto: this.model.conds[i] ? this.frase(this.model.conds[i]) : l.leafId }));
      const st = x.lastR == null ? 'sin' : (x.lastR === 'off' ? 'no' : 'si');
      return this.model.conds[0] ? [{ cls: STATE[st][0], estado: STATE[st][1], texto: `${this.frase(this.model.conds[0])} · ahora ${x.value != null ? x.value : '—'}` }] : [];
    },
  },
};
</script>

<style scoped>
.rv2 { --bg: #f6faf9; --card: #fff; --card2: #f0f7f5; --ink: #12302c; --mut: #55706b; --line: #d3e1dd; --acc: #00866f; --accb: #00bf9a;
  --si: #1f8a5b; --sib: #e3f4ea; --no: #55706b; --nob: #eef3f1; --jun: #a86a00; --junb: #fbf0d9; --sin: #b4232c; --sinb: #fbe3e5;
  color: var(--ink); font-size: 15px; line-height: 1.5; }
body:not(.white-content) .rv2 { --bg: #0d1917; --card: #13221f; --card2: #0f1d1a; --ink: #e2eeea; --mut: #9db3ad; --line: #26403a; --acc: #00f2c3; --accb: #00bf9a;
  --si: #7be0a8; --sib: #173b2c; --no: #b4c6c1; --nob: #1e2c29; --jun: #f0c66e; --junb: #3a3018; --sin: #f5a0a6; --sinb: #3b1e22; }
.rv2-head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 3px solid var(--accb); margin-bottom: 18px; }
.rv2-crumb { font-size: 12.5px; color: var(--acc); font-weight: 600; }
.rv2-title { font-size: 21px; font-weight: 700; }
.rv2-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.rv2-body { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
.rv2-main { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.rv2-side { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.rv2-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; }
.rv2-step { display: flex; gap: 14px; }
.rv2-num { flex: 0 0 32px; height: 32px; border-radius: 50%; background: var(--card2); color: var(--acc); font-weight: 700; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); }
.rv2-sbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.rv2-st { font-size: 17px; font-weight: 700; }
.rv2-sh { font-size: 13.5px; color: var(--mut); margin: -8px 0 0; }
.rv2-lab { font-size: 12.5px; color: var(--mut); font-weight: 600; }
.rv2-hint { font-size: 12.5px; color: var(--mut); }
.rv2-err { font-size: 12.5px; color: var(--sin); font-weight: 600; }
.rv2-warn { display: block; margin-top: 6px; font-size: 12.5px; color: var(--jun); background: var(--junb); border-radius: 6px; padding: 6px 9px; }
.rv2-fld { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.rv2-in { font: inherit; font-size: 14.5px; color: var(--ink); background: var(--card2); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; min-height: 42px; width: 100%; box-sizing: border-box; }
.rv2-in:focus { outline: 2px solid var(--accb); outline-offset: 1px; }
.rv2-mini { width: auto; min-height: 36px; padding: 4px 8px; font-size: 13px; }
.rv2-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.rv2-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 720px) { .rv2-grid2, .rv2-grid3 { grid-template-columns: minmax(0, 1fr); } }
.rv2-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.w140 { flex: 0 1 140px; } .w150 { flex: 0 1 160px; } .w170 { flex: 0 1 180px; } .w220 { flex: 0 1 230px; }
.rv2-btn { font: inherit; font-size: 14px; font-weight: 600; border-radius: 999px; padding: 9px 18px; cursor: pointer; min-height: 42px; }
.rv2-btn.sm { padding: 4px 14px; min-height: 34px; font-size: 13px; }
.rv2-btn.pri { background: var(--accb); color: #062019; border: 1px solid var(--accb); }
.rv2-btn.sec { background: transparent; color: var(--ink); border: 1px solid var(--line); }
.rv2-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rv2-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; align-self: flex-start; }
.rv2-seg button { font: inherit; font-size: 13.5px; font-weight: 600; padding: 8px 15px; border: 0; background: transparent; color: var(--mut); min-height: 40px; cursor: pointer; }
.rv2-seg button.on { background: var(--accb); color: #062019; }
.rv2-seg button.on.crit { background: #f0727a; color: #2a0b0e; }
.rv2-union { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-weight: 600; }
.rv2-union.sm { font-weight: 400; margin-top: 4px; }
.rv2-cond { background: var(--card2); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.rv2-condh { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.rv2-chips { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding-top: 6px; }
.rv2-chip { position: relative; display: inline-flex; align-items: center; font-size: 14px; font-weight: 600; padding: 7px 16px; border-radius: 999px; background: var(--sib); color: var(--ink); border: 1px solid var(--accb); }
.rv2-x { position: absolute; top: -9px; right: -9px; width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--accb); background: var(--card); color: var(--sin); font: 700 14px/1 inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.rv2-add { width: auto; min-width: 220px; flex: 0 1 auto; }
.rv2-frase { font-size: 14px; background: var(--card); border-radius: 9px; padding: 9px 12px; border: 1px solid var(--line); }
.rv2-addc { font: inherit; background: transparent; color: var(--acc); border: 1px dashed var(--accb); border-radius: 12px; padding: 12px 16px; font-weight: 600; min-height: 46px; cursor: pointer; }
.rv2-fig { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px 8px; }
.rv2-cycle { background: var(--card2); border-color: var(--accb); }
.rv2-figh { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.rv2-figc { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.rv2-pill { font-size: 12.5px; font-weight: 600; padding: 4px 11px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.rv2-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block; }
.p-si { background: var(--sib); color: var(--si); } .p-no { background: var(--nob); color: var(--no); } .p-jun { background: var(--junb); color: var(--jun); } .p-sin { background: var(--sinb); color: var(--sin); }
.p-ala { background: #f0727a; color: #2a0b0e; } .p-rec { background: #d6ecf6; color: #1f4a5e; } .p-conf { background: #ece2f7; color: #4b2f6b; }
.g-zona { fill: rgba(240, 114, 122, 0.18); } .g-sin { fill: rgba(150, 150, 150, 0.18); }
.g-eje { stroke: var(--line); } .g-thr { fill: none; stroke: #d39b1e; stroke-width: 1.5; stroke-dasharray: 5 4; }
.g-thrt { fill: #d39b1e; font-size: 11px; } .g-serie { fill: none; stroke: var(--accb); stroke-width: 2; stroke-linejoin: round; }
.g-cursor { stroke: var(--ink); stroke-opacity: 0.35; } .g-txt { fill: var(--mut); font-size: 11px; }
.b-E1 { fill: #c9d6d2; background: #c9d6d2; } .b-E2 { fill: #e8c46a; background: #e8c46a; } .b-E3 { fill: #e0606c; background: #e0606c; }
.b-E4 { fill: #6fb3d2; background: #6fb3d2; } .b-E5 { fill: #9aa5a2; background: #9aa5a2; } .b-E6 { fill: #a989d6; background: #a989d6; }
body:not(.white-content) .b-E1 { fill: #2a3b37; background: #2a3b37; }
.m-aviso { stroke: #c0303c; stroke-width: 2; } .m-aviso-t { fill: #c0303c; font-size: 11px; }
.m-cierre { stroke: #1f8a5b; stroke-width: 2; } .m-cierre-t { fill: #1f8a5b; font-size: 11px; }
.rv2-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12.5px; color: var(--mut); margin-top: 4px; }
.rv2-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
.rv2-cycle-txt { margin: 8px 0 0; font-size: 14px; }
.rv2-resumen { margin: 6px 0 0; font-size: 15px; line-height: 1.6; }
.tiles { margin-top: 8px; } .rv2-tile { background: var(--card2); border-radius: 10px; padding: 8px 10px; } .rv2-big { font-size: 20px; font-weight: 700; }
.rv2-nowc { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; font-size: 14px; }
.rv2-log { font-size: 12.5px; line-height: 1.7; background: var(--card2); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; white-space: pre-wrap; margin: 6px 0 0; color: var(--ink); }
</style>
