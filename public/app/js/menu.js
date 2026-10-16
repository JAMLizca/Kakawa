const ANCHO_ESCRITORIO = '(min-width: 62rem)';

const barra = document.getElementById('barra');
const boton = document.getElementById('menu-boton');
const fondo = document.getElementById('menu-fondo');
const texto = boton?.querySelector('.menu-boton__texto');
const escritorio = matchMedia(ANCHO_ESCRITORIO);

function abrir(abierto) {
  if (!barra || !boton) return;
  barra.classList.toggle('barra--abierta', abierto);
  boton.setAttribute('aria-expanded', String(abierto));
  if (texto) texto.textContent = abierto ? 'Cerrar menú' : 'Abrir menú';
  // Mientras el cajón está abierto la página de atrás no se desplaza.
  document.body.classList.toggle('sin-desplazamiento', abierto && !escritorio.matches);
  if (abierto) document.querySelector('#menu a')?.focus();
}

const estaAbierto = () => boton?.getAttribute('aria-expanded') === 'true';

boton?.addEventListener('click', () => abrir(!estaAbierto()));
fondo?.addEventListener('click', () => abrir(false));

// Al elegir una sección o cambiar de ruta, el cajón se cierra.
window.addEventListener('hashchange', () => abrir(false));
document.getElementById('menu')?.addEventListener('click', (e) => {
  if (e.target.closest('a')) abrir(false);
});


// Esc cierra el cajón y devuelve el foco al botón.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && estaAbierto()) {
    abrir(false);
    boton.focus();
  }
});

escritorio.addEventListener('change', () => abrir(false));

// La página deja espacio al menú lateral solo cuando hay sesión (la barra visible).
function marcarCuerpo() {
  document.body.classList.toggle('con-lateral', Boolean(barra) && !barra.hidden);
}
if (barra) new MutationObserver(marcarCuerpo).observe(barra, { attributes: true, attributeFilter: ['hidden'] });
marcarCuerpo();

// Fecha de hoy en la barra superior (escritorio), por ejemplo "Viernes, 16 de octubre de 2026".
const fecha = document.getElementById('fecha-hoy');
if (fecha) {
  const texto = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  fecha.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
}
