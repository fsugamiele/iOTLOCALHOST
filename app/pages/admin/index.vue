<template>
  <div>
    <!-- CONSOLA DE ADMINISTRACIÓN (DEC-REF-97 D-2) — superadmin only.
         Usuarios + Operadores + Zonas. El alta pública /register quedó
         cerrada en #72: todo nace acá. -->
    <div class="row">
      <div class="col-12">
        <h2 class="title">
          Administración
          <small class="text-muted ml-2">— usuarios, operadores y zonas</small>
        </h2>
      </div>
    </div>

    <div class="row">
      <div class="col-12">
        <card>
          <el-tabs v-model="activeTab">

            <!-- ══════════ USUARIOS ══════════ -->
            <el-tab-pane label="Usuarios" name="users">
              <div style="display:flex; justify-content:flex-end; margin-bottom:12px">
                <base-button type="primary" size="sm" @click="openUserCreate">
                  <i class="fa fa-plus" style="margin-right:6px"></i>Nuevo usuario
                </base-button>
              </div>

              <el-table :data="users" size="small">
                <el-table-column prop="name" label="Nombre" min-width="130" />
                <el-table-column prop="email" label="Email" min-width="180" />
                <el-table-column label="Grants" min-width="220">
                  <template slot-scope="{ row }">
                    <div v-if="(row.grants || []).length">
                      <div v-for="(g, i) in row.grants" :key="i" style="font-size:12px; margin-bottom:2px">
                        <b>{{ g.role }}</b>
                        <span v-if="g.scope && Object.keys(g.scope).length" class="text-muted">
                          — {{ scopeLabel(g.scope) }}
                        </span>
                      </div>
                    </div>
                    <span v-else class="text-muted" style="font-size:12px">sin grants</span>
                  </template>
                </el-table-column>
                <el-table-column header-align="right" align="right" label="Acciones" width="120">
                  <div slot-scope="{ row }" class="text-right table-actions">
                    <el-tooltip content="Editar grants" effect="light" :open-delay="300" placement="top">
                      <base-button @click="openGrantsEdit(row)" type="warning" icon size="sm" class="btn-link">
                        <i class="tim-icons icon-pencil"></i>
                      </base-button>
                    </el-tooltip>
                    <el-tooltip content="Eliminar" effect="light" :open-delay="300" placement="top">
                      <base-button @click="deleteUser(row)" type="danger" icon size="sm" class="btn-link">
                        <i class="fa fa-trash"></i>
                      </base-button>
                    </el-tooltip>
                  </div>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <!-- ══════════ OPERADORES ══════════ -->
            <el-tab-pane label="Operadores" name="operators">
              <div style="display:flex; justify-content:flex-end; margin-bottom:12px">
                <base-button type="primary" size="sm" @click="operatorModal = true">
                  <i class="fa fa-plus" style="margin-right:6px"></i>Nuevo operador
                </base-button>
              </div>

              <el-table :data="operators" size="small">
                <el-table-column label="Código" width="140">
                  <template slot-scope="{ row }">
                    <code style="font-size:11px">{{ row.operatorCode }}</code>
                  </template>
                </el-table-column>
                <el-table-column prop="displayName" label="Nombre" min-width="180" />
                <el-table-column header-align="right" align="right" label="Acciones" width="90">
                  <div slot-scope="{ row }" class="text-right table-actions">
                    <el-tooltip content="Eliminar" effect="light" :open-delay="300" placement="top">
                      <base-button @click="deleteOperator(row)" type="danger" icon size="sm" class="btn-link">
                        <i class="fa fa-trash"></i>
                      </base-button>
                    </el-tooltip>
                  </div>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <!-- ══════════ ZONAS ══════════ -->
            <el-tab-pane label="Zonas" name="zones">
              <div style="display:flex; justify-content:flex-end; margin-bottom:12px">
                <base-button type="primary" size="sm" @click="openZoneCreate">
                  <i class="fa fa-plus" style="margin-right:6px"></i>Nueva zona
                </base-button>
              </div>

              <el-table :data="zones" size="small">
                <el-table-column label="Código" width="130">
                  <template slot-scope="{ row }">
                    <code style="font-size:11px">{{ row.zoneCode }}</code>
                  </template>
                </el-table-column>
                <el-table-column prop="displayName" label="Nombre" min-width="150" />
                <el-table-column label="Operador" min-width="150">
                  <template slot-scope="{ row }">
                    {{ operatorLabel(row.operatorCode) }}
                  </template>
                </el-table-column>
                <el-table-column header-align="right" align="right" label="Acciones" width="120">
                  <div slot-scope="{ row }" class="text-right table-actions">
                    <el-tooltip content="Editar nombre" effect="light" :open-delay="300" placement="top">
                      <base-button @click="openZoneEdit(row)" type="warning" icon size="sm" class="btn-link">
                        <i class="tim-icons icon-pencil"></i>
                      </base-button>
                    </el-tooltip>
                    <el-tooltip content="Eliminar" effect="light" :open-delay="300" placement="top">
                      <base-button @click="deleteZone(row)" type="danger" icon size="sm" class="btn-link">
                        <i class="fa fa-trash"></i>
                      </base-button>
                    </el-tooltip>
                  </div>
                </el-table-column>
              </el-table>
            </el-tab-pane>

          </el-tabs>
        </card>
      </div>
    </div>

    <!-- MODAL NUEVO USUARIO -->
    <el-dialog title="Nuevo usuario" :visible.sync="userModal" width="60%" append-to-body>
      <div class="row">
        <base-input class="col-4" v-model="userForm.name" label="Nombre" />
        <base-input class="col-4" v-model="userForm.email" label="Email" type="email" />
        <base-input class="col-4" v-model="userForm.password" label="Contraseña (mín. 6)" type="password" />
      </div>

      <h6 class="text-muted" style="margin:14px 0 8px">
        <i class="fa fa-key" style="margin-right:6px"></i>Grants
        <span style="font-weight:normal">(rol + alcance; sin grants el usuario entra pero no ve nada)</span>
      </h6>

      <div
        v-for="(g, i) in userForm.grants"
        :key="i"
        class="row"
        style="align-items:flex-end; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px 0 4px; margin-bottom:10px"
      >
        <div class="col-3">
          <label class="control-label">Rol</label>
          <el-select v-model="g.role" style="width:100%" class="select-primary">
            <el-option v-for="r in roleOptions" :key="r" :value="r" :label="r" />
          </el-select>
        </div>
        <template v-if="g.role !== 'superadmin'">
          <div class="col-3">
            <label class="control-label">Operador</label>
            <el-select v-model="g.scope.operatorCode" style="width:100%" class="select-primary" filterable clearable placeholder="—">
              <el-option v-for="op in operators" :key="op.operatorCode" :value="op.operatorCode" :label="operatorLabel(op.operatorCode)" />
            </el-select>
          </div>
          <div class="col-3">
            <label class="control-label">Zona (opcional)</label>
            <el-select v-model="g.scope.zoneCode" style="width:100%" class="select-primary" filterable clearable placeholder="—">
              <el-option
                v-for="z in zones.filter(x => x.operatorCode === g.scope.operatorCode)"
                :key="z.zoneCode"
                :value="z.zoneCode"
                :label="(z.displayName || z.zoneCode) + ' (' + z.zoneCode + ')'"
              />
            </el-select>
          </div>
          <div class="col-2">
            <label class="control-label">Sitio (opcional)</label>
            <el-select v-model="g.scope.siteCode" style="width:100%" class="select-primary" filterable clearable placeholder="—">
              <el-option
                v-for="s in sites.filter(x => x.operatorCode === g.scope.operatorCode && (!g.scope.zoneCode || x.zoneCode === g.scope.zoneCode))"
                :key="s.siteCode"
                :value="s.siteCode"
                :label="(s.nombre || s.siteCode) + ' (' + s.siteCode + ')'"
              />
            </el-select>
          </div>
        </template>
        <div class="col-1" style="text-align:right; padding-bottom:10px">
          <base-button type="danger" icon size="sm" class="btn-link" @click="userForm.grants.splice(i, 1)">
            <i class="fa fa-trash"></i>
          </base-button>
        </div>
      </div>

      <base-button type="default" size="sm" @click="addGrantDraft(userForm.grants)">
        <i class="fa fa-plus" style="margin-right:6px"></i>Agregar grant
      </base-button>

      <span slot="footer">
        <base-button type="secondary" @click="userModal = false">Cancelar</base-button>
        <base-button type="primary" @click="createUser" :disabled="!canCreateUser || saving">
          <i class="fa" :class="saving ? 'fa-spinner fa-spin' : 'fa-save'" style="margin-right:6px"></i>
          Crear usuario
        </base-button>
      </span>
    </el-dialog>

    <!-- MODAL EDITAR GRANTS -->
    <el-dialog
      :title="grantsTarget ? 'Grants de ' + (grantsTarget.name || grantsTarget.email) : ''"
      :visible.sync="grantsModal"
      width="60%"
      append-to-body
    >
      <div
        v-for="(g, i) in grantsDraft"
        :key="i"
        class="row"
        style="align-items:flex-end; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px 0 4px; margin-bottom:10px"
      >
        <div class="col-3">
          <label class="control-label">Rol</label>
          <el-select v-model="g.role" style="width:100%" class="select-primary">
            <el-option v-for="r in roleOptions" :key="r" :value="r" :label="r" />
          </el-select>
        </div>
        <template v-if="g.role !== 'superadmin'">
          <div class="col-3">
            <label class="control-label">Operador</label>
            <el-select v-model="g.scope.operatorCode" style="width:100%" class="select-primary" filterable clearable placeholder="—">
              <el-option v-for="op in operators" :key="op.operatorCode" :value="op.operatorCode" :label="operatorLabel(op.operatorCode)" />
            </el-select>
          </div>
          <div class="col-3">
            <label class="control-label">Zona (opcional)</label>
            <el-select v-model="g.scope.zoneCode" style="width:100%" class="select-primary" filterable clearable placeholder="—">
              <el-option
                v-for="z in zones.filter(x => x.operatorCode === g.scope.operatorCode)"
                :key="z.zoneCode"
                :value="z.zoneCode"
                :label="(z.displayName || z.zoneCode) + ' (' + z.zoneCode + ')'"
              />
            </el-select>
          </div>
          <div class="col-2">
            <label class="control-label">Sitio (opcional)</label>
            <el-select v-model="g.scope.siteCode" style="width:100%" class="select-primary" filterable clearable placeholder="—">
              <el-option
                v-for="s in sites.filter(x => x.operatorCode === g.scope.operatorCode && (!g.scope.zoneCode || x.zoneCode === g.scope.zoneCode))"
                :key="s.siteCode"
                :value="s.siteCode"
                :label="(s.nombre || s.siteCode) + ' (' + s.siteCode + ')'"
              />
            </el-select>
          </div>
        </template>
        <div class="col-1" style="text-align:right; padding-bottom:10px">
          <base-button type="danger" icon size="sm" class="btn-link" @click="grantsDraft.splice(i, 1)">
            <i class="fa fa-trash"></i>
          </base-button>
        </div>
      </div>

      <base-button type="default" size="sm" @click="addGrantDraft(grantsDraft)">
        <i class="fa fa-plus" style="margin-right:6px"></i>Agregar grant
      </base-button>
      <p class="text-muted" style="font-size:12px; margin-top:10px">
        Reemplazo total: la lista resultante pisa los grants actuales del usuario.
        El cambio aplica en el próximo request, sin re-login.
      </p>

      <span slot="footer">
        <base-button type="secondary" @click="grantsModal = false">Cancelar</base-button>
        <base-button type="primary" @click="saveGrants" :disabled="saving">
          <i class="fa" :class="saving ? 'fa-spinner fa-spin' : 'fa-save'" style="margin-right:6px"></i>
          Guardar grants
        </base-button>
      </span>
    </el-dialog>

    <!-- MODAL NUEVO OPERADOR -->
    <el-dialog title="Nuevo operador" :visible.sync="operatorModal" width="480px" append-to-body>
      <base-input v-model="operatorForm.operatorCode" label="Código (identidad técnica, inmutable)" placeholder="ej. CLARO" />
      <base-input v-model="operatorForm.displayName" label="Nombre visible" placeholder="ej. Claro Argentina" />
      <span slot="footer">
        <base-button type="secondary" @click="operatorModal = false">Cancelar</base-button>
        <base-button
          type="primary"
          @click="createOperator"
          :disabled="!operatorForm.operatorCode || !operatorForm.displayName || saving"
        >
          Crear operador
        </base-button>
      </span>
    </el-dialog>

    <!-- MODAL NUEVA / EDITAR ZONA -->
    <el-dialog
      :title="zoneEditing ? 'Editar zona ' + zoneForm.zoneCode : 'Nueva zona'"
      :visible.sync="zoneModal"
      width="480px"
      append-to-body
    >
      <base-input
        v-if="!zoneEditing"
        v-model="zoneForm.zoneCode"
        label="Código (identidad técnica, inmutable)"
        placeholder="ej. NEA-1"
      />
      <base-input v-model="zoneForm.displayName" label="Nombre visible" placeholder="ej. Corrientes Capital" />
      <div v-if="!zoneEditing">
        <label class="control-label">Operador</label>
        <el-select v-model="zoneForm.operatorCode" style="width:100%" class="select-primary" filterable placeholder="Operador">
          <el-option v-for="op in operators" :key="op.operatorCode" :value="op.operatorCode" :label="operatorLabel(op.operatorCode)" />
        </el-select>
      </div>
      <span slot="footer">
        <base-button type="secondary" @click="zoneModal = false">Cancelar</base-button>
        <base-button
          type="primary"
          @click="saveZone"
          :disabled="!zoneForm.displayName || (!zoneEditing && (!zoneForm.zoneCode || !zoneForm.operatorCode)) || saving"
        >
          {{ zoneEditing ? 'Guardar' : 'Crear zona' }}
        </base-button>
      </span>
    </el-dialog>

  </div>
</template>

<script>
import { Table, TableColumn, Dialog, Select, Option, Tooltip, Tabs, TabPane, MessageBox } from "element-ui";

const ROLE_OPTIONS = ['superadmin', 'noc', 'manager', 'cellowner'];  // espejo del enum user.js:20

const EMPTY_GRANT = () => ({ role: 'cellowner', scope: { operatorCode: '', zoneCode: '', siteCode: '' } });

export default {
  middleware: "authenticated",
  components: {
    [Table.name]: Table,
    [TableColumn.name]: TableColumn,
    [Dialog.name]: Dialog,
    [Select.name]: Select,
    [Option.name]: Option,
    [Tooltip.name]: Tooltip,
    [Tabs.name]: Tabs,
    [TabPane.name]: TabPane,
  },
  data() {
    return {
      activeTab: "users",
      saving: false,

      users: [],
      operators: [],
      zones: [],
      sites: [],

      roleOptions: ROLE_OPTIONS,

      userModal: false,
      userForm: { name: "", email: "", password: "", grants: [] },

      grantsModal: false,
      grantsTarget: null,
      grantsDraft: [],

      operatorModal: false,
      operatorForm: { operatorCode: "", displayName: "" },

      zoneModal: false,
      zoneEditing: false,
      zoneForm: { zoneCode: "", displayName: "", operatorCode: "" },
    };
  },
  computed: {
    canCreateUser() {
      const f = this.userForm;
      return !!(f.name && f.email && f.password && f.password.length >= 6);
    },
  },
  async mounted() {
    // Revalidación al montar (patrón rulepacks/index.vue): la página es
    // superadmin-only; si el rol cambió, se vuelve al panel.
    const headers = { headers: { token: this.$store.state.auth.token } };
    try {
      const me = await this.$axios.get("/me", headers);
      const grants = (me.data.data && me.data.data.grants) || [];
      if (!grants.some((g) => g.role === "superadmin")) {
        this.$notify({
          type: "warning",
          icon: "tim-icons icon-alert-circle-exc",
          message: "La consola de administración es solo para superadmin",
        });
        this.$router.push("/");
        return;
      }
    } catch (e) {
      return;  // el middleware authenticated ya maneja el 401
    }
    this.loadAll();
  },
  methods: {
    axiosHeaders() {
      return { headers: { token: this.$store.state.auth.token } };
    },

    async loadAll() {
      const headers = this.axiosHeaders();
      try {
        const [usersRes, opsRes, zonesRes, sitesRes] = await Promise.all([
          this.$axios.get("/user", headers),
          this.$axios.get("/operator", headers),
          this.$axios.get("/zone", headers),
          this.$axios.get("/site", headers),
        ]);
        if (usersRes.data.status === "success") this.users = usersRes.data.data || [];
        if (opsRes.data.status === "success") this.operators = opsRes.data.data || [];
        if (zonesRes.data.status === "success") this.zones = zonesRes.data.data || [];
        if (sitesRes.data.status === "success") this.sites = sitesRes.data.data || [];
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al cargar la consola";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      }
    },

    operatorLabel(code) {
      const op = this.operators.find((o) => o.operatorCode === code);
      return op ? `${op.displayName || op.operatorCode} (${op.operatorCode})` : code;
    },

    scopeLabel(scope) {
      return [scope.operatorCode, scope.zoneCode, scope.siteCode].filter(Boolean).join(" · ");
    },

    addGrantDraft(list) {
      list.push(EMPTY_GRANT());
    },

    // Limpia el scope: claves vacías fuera; superadmin viaja sin scope.
    cleanGrants(drafts) {
      return drafts.map((g) => {
        const scope = {};
        if (g.role !== "superadmin" && g.scope) {
          for (const k of ["operatorCode", "zoneCode", "siteCode"]) {
            if (g.scope[k]) scope[k] = g.scope[k];
          }
        }
        return Object.keys(scope).length ? { role: g.role, scope } : { role: g.role };
      });
    },

    // ── Usuarios ──────────────────────────────────────────────────

    openUserCreate() {
      this.userForm = { name: "", email: "", password: "", grants: [EMPTY_GRANT()] };
      this.userModal = true;
    },

    async createUser() {
      if (this.saving) return;
      this.saving = true;
      try {
        const res = await this.$axios.post(
          "/user",
          {
            newUser: {
              name: this.userForm.name,
              email: this.userForm.email,
              password: this.userForm.password,
              grants: this.cleanGrants(this.userForm.grants),
            },
          },
          this.axiosHeaders()
        );
        if (res.data.status === "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: `Usuario ${this.userForm.email} creado` });
          this.userModal = false;
          this.loadAll();
        }
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al crear el usuario";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      } finally {
        this.saving = false;
      }
    },

    openGrantsEdit(user) {
      this.grantsTarget = user;
      this.grantsDraft = (user.grants || []).map((g) => ({
        role: g.role,
        scope: {
          operatorCode: (g.scope && g.scope.operatorCode) || "",
          zoneCode: (g.scope && g.scope.zoneCode) || "",
          siteCode: (g.scope && g.scope.siteCode) || "",
        },
      }));
      this.grantsModal = true;
    },

    async saveGrants() {
      if (this.saving || !this.grantsTarget) return;
      this.saving = true;
      try {
        const res = await this.$axios.put(
          `/user/${this.grantsTarget._id}/grants`,
          { grants: this.cleanGrants(this.grantsDraft) },
          this.axiosHeaders()
        );
        if (res.data.status === "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: "Grants actualizados" });
          this.grantsModal = false;
          this.loadAll();
        }
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al guardar los grants";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      } finally {
        this.saving = false;
      }
    },

    async deleteUser(user) {
      try {
        await MessageBox.confirm(
          `¿Eliminar el usuario "${user.name || user.email}" (${user.email})? Esta acción no se puede deshacer.`,
          "Confirmar eliminación",
          { confirmButtonText: "Eliminar", cancelButtonText: "Cancelar", type: "warning" }
        );
      } catch {
        return;
      }
      try {
        const res = await this.$axios.delete(`/user/${user._id}`, this.axiosHeaders());
        if (res.data.status === "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: `Usuario ${user.email} eliminado` });
          this.loadAll();
        }
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al eliminar el usuario";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      }
    },

    // ── Operadores ────────────────────────────────────────────────

    async createOperator() {
      if (this.saving) return;
      this.saving = true;
      try {
        const res = await this.$axios.post(
          "/operator",
          { newOperator: { ...this.operatorForm } },
          this.axiosHeaders()
        );
        if (res.data.status === "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: `Operador ${this.operatorForm.operatorCode} creado` });
          this.operatorModal = false;
          this.operatorForm = { operatorCode: "", displayName: "" };
          this.loadAll();
        }
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al crear el operador";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      } finally {
        this.saving = false;
      }
    },

    async deleteOperator(op) {
      try {
        await MessageBox.confirm(
          `¿Eliminar el operador "${op.displayName || op.operatorCode}" (${op.operatorCode})?`,
          "Confirmar eliminación",
          { confirmButtonText: "Eliminar", cancelButtonText: "Cancelar", type: "warning" }
        );
      } catch {
        return;
      }
      try {
        const res = await this.$axios.delete("/operator", {
          ...this.axiosHeaders(),
          params: { operatorCode: op.operatorCode },
        });
        if (res.data.status === "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: `Operador ${op.operatorCode} eliminado` });
          this.loadAll();
        }
      } catch (e) {
        // 409: operador con zones/sites vivos — el backend lo cuenta.
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al eliminar el operador";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      }
    },

    // ── Zonas ─────────────────────────────────────────────────────

    openZoneCreate() {
      this.zoneEditing = false;
      this.zoneForm = { zoneCode: "", displayName: "", operatorCode: "" };
      this.zoneModal = true;
    },

    openZoneEdit(zone) {
      this.zoneEditing = true;
      this.zoneForm = { zoneCode: zone.zoneCode, displayName: zone.displayName || "", operatorCode: zone.operatorCode };
      this.zoneModal = true;
    },

    async saveZone() {
      if (this.saving) return;
      this.saving = true;
      try {
        let res;
        if (this.zoneEditing) {
          res = await this.$axios.put("/zone", { zone: { ...this.zoneForm } }, this.axiosHeaders());
        } else {
          res = await this.$axios.post("/zone", { newZone: { ...this.zoneForm } }, this.axiosHeaders());
        }
        if (res.data.status === "success") {
          this.$notify({
            type: "success",
            icon: "tim-icons icon-check-2",
            message: this.zoneEditing ? "Zona actualizada" : `Zona ${this.zoneForm.zoneCode} creada`,
          });
          this.zoneModal = false;
          this.loadAll();
        }
      } catch (e) {
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al guardar la zona";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      } finally {
        this.saving = false;
      }
    },

    async deleteZone(zone) {
      try {
        await MessageBox.confirm(
          `¿Eliminar la zona "${zone.displayName || zone.zoneCode}" (${zone.zoneCode})?`,
          "Confirmar eliminación",
          { confirmButtonText: "Eliminar", cancelButtonText: "Cancelar", type: "warning" }
        );
      } catch {
        return;
      }
      try {
        const res = await this.$axios.delete("/zone", {
          ...this.axiosHeaders(),
          params: { zoneCode: zone.zoneCode, operatorCode: zone.operatorCode },
        });
        if (res.data.status === "success") {
          this.$notify({ type: "success", icon: "tim-icons icon-check-2", message: `Zona ${zone.zoneCode} eliminada` });
          this.loadAll();
        }
      } catch (e) {
        // 409: zona con sites vivos — el backend lo cuenta.
        const msg = (e.response && e.response.data && e.response.data.error) || "Error al eliminar la zona";
        this.$notify({ type: "danger", icon: "tim-icons icon-alert-circle-exc", message: String(msg) });
      }
    },
  },
};
</script>
