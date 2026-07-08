// SF-5 Capa 1 · DEC-REF-62.b — middleware de rol para páginas superadmin.
//
// Se combina con `authenticated` mediante el patrón array:
//     middleware: ['authenticated', 'superadmin']
//
// Nuxt 2 ejecuta el array en ORDEN. `authenticated` corre primero:
//   - despacha readToken (store/index.js:35-44) → rehidrata state.auth
//     desde localStorage (funciona también post-F5).
//   - si no hay auth → redirect('/login') y aborta.
// Entonces al llegar acá `state.auth` está garantizado. Con optional
// chaining defensivo por si el schema del usuario cambia en el futuro.
//
// Grants leídos del store, sin llamada de red. La revalidación fresca
// contra DB (`GET /me`) vive en la PÁGINA de la consola en Capa 2, no
// en el middleware — DEC-REF-62.a: el doble chequeo aplica solo a la
// consola, no a menú ni navegación.
//
// Sin rol → redirect a /dashboard (usuario está autenticado pero no
// autorizado; devolverlo al home tiene mejor UX que un 403 seco y no
// filtra información sobre qué páginas superadmin existen).

export default function ({ store, redirect }) {
  const grants = store.state.auth?.userData?.grants || [];
  const isSuperadmin = grants.some(g => g.role === 'superadmin');
  if (!isSuperadmin) {
    return redirect('/dashboard');
  }
}
