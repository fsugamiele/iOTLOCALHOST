<template>
  <div class="row">
    <div class="col-12">
      <card>
        <h3 slot="header" class="card-title">Reglas de monitoreo</h3>
        <p>
          Consola de reglas — <strong>en construcción, Capa 2</strong>.
        </p>
        <p class="text-muted">
          El listado de RulePack y el editor de <code>crossExpr</code>
          se agregan en las próximas capas de SF-5.
          Esta página existe para validar el candado de rol
          (DEC-REF-62.b) en la Capa 1.
        </p>
      </card>
    </div>
  </div>
</template>

<script>
export default {
  middleware: ['authenticated', 'superadmin'],
  name: 'rulepacks-index'
};
</script>
