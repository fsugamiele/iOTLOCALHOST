<template>
  <div class="container login-page">
    <div class="col-lg-4 col-md-6 ml-auto mr-auto">
      <card class="card-login card-white">
        <template slot="header">
          <h1 class="card-title">Registro cerrado</h1>
        </template>
        <p class="text-muted" style="padding: 0 10px 10px">
          El registro público está deshabilitado. El alta de usuarios la realiza
          un administrador desde la consola de administración.
        </p>
        <div slot="footer">
          <nuxt-link to="/login">
            <base-button type="primary" block>Volver al login</base-button>
          </nuxt-link>
        </div>
      </card>
    </div>
  </div>
</template>

<script>
// DEC-REF-97 D-2 (#72): /register deja de ser un formulario público.
// La ruta se conserva (links viejos, bookmarks) pero solo informa y
// redirige; el backend además exige superadmin en POST /register.
export default {
  middleware: 'notAuthenticated',
  layout: "auth",
  mounted() {
    this.$router.replace('/login');
  },
};
</script>
