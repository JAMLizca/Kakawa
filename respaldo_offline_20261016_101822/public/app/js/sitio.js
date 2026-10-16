// Sitio público de la asociación: información, catálogo con filtros, inicio de sesión único y registro de compradores.
// El rol nunca se elige aquí: el servidor lo identifica con el usuario y la contraseña.
import { api } from './api.js';
import { sesion } from './sesion.js';
import { espacioDe, montarCabecera } from './sitio-cabecera.js';
import { aviso, campo, datosDe, el, formato, limpiarErrores, mostrarErrores, ocupado, vaciar } from './ui.js';

montarCabecera({ enInicio: true });

const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* ---------- Cifras de la portada (cuentan hacia arriba) ---------- */
function contar(nodo, hasta, decimales = 0) {
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: decimales });
  if (reducido) { nodo.textContent = fmt.format(hasta); return; }
  const inicio = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - inicio) / 1200);
    nodo.textContent = fmt.format(hasta * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/* ---------- Catálogo ---------- */
const lista = document.getElementById('catalogo-lista');
const resumen = document.getElementById('catalogo-resumen');
const filtros = document.getElementById('catalogo-filtros');
let productos = [];

function tarjeta(p, i) {
  const nodo = el('a', { class: 'catalogo-tarjeta', href: `ficha.html?codigo=${encodeURIComponent(p.codigo)}`,
    'aria-label': `${p.nombre}, ${p.codigo}, ${p.origen}. Ver recorrido` },
    el('span', { class: 'catalogo-tarjeta__arte', 'aria-hidden': 'true' },
      el('span', { class: 'catalogo-tarjeta__grano' }), el('span', { class: 'catalogo-tarjeta__grano' }),
      el('span', { class: 'catalogo-tarjeta__lote cifra' }, p.lote)),
    el('span', { class: 'catalogo-tarjeta__cuerpo' },
      el('span', { class: 'catalogo-tarjeta__codigo cifra' }, p.codigo),
      el('span', { class: 'catalogo-tarjeta__nombre' }, p.nombre),
      el('span', { class: 'catalogo-tarjeta__origen' }, `${p.origen}, ${p.departamento}`),
      el('span', { class: 'catalogo-tarjeta__datos' },
        el('span', {}, el('strong', { class: 'cifra' }, formato.kg(p.cantidad_disponible, p.unidad)), ' disponibles'),
        el('span', {}, el('strong', {}, String(p.etapas)), p.etapas === 1 ? ' etapa' : ' etapas')),
      el('span', { class: 'catalogo-tarjeta__ver' }, 'Ver recorrido')));
  nodo.style.animationDelay = `${Math.min(i, 9) * 60}ms`;
  return nodo;
}

function pintarCatalogo() {
  const { texto = '', municipio = '', orden = 'disponible' } = Object.fromEntries(new FormData(filtros));
  const q = normalizar(texto.trim());
  const visibles = productos
    .filter((p) => !municipio || p.origen === municipio)
    .filter((p) => !q || [p.codigo, p.lote, p.nombre, p.origen].some((v) => normalizar(v).includes(q)))
    .sort((a, b) => (orden === 'nombre' ? a.nombre.localeCompare(b.nombre, 'es')
      : orden === 'lote' ? a.lote.localeCompare(b.lote) : b.cantidad_disponible - a.cantidad_disponible));

  resumen.textContent = productos.length
    ? `${visibles.length} de ${productos.length} ${productos.length === 1 ? 'producto' : 'productos'}`
    : '';

  if (!productos.length) {
    vaciar(lista, el('div', { class: 'vacio' }, el('h3', {}, 'Por ahora no hay cacao disponible'),
      el('p', {}, 'Cuando la asociación libere nuevos productos aparecerán aquí.')));
    return;
  }
  if (!visibles.length) {
    const limpiar = el('button', { class: 'boton boton--secundario boton--pequeno', type: 'button' }, 'Quitar filtros');
    limpiar.addEventListener('click', () => { filtros.reset(); pintarCatalogo(); });
    vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, 'Ningún producto coincide con la búsqueda.'), limpiar));
    return;
  }
  vaciar(lista, visibles.map(tarjeta));
}

async function cargarCatalogo() {
  try {
    productos = (await api('/publico/catalogo')).productos;
    const municipios = [...new Set(productos.map((p) => p.origen))].sort((a, b) => a.localeCompare(b, 'es'));
    const selector = document.getElementById('filtro-municipio');
    municipios.forEach((m) => selector.append(el('option', { value: m }, m)));

    const cifras = document.getElementById('cifras');
    contar(cifras.querySelector('[data-cifra="productos"]'), productos.length);
    contar(cifras.querySelector('[data-cifra="kilos"]'), productos.reduce((s, p) => s + p.cantidad_disponible, 0), 1);
    contar(cifras.querySelector('[data-cifra="municipios"]'), municipios.length);
    pintarCatalogo();
  } catch (error) {
    vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, error.message)));
  }
}
filtros.addEventListener('input', pintarCatalogo);
filtros.addEventListener('submit', (e) => e.preventDefault());

/* ---------- Acceso: pestañas ---------- */
const pestanas = {
  ingreso: [document.getElementById('pestana-ingreso'), document.getElementById('panel-ingreso')],
  registro: [document.getElementById('pestana-registro'), document.getElementById('panel-registro')],
};
function mostrarPestana(nombre, enfocar = false) {
  for (const [clave, [pestana, panel]] of Object.entries(pestanas)) {
    const activa = clave === nombre;
    pestana.setAttribute('aria-selected', String(activa));
    pestana.tabIndex = activa ? 0 : -1;
    panel.hidden = !activa;
  }
  if (enfocar) pestanas[nombre][1].querySelector('input')?.focus({ preventScroll: true });
}
for (const [clave, [pestana]] of Object.entries(pestanas)) {
  pestana.addEventListener('click', () => mostrarPestana(clave, true));
  pestana.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const otra = clave === 'ingreso' ? 'registro' : 'ingreso';
      mostrarPestana(otra);
      pestanas[otra][0].focus();
    }
  });
}
function segunAncla() {
  if (location.hash === '#registro') mostrarPestana('registro', true);
  else if (location.hash === '#acceso') mostrarPestana('ingreso', true);
}
window.addEventListener('hashchange', segunAncla);

/* ---------- Inicio de sesión único ---------- */
function formularioIngreso() {
  const boton = el('button', { class: 'boton', type: 'submit' }, 'Ingresar');
  const formulario = el('form', { class: 'formulario', novalidate: true },
    el('h3', { class: 'visualmente-oculto' }, 'Iniciar sesión'),
    campo({ etiqueta: 'Usuario', nombre: 'usuario', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' }),
    campo({ etiqueta: 'Contraseña', nombre: 'password', tipo: 'password', autocomplete: 'current-password' }),
    boton,
    el('p', { class: 'panel-acceso__nota' }, '¿Aún no tiene cuenta? ',
      el('a', { href: '#registro' }, 'Créela aquí'), ' para comprar.'));

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(formulario);
    await ocupado(boton, 'Ingresando…', async () => {
      try {
        const r = await api('/auth/login', { metodo: 'POST', datos: datosDe(formulario) });
        sesion.guardar(r);
        aviso(`Hola, ${r.usuario.nombre}.`, 'exito');
        location.href = espacioDe(r.usuario.rol);   // cada rol a su espacio
      } catch (error) {
        mostrarErrores(formulario, error);
      }
    });
  });
  return formulario;
}

/* ---------- Registro de compradores ---------- */
function formularioRegistro() {
  const boton = el('button', { class: 'boton', type: 'submit' }, 'Crear mi cuenta');
  const formulario = el('form', { class: 'formulario formulario--columnas', novalidate: true },
    el('h3', { class: 'visualmente-oculto' }, 'Crear cuenta de comprador'),
    campo({ etiqueta: 'Nombre completo', nombre: 'nombre', autocomplete: 'name', ancho: true, maxlength: 120 }),
    campo({ etiqueta: 'Cédula o NIT', nombre: 'documento', autocomplete: 'off', maxlength: 20 }),
    campo({ etiqueta: 'Ciudad o municipio', nombre: 'ciudad', autocomplete: 'address-level2', maxlength: 80 }),
    campo({ etiqueta: 'Correo', nombre: 'correo', tipo: 'email', autocomplete: 'email', maxlength: 120 }),
    campo({ etiqueta: 'Teléfono', nombre: 'telefono', tipo: 'tel', autocomplete: 'tel', maxlength: 20 }),
    campo({ etiqueta: 'Usuario', nombre: 'usuario', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false',
      ayuda: 'De 4 a 30 caracteres: minúsculas, números, punto o guion.', maxlength: 30 }),
    campo({ etiqueta: 'Contraseña', nombre: 'password', tipo: 'password', autocomplete: 'new-password',
      ayuda: 'Mínimo 8 caracteres, con letras y números.' }),
    campo({ etiqueta: 'Repita la contraseña', nombre: 'password_confirmation', tipo: 'password', autocomplete: 'new-password', ancho: true }),
    el('div', { class: 'campo--ancho panel-acceso__pie' },
      boton,
      el('p', { class: 'panel-acceso__nota' }, 'Su cuenta es de comprador. Las cuentas del personal las crea la asociación.')));

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(formulario);
    await ocupado(boton, 'Creando cuenta…', async () => {
      try {
        const r = await api('/auth/registro', { metodo: 'POST', datos: datosDe(formulario) });
        sesion.guardar(r);
        aviso(r.mensaje, 'exito');
        location.href = espacioDe(r.usuario.rol);
      } catch (error) {
        mostrarErrores(formulario, error);
      }
    });
  });
  return formulario;
}

vaciar(document.getElementById('panel-ingreso'), formularioIngreso());
vaciar(document.getElementById('panel-registro'), formularioRegistro());

/* ---------- Aparición de secciones al bajar ---------- */
const observador = 'IntersectionObserver' in window
  ? new IntersectionObserver((entradas) => entradas.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('visible'); observador.unobserve(en.target); }
  }), { threshold: 0.12 })
  : null;
document.querySelectorAll('.sitio-seccion').forEach((s) => (observador ? observador.observe(s) : s.classList.add('visible')));

segunAncla();
cargarCatalogo();
