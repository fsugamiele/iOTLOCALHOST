# Inventario automático

**Generado**: 2026-05-19 23:23:04
**Branch**: feature/telco-support
**Último commit**: 87cf308 — chore: track app/README.md, test.html and util/ scripts

> ⚠️ ARCHIVO AUTO-GENERADO. NO EDITAR A MANO.
> Para regenerar: `./scripts/inventario.sh`

---

## Branch y estado del working tree

```
## feature/telco-support...origin/feature/telco-support
 M docs/INVENTARIO_AUTO.md
```

---

## Modelos del backend (`app/api/models/`)

| Archivo | Tamaño | Última modificación |
|---|---|---|
| data.js | 467 bytes | Apr 4 15:16 |
| device.js | 1019 bytes | May 4 12:15 |
| emqx_alarm_rule.js | 622 bytes | Apr 4 04:23 |
| emqx_auth.js | 570 bytes | Apr 4 04:23 |
| emqx_rule.js | 715 bytes | Apr 4 04:23 |
| emqx_saver_rule.js | 393 bytes | Apr 4 04:23 |
| forensic_event.js | 3294 bytes | May 4 17:40 |
| notifications.js | 790 bytes | Apr 4 04:23 |
| site.js | 929 bytes | May 4 11:28 |
| template.js | 436 bytes | Apr 4 04:23 |
| user.js | 503 bytes | Apr 4 04:23 |

---

## Routes del backend (`app/api/routes/`)

| Archivo | Tamaño | Endpoints expuestos |
|---|---|---|
| alarms.js | 6425 bytes | 3 endpoints |
| dataprovider.js | 1598 bytes | 2 endpoints |
| devices.js | 11436 bytes | 5 endpoints |
| emqxapi.js | 14292 bytes | 0
0 endpoints |
| forensic.js | 13837 bytes | 3 endpoints |
| rules.js | 9738 bytes | 3 endpoints |
| simulator.js | 11810 bytes | 6 endpoints |
| sites.js | 6247 bytes | 6 endpoints |
| templates.js | 2735 bytes | 3 endpoints |
| users.js | 5571 bytes | 4 endpoints |
| webhooks.js | 12916 bytes | 9 endpoints |

### Subdirectorio `bridges/`

- tasmota.js (5903 bytes)

---

## Pages del frontend (`app/pages/`)

```
GeneralViews/NotFoundPage.vue
alarms.vue
dashboard.vue
demo/simulator.vue
devices.vue
index.vue
login.vue
register.vue
rules.vue
templates.vue
test.vue
```

---

## Componentes Vue (`app/components/`)

```
Badge.vue
BaseAlert.vue
BaseButton.vue
BaseDropdown.vue
BasePagination.vue
BaseProgress.vue
BaseSwitch.vue
BaseTable.vue
Breadcrumb/Breadcrumb.vue
Breadcrumb/BreadcrumbItem.vue
Breadcrumb/RouteBreadcrumb.vue
Cards/Card.vue
CloseButton.vue
Dashboard/TaskList.vue
Dashboard/UserTable.vue
Inputs/BaseCheckbox.vue
Inputs/BaseInput.vue
Inputs/BaseRadio.vue
Inputs/IconCheckbox.vue
Json.vue
Layout/Content.vue
Layout/ContentFooter.vue
Layout/DashboardLayout.vue
Layout/DashboardNavbar.vue
Layout/LoadingMainPanel.vue
Layout/SidebarSharePlugin.vue
Layout/starter/SampleFooter.vue
Layout/starter/SampleNavbar.vue
LoadingPanel.vue
Modal.vue
Navbar/BaseNav.vue
Navbar/NavbarToggleButton.vue
NotificationPlugin/Notification.vue
NotificationPlugin/Notifications.vue
SidebarPlugin/SideBar.vue
SidebarPlugin/SidebarItem.vue
Simulator/DeviceList.vue
Simulator/DevicePanel.vue
UserProfile/EditProfileForm.vue
UserProfile/UserCard.vue
Widgets/Iotbutton.vue
Widgets/Iotindicator.vue
Widgets/Iotswitch.vue
Widgets/Rtnumberchart.vue
```

---

## Plugins, middlewares y store

### Plugins (`app/plugins/`)
- README.md
- RTLPlugin.js
- dashboard-plugin.js
- directives
- extra
- globalComponents.js
- globalDirectives.js

### Middlewares (`app/middleware/`)
- README.md
- authenticated.js
- notAuthenticated.js

### Store (`app/store/`)
- README.md
- index.js

---

## Simulador (`tools/device_simulator/`)

### Archivos principales
```
3178 README.md
4096 lib
18552 package-lock.json
323 package.json
3630 run.js
11184 seed.js
4096 site_images
304 sites_real.example.json
1026 sites_real.json
```

### Lib
```
lib/api.js 5015 bytes
lib/device.js 10092 bytes
lib/sensor-engine.js 7956 bytes
```

---

## Últimos 30 commits (rama actual)

```
87cf308 chore: track app/README.md, test.html and util/ scripts
b582a7a feat(simulator): add demo simulator panel (Sim-3 step 3)
d79916f feat(simulator-api): enrich GET /simulator/devices with templateWidgets
3c4eb56 docs: add project documentation structure
7ebdb5a chore: tighten .gitignore for stale artifacts and snapshots
afdb857 feat(simulator): add reset command — POST /simulator/reset + applyCommand case
c9ed3ee docs: log Sim-1.2 — template v2 aligned with Claro pitch (DEC-46 to DEC-53)
aa02744 feat(simulator): re-template SEC/GEN to match Claro pitch (v2)
803212f docs: log Sim-2 completion (decisions DEC-42 to DEC-45, ACL fix lesson)
0d38a3b feat(simulator-api): /api/simulator/* endpoints for device control
03bf272 fix(webhooks): include simulator/{dId}/control in ACL for wanomi-sim devices
b898d9a fix(simulator): use firmwareType=wanomi-sim to distinguish from real firmware
727ec09 docs: log Sim-1 completion (decisions DEC-29 to DEC-41, lessons learned)
467cb62 feat(simulator): WN-SITE-SEC/GEN simulator with MQTT bootstrap and command channel
1224110 chore(simulator): scaffold device simulator structure with gitignored real sites
96507b9 docs: register Phase 4B + 4C.1 + 4C.2 completion in wanomi.md
0e735c2 feat(forensic): add PDF export endpoint with chain verification banner
cb24f8d deps: add pdfkit ^0.13.0 for forensic PDF export
2e36d2a feat(forensic): harden HMAC secret guard to abort process on misconfiguration
75cb914 feat(forensic): fail-fast on missing or placeholder HMAC secret
7447132 docs: clarify dual .env structure in project conventions
b99ee81 feat(forensic): add GET /forensic-events and /verify endpoints + installer env
e7677fc feat(webhooks): hook forensic dispatcher into alarm flow
7488fe4 feat(services): add forensic event dispatcher with HMAC chain
914171d feat(models): add forensic_event index on siteId+timestamp for prevHash lookup
4f842ec docs: register project conventions discovered during Phase 4C.1
b93b0ab feat(routes): add Site CRUD with bind/unbind endpoints
330416c feat(models): extend Device with telco fields (siteId, iccid, imei, apn)
5919170 feat(models): add ForensicEvent model with HMAC integrity
13ec33f feat(models): add Site model for telco pilot
```

---

## Ramas locales y remotas

### Locales
```
  feature/tasmota-esphome-support
* feature/telco-support
  feature/wifi-ap-provisioning
  master
  stable-without-remote-config
```

### Remotas
```
  origin/feature/tasmota-esphome-support
  origin/feature/telco-support
  origin/feature/wifi-ap-provisioning
  origin/master
```

---

## Estadísticas del repo

- **Total de modelos**: 11
- **Total de routes**: 11
- **Total de pages**: 11
- **Total de componentes Vue**: 44
- **Total de commits en la branch**: 62
- **Commits desde master**: 33

