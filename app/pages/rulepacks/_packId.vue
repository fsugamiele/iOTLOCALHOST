<template>
  <div>
    <div class="row">
      <div class="col-12">
        <card>
          <div slot="header" class="d-flex justify-content-between align-items-center">
            <div>
              <h3 class="card-title mb-1">{{ packId }}</h3>
              <p class="text-muted mb-0" v-if="pack">
                {{ pack.description || 'sin descripción' }}
              </p>
            </div>
            <base-button type="secondary" size="sm" @click="goBack">
              <i class="tim-icons icon-minimal-left"></i> Volver
            </base-button>
          </div>

          <p v-if="loading" class="text-muted">Cargando...</p>

          <template v-else-if="pack">
            <div class="row">
              <div class="col-md-3">
                <strong>deviceType:</strong> {{ pack.deviceType }}
              </div>
              <div class="col-md-2">
                <strong>version:</strong> {{ pack.version }}
              </div>
              <div class="col-md-2">
                <strong>canary:</strong>
                <span
                  class="badge"
                  :class="pack.canary ? 'badge-warning' : 'badge-secondary'"
                >
                  {{ pack.canary ? 'canary' : 'prod' }}
                </span>
              </div>
              <div class="col-md-5">
                <strong>actualizado:</strong> {{ formatDate(pack.updatedAt) }}
              </div>
            </div>

            <hr />

            <!-- SF-7 parte 2 · DEC-REF-66 — banner ámbar a nivel de página
                 con las warnings devueltas por el 200 del último PUT
                 (config semánticamente muerta detectada por validateC).
                 Sobrevive al cierre del modal y refleja el estado actual
                 del pack: el save handler lo re-asigna en cada PUT
                 (limpio → banner vacío; con avisos → banner actualizado).
                 La × permite descartar manualmente. -->
            <div v-if="saveWarnings.length" class="alert alert-warning">
              <button
                type="button"
                class="close"
                @click="saveWarnings = []"
                aria-label="Close"
              >×</button>
              <strong>Advertencias de configuración del pack:</strong>
              <ul class="mb-0 mt-2">
                <li v-for="(w, i) in saveWarnings" :key="i">{{ w }}</li>
              </ul>
            </div>

            <div class="d-flex justify-content-between align-items-center mb-3">
              <h4 class="mb-0">Reglas ({{ (pack.rules || []).length }})</h4>
              <div>
                <!-- DEC-REF-100 D-7 (F6): el alta guiada es el camino
                     principal; el formulario completo queda como modo
                     avanzado (F7) para C/S/cross y parámetros finos. -->
                <base-button type="default" size="sm" @click="openNewRule">
                  <i class="tim-icons icon-settings"></i> Modo avanzado
                </base-button>
                <base-button type="primary" size="sm" @click="openWizardNew">
                  <i class="tim-icons icon-simple-add"></i> Nueva regla
                </base-button>
              </div>
            </div>

            <!-- DEC-REF-100 D-7 (F6): tabla legible — qué hace cada regla
                 en lenguaje de usuario, sin jerga técnica a la vista. -->
            <base-table
              v-if="(pack.rules || []).length > 0"
              :data="pack.rules"
              :columns="['Regla', 'Qué hace', 'Severidad', 'Acciones']"
              thead-classes="text-primary"
            >
              <template slot-scope="{ row, index }">
                <td>
                  <strong>{{ row.label }}</strong><br />
                  <small class="text-muted">{{ row.ruleId }} · tipo {{ row.type }}</small>
                </td>
                <td>
                  {{ ruleSentence(row) }}
                  <div v-if="row.recommendation" class="text-muted" style="font-size:12px">
                    <i class="fa fa-wrench" style="margin-right:4px"></i>{{ row.recommendation }}
                  </div>
                </td>
                <td>
                  <span class="badge" :class="severityBadge(row.severity)">
                    {{ row.severity }}
                  </span>
                </td>
                <td>
                  <base-button
                    type="info"
                    size="sm"
                    @click="openEditRule(index)"
                    title="Editar regla"
                  >
                    <i class="tim-icons icon-pencil"></i>
                  </base-button>
                  <base-button
                    type="danger"
                    size="sm"
                    @click="openDeleteRule(index)"
                    title="Borrar regla"
                  >
                    <i class="tim-icons icon-simple-remove"></i>
                  </base-button>
                </td>
              </template>
            </base-table>

            <p v-else class="text-muted">
              Este pack no tiene reglas todavía. Usá "Nueva regla" para agregarlas.
            </p>
          </template>
        </card>
      </div>
    </div>

    <!-- MODAL: form de regla (nueva o edición) -->
    <el-dialog
      :title="ruleModalTitle"
      :visible.sync="ruleModal"
      width="720px"
      :close-on-click-modal="false"
    >
      <template v-if="ruleDraft">
        <!-- SF-7 parte 2 · DEC-REF-66.a/.b — mini-forms C y S incorporados
             (R23). El stub anterior "edición en roadmap futuro" queda
             obsoleto: ahora los 4 types se editan con paridad. -->
        <!-- DEC-REF-100 D-7 (F7) — modo avanzado: arriba lo esencial
             (nombre, severidad, tipo, equipo, variable, recomendación);
             la identidad técnica (ruleId/inferenceId), los tiempos y las
             configs de C/S/cross viven en la sección desplegable. -->
        <div class="row">
          <div class="col-md-6">
            <label>Nombre de la regla <span class="text-danger">*</span></label>
            <base-input v-model="ruleDraft.label" placeholder="Presión de aceite baja" />
          </div>
          <div class="col-md-3">
            <label>Importancia <span class="text-danger">*</span></label>
            <select v-model="ruleDraft.severity" class="form-control">
              <option value="info">Informativa</option>
              <option value="warning">Atención</option>
              <option value="critical">Crítica</option>
            </select>
          </div>
          <div class="col-md-3">
            <label>Tipo <span class="text-danger">*</span></label>
            <select v-model="ruleDraft.type" class="form-control">
              <option value="D">Umbral simple</option>
              <option value="cross">Combinada (entre equipos)</option>
              <option value="C">Autocalibrada (setpoint)</option>
              <option value="S">Ventana de eventos</option>
            </select>
          </div>
        </div>

        <div class="row">
          <div class="col-md-6">
            <label>Equipo <span class="text-danger">*</span></label>
            <!-- S6 — el deviceType de la REGLA también es referencia a ficha
                 (DEC-REF-91 adenda #60: 2ª superficie de texto libre; la 3ª,
                 CrossExprNode, sigue fuera de la rebanada). Default: la ficha
                 del pack (emptyRule). Mismo patrón que el selector de pack
                 (index.vue, S5). -->
            <el-select
              v-model="ruleDraft.deviceType"
              class="select-primary"
              style="width:100%"
              filterable
              :disabled="sheets.length === 0"
            >
              <el-option
                v-for="s in sheets"
                :key="s.deviceType"
                :label="s.manufacturer ? `${s.deviceType} — ${s.manufacturer} ${s.model || ''}`.trim() : s.deviceType"
                :value="s.deviceType"
              />
            </el-select>
            <small v-if="sheets.length === 0" class="text-warning">
              No hay fichas de equipo cargadas (o no se pudieron cargar).
            </small>
          </div>
          <div class="col-md-6">
            <label>Variable <span class="text-danger">*</span></label>
            <!-- S6 — variables de la ficha del deviceType elegido en la regla.
                 Estricto cuando la ficha declara variables (decisión Franco,
                 #70); texto libre cuando no — espejo del criterio de warnings
                 del backend (rulepacks.js: una ficha con variables:[] no
                 tiene contra qué validar). -->
            <el-select
              v-if="draftVariables.length > 0"
              v-model="ruleDraft.variable"
              placeholder="Elegir variable de la ficha"
              class="select-primary"
              style="width:100%"
              filterable
            >
              <el-option
                v-for="v in draftVariables"
                :key="v.name"
                :label="v.label ? `${v.name} — ${v.label}` : v.name"
                :value="v.name"
              />
            </el-select>
            <base-input v-else v-model="ruleDraft.variable" placeholder="oil_pressure" />
            <small v-if="ruleSheet && draftVariables.length === 0" class="text-warning">
              La ficha {{ ruleDraft.deviceType }} no declara variables — texto libre.
            </small>
          </div>
        </div>

        <!-- DEC-REF-100 D-7 — recommendation editable también en el form
             clásico (en el wizard vive en el paso 4). Es el texto que
             acompaña la notificación (F2). -->
        <div class="row">
          <div class="col-md-12">
            <label>Recomendación — qué hacer cuando dispara (opcional)</label>
            <textarea
              v-model="ruleDraft.recommendation"
              class="form-control"
              rows="2"
              placeholder="ej: Coordinar recarga de combustible con el proveedor"
            ></textarea>
          </div>
        </div>

        <!-- typeD → condition simple (visible: es la esencia de la regla) -->
        <div v-if="ruleDraft.type === 'D'" class="mt-3">
          <h5>Condición</h5>
          <div class="row">
            <div class="col-md-4">
              <label>avisar cuando la variable esté</label>
              <select
                class="form-control"
                :value="(ruleDraft.condition || {}).op || 'gt'"
                @change="setConditionField('op', $event.target.value)"
              >
                <option v-for="op in WIZ_OPS" :key="op" :value="op">{{ OPERATOR_LABELS[op] }}</option>
              </select>
            </div>
            <div class="col-md-4">
              <label>este valor</label>
              <base-input
                type="number"
                :value="(ruleDraft.condition || {}).value !== undefined ? ruleDraft.condition.value : ''"
                @input="setConditionField('value', numericOrRaw($event))"
              />
            </div>
          </div>
        </div>

        <!-- DEC-REF-100 D-7 (F7) — opciones avanzadas desplegables:
             identidad técnica (ruleId/inferenceId), tiempos y las
             configuraciones de cross/C/S. Cerrado por default; se abre
             solo si el tipo elegido lo requiere (watch ruleDraft.type)
             o si el usuario viene desde "Opciones avanzadas" del wizard. -->
        <div class="adv-toggle mt-4" @click="advancedOpen = !advancedOpen">
          <i class="fa" :class="advancedOpen ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
          Opciones avanzadas
          <span class="text-muted" style="font-weight:400">
            — identificadores técnicos, tiempos{{ ruleDraft.type !== 'D' ? ', configuración del tipo elegido' : '' }}
          </span>
        </div>

        <div v-show="advancedOpen" class="adv-body">
        <div class="row mt-3">
          <div class="col-md-6">
            <label>ruleId <span class="text-danger">*</span></label>
            <base-input
              v-model="ruleDraft.ruleId"
              placeholder="cummins-A0-oil-pressure-low"
              :disabled="editingIndex !== null"
            />
          </div>
          <div class="col-md-6">
            <label>inferenceId <span class="text-danger">*</span></label>
            <base-input v-model="ruleDraft.inferenceId" placeholder="A0" />
          </div>
        </div>

        <div class="row">
          <div class="col-md-4">
            <label>cooldownSec</label>
            <base-input v-model.number="ruleDraft.cooldownSec" type="number" />
          </div>
          <div class="col-md-4" v-if="ruleDraft.type === 'cross'">
            <label>graceSec</label>
            <base-input v-model.number="ruleDraft.graceSec" type="number" />
          </div>
        </div>

        <!-- typecross → CrossExprNode -->
        <div v-if="ruleDraft.type === 'cross'" class="mt-3">
          <h5>Condición combinada entre equipos</h5>
          <p class="text-muted small">
            Armá grupos "TODAS estas condiciones" (AND) o "CUALQUIERA de
            estas condiciones" (OR), con condiciones sobre variables de
            cualquier equipo del sitio. Límite de anidamiento: 8 niveles
            (validateCrossTree en el backend). También podés sumar una
            variable entre equipos del mismo tipo ("Agregar suma").
          </p>
          <cross-expr-node
            v-if="ruleDraft.crossExpr"
            :value="ruleDraft.crossExpr"
            :depth="0"
            :max-depth="8"
            :is-root="true"
            @input="ruleDraft.crossExpr = $event"
          />
        </div>

        <!-- typeC → setpointSource + flags EDGE-2 + condition (DEC-REF-66.a) -->
        <div v-if="ruleDraft.type === 'C' && ruleDraft.setpointSource && ruleDraft.condition" class="mt-3">
          <h5>Autocalibrado (typeC)</h5>
          <div class="row">
            <div class="col-md-6">
              <label>setpointSource.variable <span class="text-danger">*</span></label>
              <base-input
                v-model="ruleDraft.setpointSource.variable"
                placeholder="key de siteState, ej: setpoint_oil_pressure"
              />
            </div>
            <div class="col-md-3">
              <label>fallbackToD</label>
              <div>
                <base-checkbox v-model="ruleDraft.fallbackToD">
                  Fallback a umbral fijo si falta setpoint
                </base-checkbox>
              </div>
            </div>
            <div class="col-md-3">
              <label>on_missing_ref</label>
              <select v-model="ruleDraft.on_missing_ref" class="form-control">
                <option value="ignore">ignore</option>
                <option value="alarm">alarm</option>
              </select>
            </div>
          </div>

          <p class="text-muted small mt-3 mb-2">
            Umbral de respaldo — lo exige el backend si Fallback está activo o al faltar referencia se alarma.
          </p>
          <div class="row">
            <div class="col-md-4">
              <label>condition.op</label>
              <select
                class="form-control"
                :value="(ruleDraft.condition || {}).op || 'gt'"
                @change="setConditionField('op', $event.target.value)"
              >
                <option value="lt">lt</option>
                <option value="lte">lte</option>
                <option value="gt">gt</option>
                <option value="gte">gte</option>
                <option value="eq">eq</option>
                <option value="neq">neq</option>
              </select>
            </div>
            <div class="col-md-4">
              <label>condition.value</label>
              <base-input
                type="number"
                :value="(ruleDraft.condition || {}).value !== undefined ? ruleDraft.condition.value : ''"
                @input="setConditionField('value', numericOrRaw($event))"
              />
            </div>
            <div class="col-md-4">
              <label
                title="Minutos consecutivos sin setpoint antes de escalar el aviso de configuración de INFO a ATENCIÓN. Escala la notificación de 'falta referencia', no la alarma operativa del equipo. Vacío = escalada desactivada."
              >
                escalateAfterMinutes
                <i class="tim-icons icon-alert-circle-exc"></i>
              </label>
              <base-input
                type="number"
                placeholder="vacío = desactivado"
                :value="ruleDraft.escalateAfterMinutes !== null && ruleDraft.escalateAfterMinutes !== undefined ? ruleDraft.escalateAfterMinutes : ''"
                @input="setEscalateAfterMinutes($event)"
              />
            </div>
          </div>
        </div>

        <!-- typeS → window (durationSec, countThreshold, matchCondition) (DEC-REF-66.b) -->
        <div v-if="ruleDraft.type === 'S' && ruleDraft.window" class="mt-3">
          <h5>Ventana (typeS)</h5>
          <div class="row">
            <div class="col-md-4">
              <label>window.durationSec <span class="text-danger">*</span></label>
              <base-input
                type="number"
                v-model.number="ruleDraft.window.durationSec"
              />
            </div>
            <div class="col-md-4">
              <label>window.countThreshold <span class="text-danger">*</span></label>
              <base-input
                type="number"
                v-model.number="ruleDraft.window.countThreshold"
              />
            </div>
          </div>

          <h6 class="mt-3">matchCondition</h6>
          <div class="row">
            <div class="col-md-4">
              <label>op</label>
              <select
                class="form-control"
                :value="((ruleDraft.window || {}).matchCondition || {}).op || 'gt'"
                @change="setWindowConditionField('op', $event.target.value)"
              >
                <option value="lt">lt</option>
                <option value="lte">lte</option>
                <option value="gt">gt</option>
                <option value="gte">gte</option>
                <option value="eq">eq</option>
                <option value="neq">neq</option>
              </select>
            </div>
            <div class="col-md-4">
              <label>value</label>
              <base-input
                type="number"
                :value="(((ruleDraft.window || {}).matchCondition || {}).value !== undefined ? ruleDraft.window.matchCondition.value : '')"
                @input="setWindowConditionField('value', numericOrRaw($event))"
              />
            </div>
          </div>
        </div>
        </div><!-- /adv-body -->

      </template>

      <div slot="footer">
        <base-button type="secondary" @click="closeRuleModal">Cancelar</base-button>
        <base-button
          type="primary"
          @click="submitRule"
          :disabled="saving || !isRuleReady"
        >
          {{ saving ? 'Guardando...' : (editingIndex !== null ? 'Guardar cambios' : 'Agregar regla') }}
        </base-button>
      </div>
    </el-dialog>

    <!-- WIZARD guiado · DEC-REF-100 D-7 (F6) — alta/edición de reglas de
         umbral (type D) en 4 pasos de lenguaje de usuario. ruleId e
         inferenceId se autogeneran y no se muestran. Lo que el wizard no
         cubre (C/S/cross, tiempos finos) va por "Opciones avanzadas",
         que abre el formulario clásico con lo ya cargado. -->
    <el-dialog
      :title="wizEditingIndex !== null ? 'Editar regla' : 'Nueva regla'"
      :visible.sync="wizardOpen"
      width="640px"
      :close-on-click-modal="false"
    >
      <div class="wiz-steps mb-4">
        <span
          v-for="(name, i) in wizStepNames"
          :key="i"
          class="wiz-step"
          :class="{ active: wizardStep === i + 1, done: wizardStep > i + 1 }"
        >
          {{ i + 1 }}. {{ name }}
        </span>
      </div>

      <!-- Paso 1 · equipo -->
      <div v-if="wizardStep === 1">
        <h5>¿Sobre qué equipo es la regla?</h5>
        <el-select
          v-model="wiz.deviceType"
          class="select-primary"
          style="width:100%"
          filterable
          :disabled="sheets.length === 0"
        >
          <el-option
            v-for="s in sheets"
            :key="s.deviceType"
            :label="s.manufacturer ? `${s.deviceType} — ${s.manufacturer} ${s.model || ''}`.trim() : s.deviceType"
            :value="s.deviceType"
          />
        </el-select>
        <small class="text-muted">
          Por defecto es el equipo del pack; podés elegir otro si la regla vigila un equipo distinto.
        </small>
      </div>

      <!-- Paso 2 · variable -->
      <div v-if="wizardStep === 2">
        <h5>¿Qué variable querés vigilar?</h5>
        <el-select
          v-if="wizVariables.length > 0"
          v-model="wiz.variable"
          class="select-primary"
          style="width:100%"
          filterable
          placeholder="Elegir variable"
        >
          <el-option
            v-for="v in wizVariables"
            :key="v.name"
            :label="v.label ? `${v.label} (${v.name})` : v.name"
            :value="v.name"
          />
        </el-select>
        <base-input v-else v-model="wiz.variable" placeholder="ej: fuel_level" />
        <small v-if="wiz.deviceType && wizVariables.length === 0" class="text-warning">
          La ficha {{ wiz.deviceType }} no declara variables — texto libre.
        </small>
      </div>

      <!-- Paso 3 · condición en lenguaje natural -->
      <div v-if="wizardStep === 3">
        <h5>¿Cuándo debe avisar?</h5>
        <div class="wiz-sentence">
          <span>Avisame cuando</span>
          <strong>{{ wizVariableLabel }}</strong>
          <span>esté</span>
          <el-select v-model="wiz.op" class="select-primary wiz-op">
            <el-option v-for="op in WIZ_OPS" :key="op" :value="op" :label="OPERATOR_LABELS[op]" />
          </el-select>
          <input v-model.number="wiz.value" type="number" class="form-control wiz-value" />
          <span v-if="wizVariableUnit">{{ wizVariableUnit }}</span>
        </div>
        <small class="text-muted">
          Ejemplo: "Avisame cuando Nivel de combustible esté menor que 30 %".
        </small>
      </div>

      <!-- Paso 4 · aviso -->
      <div v-if="wizardStep === 4">
        <h5>¿Cómo te avisamos?</h5>
        <base-input v-model="wiz.label" label="Nombre de la regla" placeholder="ej: Combustible bajo" />

        <label class="mt-3 d-block">Importancia</label>
        <div class="wiz-severities">
          <label
            v-for="opt in WIZ_SEVERITIES"
            :key="opt.value"
            class="wiz-sev"
            :class="{ active: wiz.severity === opt.value }"
          >
            <input type="radio" v-model="wiz.severity" :value="opt.value" />
            <span class="badge" :class="severityBadge(opt.value)">{{ opt.label }}</span>
            <small class="d-block text-muted mt-1">{{ opt.help }}</small>
          </label>
        </div>

        <label class="mt-3 d-block">Recomendación — qué hacer cuando dispara (opcional)</label>
        <textarea
          v-model="wiz.recommendation"
          class="form-control"
          rows="2"
          placeholder="ej: Coordinar recarga de combustible con el proveedor"
        ></textarea>
      </div>

      <div slot="footer">
        <base-button type="link" @click="wizardToAdvanced">
          <i class="tim-icons icon-settings"></i> Opciones avanzadas
        </base-button>
        <base-button type="secondary" :disabled="wizardStep === 1" @click="wizardStep--">
          Atrás
        </base-button>
        <base-button
          v-if="wizardStep < 4"
          type="primary"
          :disabled="!wizStepReady"
          @click="wizardStep++"
        >
          Siguiente
        </base-button>
        <base-button
          v-else
          type="primary"
          :disabled="!wizStepReady || saving"
          @click="submitWizard"
        >
          {{ saving ? 'Guardando...' : (wizEditingIndex !== null ? 'Guardar cambios' : 'Crear regla') }}
        </base-button>
      </div>
    </el-dialog>

    <!-- MODAL: borrar regla (confirmación simple, sin fricción de escritura —
         menor riesgo que borrar pack porque son parte del mismo pack que
         el usuario ya sabe que está editando). -->
    <el-dialog
      title="Borrar regla"
      :visible.sync="deleteRuleModal"
      width="400px"
      :close-on-click-modal="false"
    >
      <p v-if="deleteRuleTargetRuleId">
        Borrar regla <code>{{ deleteRuleTargetRuleId }}</code> del pack
        <code>{{ packId }}</code>? El motor edge recargará al guardar.
      </p>
      <div slot="footer">
        <base-button type="secondary" @click="deleteRuleModal = false">Cancelar</base-button>
        <base-button
          type="danger"
          @click="confirmDeleteRule"
          :disabled="saving"
        >
          {{ saving ? 'Guardando...' : 'Borrar regla' }}
        </base-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import CrossExprNode, { stripEditorKeys } from '@/components/CrossExprNode.vue';

// DEC-REF-100 D-7 (F6) — capa de presentación del wizard: mismos labels que
// OPERATOR_LABELS del backend (api/models/rule_definition.js — la identidad
// interna lt/gt/... NO se toca; esto es solo idioma de usuario, mismo
// criterio que fichas.vue).
const OPERATOR_LABELS = {
  gt: 'mayor que', gte: 'mayor o igual que',
  lt: 'menor que', lte: 'menor o igual que',
  eq: 'igual a',   neq: 'distinto de',
};
const WIZ_OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];
const WIZ_SEVERITIES = [
  { value: 'info',     label: 'Informativa', help: 'Queda registrada, sin urgencia' },
  { value: 'warning',  label: 'Atención',    help: 'Hay que revisarlo pronto' },
  { value: 'critical', label: 'Crítica',     help: 'Requiere acción inmediata' },
];
const WIZ_STEP_NAMES = ['Equipo', 'Variable', 'Condición', 'Aviso'];

// SF-5 Capa 3 · DEC-REF-62.d/e + DEC-REF-62-A — edición de reglas del
// pack + revalidación /me al mount (esta página gana superficie de
// escritura, por lo que adopta la misma revalidación fresca que el
// índice — DEC-REF-62-A).
//
// Guardado: el pack COMPLETO viaja por PUT canónico (SF-1 escribe pack
// entero, coherente). Version se auto-incrementa client-side en cada
// save de reglas — patrón "el pack cambió → version sube", cero
// fricción para el usuario, el número refleja cuántas ediciones tuvo.
// Los seeds hardcodean version manualmente; acá se automatiza porque
// no hay operador humano midiendo bumps.
//
// Types D y cross: edición completa. Types C y S: read-only con nota
// visible — el schema requiere config específica (setpointSource
// completo con register/scale/variable + flags EDGE-2 para C; window
// con durationSec/countThreshold/matchCondition para S) que amerita
// mini-forms propios; se defiere a roadmap futuro. Registrado como
// decisión tomada, no silenciado.
//
// S6 (#70) — los campos deviceType y variable de la regla dejan de ser
// texto libre: deviceType es selector de fichas (DEC-REF-91 adenda #60)
// y variable es selector estricto de las variables declaradas por la
// ficha elegida, con fallback a texto libre cuando la ficha no declara
// variables (decisión Franco, espejo del criterio de warnings del
// backend). CrossExprNode sigue fuera de la rebanada (alcance -91).

export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'rulepacks-detail',
  components: { CrossExprNode },
  data() {
    return {
      loading: true,
      pack: null,
      // Form modal
      ruleModal: false,
      ruleDraft: null,      // regla que se está editando/creando
      editingIndex: null,   // null = new, número = índice de la regla en pack.rules
      saving: false,
      // Delete rule modal
      deleteRuleModal: false,
      deleteRuleTargetIndex: null,
      // DEC-REF-100 D-7 (F7): sección "Opciones avanzadas" del formulario
      // clásico. Cerrada por default; se abre sola para C/S/cross (su
      // configuración vive adentro) o al venir del wizard.
      advancedOpen: false,
      // SF-7 parte 2 · DEC-REF-66 — warnings no bloqueantes que el
      // backend devuelve en el 200 del PUT (validateC ADVERTENCIAS de
      // config semánticamente muerta). Se muestran como banner ámbar
      // in-form; no bloquean el save.
      saveWarnings: [],
      // S6 — catálogo de fichas (lectura global D-1) para los selectores
      // de deviceType y variable del editor de reglas. Misma fuente que
      // el selector de pack (index.vue, S5).
      sheets: [],
      // DEC-REF-100 D-7 (F6) — wizard guiado de reglas type D.
      OPERATOR_LABELS,
      WIZ_OPS,
      WIZ_SEVERITIES,
      wizStepNames: WIZ_STEP_NAMES,
      wizardOpen: false,
      wizardStep: 1,
      wizEditingIndex: null, // null = alta; número = edición de regla type D
      wiz: {
        deviceType: '',
        variable: '',
        op: 'lt',
        value: '',
        severity: 'warning',
        recommendation: '',
        label: ''
      }
    };
  },
  computed: {
    packId() {
      return this.$route.params.packId;
    },
    ruleModalTitle() {
      // DEC-REF-100 D-7 (F7): el formulario clásico es el modo avanzado.
      if (this.editingIndex !== null) return 'Editar regla (modo avanzado)';
      return 'Nueva regla (modo avanzado)';
    },
    deleteRuleTargetRuleId() {
      if (this.deleteRuleTargetIndex === null || !this.pack) return '';
      const r = this.pack.rules[this.deleteRuleTargetIndex];
      return r ? r.ruleId : '';
    },
    // S6 — índice de fichas por deviceType para el editor de reglas.
    sheetByType() {
      const m = {};
      for (const s of this.sheets) m[s.deviceType] = s;
      return m;
    },
    // Ficha del deviceType elegido EN LA REGLA (no necesariamente la del
    // pack: una regla cross puede apuntar a otro equipo del sitio).
    ruleSheet() {
      if (!this.ruleDraft) return null;
      return this.sheetByType[this.ruleDraft.deviceType] || null;
    },
    // Variables declaradas por esa ficha. Vacío ⇒ el editor cae a texto
    // libre (una ficha con variables:[] no tiene contra qué validar —
    // mismo criterio que los warnings del backend, rulepacks.js).
    draftVariables() {
      return (this.ruleSheet && this.ruleSheet.variables) || [];
    },
    // DEC-REF-100 D-7 (F6) — computeds del wizard (espejo de ruleSheet/
    // draftVariables pero sobre wiz.deviceType).
    wizSheet() {
      return this.sheetByType[this.wiz.deviceType] || null;
    },
    wizVariables() {
      return (this.wizSheet && this.wizSheet.variables) || [];
    },
    wizVariableLabel() {
      const v = this.wizVariables.find(x => x.name === this.wiz.variable);
      return (v && v.label) || this.wiz.variable || 'la variable';
    },
    wizVariableUnit() {
      const v = this.wizVariables.find(x => x.name === this.wiz.variable);
      return (v && v.unit) || '';
    },
    wizStepReady() {
      if (this.wizardStep === 1) return !!this.wiz.deviceType;
      if (this.wizardStep === 2) return !!this.wiz.variable;
      if (this.wizardStep === 3) {
        return this.wiz.value !== '' && this.wiz.value !== null &&
               this.wiz.value !== undefined && Number.isFinite(Number(this.wiz.value));
      }
      return !!this.wiz.label;
    },
    isRuleReady() {
      const r = this.ruleDraft;
      if (!r) return false;
      // Comunes obligatorios
      if (!r.ruleId || !r.label || !r.inferenceId) return false;
      if (!r.deviceType || !r.variable) return false;
      if (!r.severity || !r.type) return false;
      // typeD requiere condition.op y condition.value
      if (r.type === 'D') {
        if (!r.condition || !r.condition.op) return false;
        if (r.condition.value === '' || r.condition.value === null || r.condition.value === undefined) return false;
      }
      // typecross requiere crossExpr con forma mínima
      if (r.type === 'cross') {
        if (!r.crossExpr) return false;
      }
      // SF-7 parte 2 · DEC-REF-66.a — typeC: mínimos no-vacíos (setpointSource
      // existe + condition.op presente). La validación real la hace validateC
      // en el backend con warnings (DEC-REF-66-C: no clonar el contrato).
      if (r.type === 'C') {
        if (!r.setpointSource) return false;
        if (!r.condition || !r.condition.op) return false;
      }
      // SF-7 parte 2 · DEC-REF-66.b — typeS: window.durationSec > 0,
      // countThreshold >= 1, matchCondition.op presente.
      if (r.type === 'S') {
        if (!r.window) return false;
        if (!(r.window.durationSec > 0)) return false;
        if (!(r.window.countThreshold >= 1)) return false;
        if (!r.window.matchCondition || !r.window.matchCondition.op) return false;
      }
      return true;
    }
  },
  async mounted() {
    // DEC-REF-62-A — revalidación al mount también en el detalle
    // (adoptada al ganar la Capa 3 el editor).
    const ok = await this.revalidateSuperadmin();
    if (!ok) return;
    await this.loadPack();
    this.loadSheets();
  },
  methods: {
    // S6 — catálogo de fichas para los selectores del editor. Lectura
    // global (D-1). Si falla, deviceType queda deshabilitado y variable
    // cae a texto libre (draftVariables = []), con aviso visible.
    async loadSheets() {
      try {
        const res = await this.$axios.get('/equipmentsheet', {
          headers: { token: this.$store.state.auth.token }
        });
        this.sheets = res.data?.data || [];
      } catch (e) {
        this.sheets = [];
        this.$notify({
          type: 'warning',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error cargando fichas de equipo'
        });
      }
    },
    async revalidateSuperadmin() {
      try {
        const res = await this.$axios.get('/me', {
          headers: { token: this.$store.state.auth.token }
        });
        const grants = res.data?.data?.grants || [];
        const stillSuperadmin = grants.some(g => g.role === 'superadmin');
        if (!stillSuperadmin) {
          this.$notify({
            type: 'warning',
            icon: 'tim-icons icon-alert-circle-exc',
            message: 'Rol superadmin revocado. Redirigiendo al dashboard.'
          });
          this.$router.push('/dashboard');
          return false;
        }
        return true;
      } catch (e) {
        this.$router.push('/login');
        return false;
      }
    },
    async loadPack() {
      this.loading = true;
      try {
        const res = await this.$axios.get(
          `/rulepacks/${encodeURIComponent(this.packId)}`,
          { headers: { token: this.$store.state.auth.token } }
        );
        this.pack = res.data?.data || null;
      } catch (e) {
        const status = e.response?.status;
        const msg = e.response?.data?.error || 'Error cargando pack';
        this.$notify({
          type: status === 404 ? 'warning' : 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: msg
        });
        this.$router.push('/rulepacks');
      } finally {
        this.loading = false;
      }
    },
    goBack() {
      this.$router.push('/rulepacks');
    },
    formatDate(value) {
      if (!value) return '';
      const d = new Date(value);
      return d.toLocaleString();
    },
    severityBadge(sev) {
      if (sev === 'critical') return 'badge-danger';
      if (sev === 'warning')  return 'badge-warning';
      return 'badge-info';
    },
    // DEC-REF-100 D-7 (F6) — la regla contada en lenguaje de usuario para
    // la tabla legible.
    ruleSentence(r) {
      const varName = r.variableLabel || r.variable || '';
      const unit = r.unit ? ` ${r.unit}` : '';
      if (r.type === 'D' && r.condition) {
        return `${varName} ${OPERATOR_LABELS[r.condition.op] || r.condition.op} ${r.condition.value}${unit}`;
      }
      if (r.type === 'C' && r.setpointSource) {
        return `${varName} contra el setpoint real del equipo (${r.setpointSource.variable || 'auto'})`;
      }
      if (r.type === 'S' && r.window) {
        const mc = r.window.matchCondition;
        const cond = mc ? ` ${OPERATOR_LABELS[mc.op] || mc.op} ${mc.value}${unit}` : '';
        return `${varName}${cond}, ${r.window.countThreshold} veces en ${Math.round((r.window.durationSec || 0) / 60)} min`;
      }
      if (r.type === 'cross') return 'condición combinada entre equipos';
      return varName;
    },
    // ── Wizard guiado (DEC-REF-100 D-7 · F6) ───────────────────────────
    openWizardNew() {
      this.wizEditingIndex = null;
      this.wiz = {
        deviceType: this.pack ? this.pack.deviceType : '',
        variable: '',
        op: 'lt',
        value: '',
        severity: 'warning',
        recommendation: '',
        label: ''
      };
      this.wizardStep = 1;
      this.wizardOpen = true;
    },
    openWizardEdit(index) {
      const r = this.pack.rules[index];
      this.wizEditingIndex = index;
      this.wiz = {
        deviceType: r.deviceType,
        variable: r.variable,
        op: (r.condition && r.condition.op) || 'gt',
        value: r.condition && r.condition.value !== undefined ? r.condition.value : '',
        severity: r.severity || 'warning',
        recommendation: r.recommendation || '',
        label: r.label || ''
      };
      this.wizardStep = 1;
      this.wizardOpen = true;
    },
    slugifyText(s) {
      return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 40) || 'regla';
    },
    // ruleId autogenerado y oculto al usuario: deviceType + slug del label,
    // con sufijo numérico si ya existe en el pack (excluyendo la regla en
    // edición).
    genRuleId() {
      const base = `${this.wiz.deviceType}-${this.slugifyText(this.wiz.label)}`;
      const taken = new Set((this.pack.rules || [])
        .filter((_, i) => i !== this.wizEditingIndex)
        .map(r => r.ruleId));
      let id = base;
      let n = 2;
      while (taken.has(id)) { id = `${base}-${n}`; n++; }
      return id;
    },
    // inferenceId autogenerado: código corto derivado del label.
    genInferenceId() {
      const base = this.slugifyText(this.wiz.label).replace(/-/g, '_').toUpperCase().slice(0, 20) || 'REGLA';
      const taken = new Set((this.pack.rules || [])
        .filter((_, i) => i !== this.wizEditingIndex)
        .map(r => r.inferenceId));
      let id = base;
      let n = 2;
      while (taken.has(id)) { id = `${base}_${n}`; n++; }
      return id;
    },
    buildRuleFromWizard() {
      const existing = this.wizEditingIndex !== null ? this.pack.rules[this.wizEditingIndex] : null;
      const v = this.wizVariables.find(x => x.name === this.wiz.variable);
      const rule = {
        ruleId: existing ? existing.ruleId : this.genRuleId(),
        label: this.wiz.label,
        variableLabel: (v && v.label) || (existing && existing.variableLabel) || '',
        inferenceId: existing ? existing.inferenceId : this.genInferenceId(),
        type: 'D',
        severity: this.wiz.severity,
        recommendation: this.wiz.recommendation || '',
        deviceType: this.wiz.deviceType,
        variable: this.wiz.variable,
        cooldownSec: existing && existing.cooldownSec ? existing.cooldownSec : 300,
        condition: { op: this.wiz.op, value: this.wiz.value === '' ? 0 : Number(this.wiz.value) },
        crossExpr: null
      };
      if ((v && v.unit) || (existing && existing.unit)) rule.unit = (v && v.unit) || existing.unit;
      return rule;
    },
    async submitWizard() {
      if (!this.wizStepReady) return;
      this.ruleDraft = this.buildRuleFromWizard();
      this.editingIndex = this.wizEditingIndex;
      this.wizardOpen = false;
      // Reusa el camino canónico: limpieza por type + savePack con bump
      // de version + recarga del edge (submitRule ya lo hace).
      await this.submitRule();
    },
    // Deriva al formulario clásico conservando lo cargado en el wizard
    // (F7: ahí viven C/S/cross, tiempos y resto de parámetros).
    wizardToAdvanced() {
      this.ruleDraft = this.buildRuleFromWizard();
      this.editingIndex = this.wizEditingIndex;
      this.wizardOpen = false;
      this.ensureShapeForType('D');
      this.advancedOpen = true; // pidió opciones avanzadas: se las muestro
      this.ruleModal = true;
    },
    isEditableType(t) {
      return t === 'D' || t === 'cross';
    },
    numericOrRaw(v) {
      if (v === '' || v === null || v === undefined) return '';
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    },
    emptyRule() {
      return {
        ruleId: '',
        label: '',
        inferenceId: '',
        type: 'D',
        severity: 'warning',
        deviceType: this.pack ? this.pack.deviceType : '',
        variable: '',
        cooldownSec: 300,
        graceSec: 0,
        condition: { op: 'gt', value: 0 },
        crossExpr: null
      };
    },
    openNewRule() {
      this.editingIndex = null;
      this.ruleDraft = this.emptyRule();
      this.advancedOpen = false;
      this.ruleModal = true;
    },
    openEditRule(index) {
      // DEC-REF-100 D-7 (F6): las reglas de umbral (type D) se editan en el
      // wizard guiado; C/S/cross van directo al formulario avanzado.
      if (this.pack.rules[index] && this.pack.rules[index].type === 'D') {
        this.openWizardEdit(index);
        return;
      }
      this.editingIndex = index;
      // Copia profunda para no mutar la fuente hasta guardar.
      const original = this.pack.rules[index];
      const copy = JSON.parse(JSON.stringify(original));
      this.ruleDraft = copy;
      // Asegurar shape para types editables (D/cross intactos + C/S nuevos).
      // ensureShapeForType usa this.$set porque en Vue 2 los sub-objetos
      // agregados post-data() no son reactivos sin él.
      if (copy.type === 'D' && !copy.condition) {
        this.$set(this.ruleDraft, 'condition', { op: 'gt', value: 0 });
      }
      if (copy.type === 'cross' && !copy.crossExpr) {
        this.$set(this.ruleDraft, 'crossExpr', { op: 'AND', children: [] });
      }
      this.ensureShapeForType(copy.type);
      // C/S/cross configuran en la sección avanzada: se abre sola (F7).
      this.advancedOpen = copy.type !== 'D';
      this.ruleModal = true;
    },
    closeRuleModal() {
      this.ruleModal = false;
      this.ruleDraft = null;
      this.editingIndex = null;
    },
    // SF-7 parte 2 · DEC-REF-66.a/.b — asegura los sub-objetos que los
    // mini-forms C y S bindean. $set obligatorio en Vue 2 (los campos
    // agregados post-creación no son reactivos sin él). No pisa valores
    // existentes: solo inicializa si el sub-objeto/flag falta.
    ensureShapeForType(type) {
      const r = this.ruleDraft;
      if (!r) return;
      if (type === 'C') {
        if (!r.setpointSource) this.$set(r, 'setpointSource', { variable: '' });
        if (r.fallbackToD === undefined) this.$set(r, 'fallbackToD', true);
        if (!r.on_missing_ref) this.$set(r, 'on_missing_ref', 'ignore');
        if (r.escalateAfterMinutes === undefined) this.$set(r, 'escalateAfterMinutes', null);
        if (!r.condition) this.$set(r, 'condition', { op: 'gt', value: 0 });
      }
      if (type === 'S') {
        if (!r.window) {
          this.$set(r, 'window', { durationSec: 60, countThreshold: 1, matchCondition: { op: 'gt', value: 0 } });
        } else if (!r.window.matchCondition) {
          this.$set(r.window, 'matchCondition', { op: 'gt', value: 0 });
        }
      }
    },
    setConditionField(field, value) {
      const cond = { ...(this.ruleDraft.condition || {}), [field]: value };
      this.$set(this.ruleDraft, 'condition', cond);
    },
    // SF-7 parte 2 · DEC-REF-66.b — espejo de setConditionField pero
    // sobre el path window.matchCondition. $set garantiza reactividad si
    // window o matchCondition faltaran (defensivo — normalmente
    // ensureShapeForType('S') ya los inicializó).
    setWindowConditionField(field, value) {
      if (!this.ruleDraft.window) {
        this.$set(this.ruleDraft, 'window', { durationSec: 0, countThreshold: 0, matchCondition: { op: 'gt', value: 0 } });
      }
      const mc = { ...(this.ruleDraft.window.matchCondition || {}), [field]: value };
      this.$set(this.ruleDraft.window, 'matchCondition', mc);
    },
    // Helper para escalateAfterMinutes: '' o valor no numérico → null
    // (schema default es null; opt-in EDGE-2 requiere número > 0).
    setEscalateAfterMinutes(value) {
      if (value === '' || value === null || value === undefined) {
        this.$set(this.ruleDraft, 'escalateAfterMinutes', null);
        return;
      }
      const n = Number(value);
      this.$set(this.ruleDraft, 'escalateAfterMinutes', Number.isFinite(n) ? n : null);
    },
    // Cuando el usuario cambia type, ajustar shape.
    // Watchers Vue no juegan bien con select v-model (Vue actualiza
    // antes de reactivar), así que hago la lógica en watch.
    async submitRule() {
      if (!this.isRuleReady) return;
      this.saving = true;
      try {
        // Preparar la regla final: strip de crossExpr keys si es cross,
        // limpiar campos irrelevantes según type.
        const finalRule = JSON.parse(JSON.stringify(this.ruleDraft));
        if (finalRule.type === 'D') {
          finalRule.crossExpr = null;
          delete finalRule.graceSec;
        } else if (finalRule.type === 'cross') {
          finalRule.crossExpr = stripEditorKeys(finalRule.crossExpr);
          finalRule.condition = null;
        }

        // Construir el pack nuevo (immutable): bump de version + rules
        // con la modificada.
        const nextRules = (this.pack.rules || []).slice();
        if (this.editingIndex !== null) {
          nextRules[this.editingIndex] = finalRule;
        } else {
          nextRules.push(finalRule);
        }
        await this.savePack(nextRules, this.editingIndex !== null ? 'edit' : 'add');
        this.closeRuleModal();
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error guardando regla'
        });
      } finally {
        this.saving = false;
      }
    },
    openDeleteRule(index) {
      this.deleteRuleTargetIndex = index;
      this.deleteRuleModal = true;
    },
    async confirmDeleteRule() {
      if (this.deleteRuleTargetIndex === null) return;
      this.saving = true;
      try {
        const nextRules = this.pack.rules.slice();
        nextRules.splice(this.deleteRuleTargetIndex, 1);
        await this.savePack(nextRules, 'delete');
        this.deleteRuleModal = false;
        this.deleteRuleTargetIndex = null;
      } catch (e) {
        this.$notify({
          type: 'danger',
          icon: 'tim-icons icon-alert-circle-exc',
          message: e.response?.data?.error || 'Error borrando regla'
        });
      } finally {
        this.saving = false;
      }
    },
    async savePack(nextRules, actionLabel) {
      // Version auto-incrementada: cada save de reglas bumpea el
      // contador. Coherente con "el pack cambió → version sube".
      const nextVersion = (this.pack.version || 1) + 1;
      const packBody = {
        packId: this.packId,
        deviceType: this.pack.deviceType,
        version: nextVersion,
        description: this.pack.description || '',
        canary: !!this.pack.canary,
        rules: nextRules
      };
      const res = await this.$axios.put(
        `/rulepacks/${encodeURIComponent(this.packId)}`,
        { rulepack: packBody },
        { headers: { token: this.$store.state.auth.token } }
      );
      // SF-7 parte 2 · DEC-REF-66 — warnings del validator viajan en el 200.
      // Se pintan como banner ámbar in-form; no bloquean el save (el pack
      // ya está guardado en Mongo y el edge recargó).
      this.saveWarnings = (res.data && res.data.warnings) || [];
      const msgs = {
        add: 'Regla agregada',
        edit: 'Regla actualizada',
        delete: 'Regla borrada'
      };
      this.$notify({
        type: 'success',
        icon: 'tim-icons icon-check-2',
        message: `${msgs[actionLabel]} (v${res.data.version}). El motor edge recargó (SF-3).`
      });
      // Refrescar el pack desde el server.
      await this.loadPack();
    }
  },
  watch: {
    // S6 — al cambiar el deviceType de la regla, la variable elegida puede
    // quedar fuera de la ficha nueva: se resetea SOLO si la ficha nueva
    // declara variables y la actual no está entre ellas (si no declara,
    // el campo es texto libre y cualquier valor es válido). El guard de
    // oldType evita disparar en la apertura del modal (draft null→objeto).
    'ruleDraft.deviceType'(newType, oldType) {
      if (!this.ruleDraft || newType === oldType) return;
      if (oldType === undefined || oldType === '') return;
      const vars = this.draftVariables;
      if (vars.length > 0 && !vars.some(v => v.name === this.ruleDraft.variable)) {
        this.ruleDraft.variable = '';
      }
    },
    // DEC-REF-100 D-7 (F6) — mismo reset de variable pero sobre el wizard.
    'wiz.deviceType'(newType, oldType) {
      if (!this.wiz || newType === oldType) return;
      if (oldType === undefined || oldType === '') return;
      const vars = this.wizVariables;
      if (vars.length > 0 && !vars.some(v => v.name === this.wiz.variable)) {
        this.wiz.variable = '';
      }
    },
    // Cuando el usuario cambia type en el form, ajustar shape del
    // draft para que los inputs relevantes tengan defaults.
    'ruleDraft.type'(newType, oldType) {
      if (!this.ruleDraft || newType === oldType) return;
      if (newType === 'D' && !this.ruleDraft.condition) {
        this.$set(this.ruleDraft, 'condition', { op: 'gt', value: 0 });
      }
      if (newType === 'cross' && !this.ruleDraft.crossExpr) {
        this.$set(this.ruleDraft, 'crossExpr', { op: 'AND', children: [] });
      }
      // SF-7 parte 2 · DEC-REF-66.a/.b — asegurar shape de C y S al
      // cambiar de tipo (no pisa valores existentes; solo inicializa
      // sub-objetos si faltan).
      if (newType === 'C' || newType === 'S') {
        this.ensureShapeForType(newType);
      }
      // F7: la configuración de C/S/cross vive en la sección avanzada —
      // se abre sola para que el usuario no se quede mirando un form
      // vacío tras elegir el tipo.
      if (newType !== 'D') this.advancedOpen = true;
    }
  }
};
</script>

<style>
/* DEC-REF-100 D-7 (F6) — estilos del wizard guiado. No-scoped porque
   el-dialog teletransporta el contenido al body (scoped no aplicaría). */
.wiz-steps {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wiz-step {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #9a9a9a;
}
.wiz-step.active {
  background: #e14eca;
  color: #fff;
}
.wiz-step.done {
  background: rgba(0, 210, 130, 0.2);
  color: #00d69a;
}
.wiz-sentence {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 15px;
  padding: 14px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
}
.wiz-sentence .wiz-op {
  width: 190px;
}
.wiz-sentence .wiz-value {
  width: 110px;
  display: inline-block;
}
.wiz-severities {
  display: flex;
  gap: 12px;
}
.wiz-sev {
  flex: 1;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
}
.wiz-sev.active {
  border-color: #e14eca;
  background: rgba(225, 78, 202, 0.08);
}
.wiz-sev input[type="radio"] {
  display: none;
}
/* F7 — sección "Opciones avanzadas" del formulario clásico de reglas */
.adv-toggle {
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  padding: 8px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.adv-toggle i {
  margin-right: 8px;
}
.adv-body {
  padding: 6px 4px 0;
  border-left: 2px solid rgba(225, 78, 202, 0.35);
  margin-left: 4px;
  padding-left: 14px;
}
</style>
