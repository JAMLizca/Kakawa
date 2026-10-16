// Cabecera común del sitio público (inicio.html y ficha.html):
// muestra "Iniciar sesión / Crear cuenta" o, si ya hay sesión, el acceso al espacio de cada rol.
import { api } from './api.js';
import { sesion } from './sesion.js';
import { el, vaciar } from './ui.js';

/** Espacio de cada rol dentro de la aplicación. El rol lo decide el servidor al iniciar sesión. */
export function espacioDe(rol) {
  return rol === 'cliente' ? 'index.html#/tienda' : 'index.html#/lotes';
}

export function montarCabecera({ enInicio = false } = {}) {
  const cabecera = document.getElementById('cabecera');
  const caja = document.getElementById('sitio-sesion');
  const boton = document.getElementById('sitio-menu-boton');
  const prefijo = enInicio ? '' : 'inicio.html';

  function pintar() {
    const usuario = sesion.usuario();
    if (sesion.activa() && usuario) {
      const salir = el('button', { class: 'sitio-sesion__salir', type: 'button' }, 'Salir');
      salir.addEventListener('click', async () => {
        try { if (navigator.onLine) await api('/auth/logout', { metodo: 'POST' }); } catch { /* la sesión local se cierra igual */ }
        await sesion.cerrar();
        pintar();
      });
      vaciar(caja,
        el('span', { class: 'sitio-sesion__hola' }, `Hola, ${usuario.nombre.split(' ')[0]}`),
        el('a', { class: 'boton boton--pequeno', href: espacioDe(usuario.rol) }, usuario.rol === 'cliente' ? 'Mi tienda' : 'Mi espacio'),
        salir);
    } else {

      vaciar(caja,
        el('a', { class: 'sitio-sesion__entrar', href: `${prefijo}#acceso` }, 'Iniciar sesión'),
        el('a', { class: 'boton boton--pequeno', href: `${prefijo}#registro` }, 'Crear cuenta'));
    }
  }

  // Menú del celular
  boton?.addEventListener('click', () => {
    const abierto = boton.getAttribute('aria-expanded') !== 'true';
    boton.setAttribute('aria-expanded', String(abierto));
    cabecera.classList.toggle('sitio-cabecera--abierta', abierto);
  });
  cabecera?.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      boton?.setAttribute('aria-expanded', 'false');
      cabecera.classList.remove('sitio-cabecera--abierta');
    }
  });

  // La cabecera se compacta al bajar por la página
  const alDesplazar = () => cabecera?.classList.toggle('sitio-cabecera--compacta', window.scrollY > 24);
  window.addEventListener('scroll', alDesplazar, { passive: true });
  alDesplazar();

  pintar();
  return { repintar: pintar };
}
