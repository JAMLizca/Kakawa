export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);

  for (const [clave, valor] of Object.entries(atributos ?? {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'text') nodo.textContent = valor;
    else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
    else if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    else if (valor === true) nodo.setAttribute(clave, '');
    else nodo.setAttribute(clave, String(valor));
  }

  agregar(nodo, hijos);
  return nodo;
}

function agregar(nodo, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

export function vaciar(nodo, ...hijos) {
  nodo.replaceChildren();
  agregar(nodo, hijos);
  return nodo;
}

const fNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const fCop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fPct = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const fFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fFechaHora = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export const formato = {
  numero: (n) => (n === null || n === undefined ? '—' : fNumero.format(n)),
  kg: (n, unidad = 'kg') => (n === null || n === undefined ? '—' : `${fNumero.format(n)} ${unidad}`),
  cop: (n) => (n === null || n === undefined ? '—' : fCop.format(n)),
  pct: (n) => (n === null || n === undefined ? '—' : `${fPct.format(n)} %`),
  fecha: (iso) => (iso ? fFecha.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '—'),
  fechaHora: (iso) => (iso ? fFechaHora.format(new Date(iso.replace(' ', 'T'))) : '—'),
};

export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Coponentes pequeños
const ETIQUETAS_ESTADO = { pendiente: 'Pendiente', liberado: 'Liberado', bloqueado: 'Bloqueado' };

export function insignia(estado) {
  return el('span', { class: `insignia insignia--${estado}` }, ETIQUETAS_ESTADO[estado] ?? estado);
}

let contadorCampos = 0;

/** Campo de formulario*/
export function campo({ etiqueta, nombre, tipo = 'text', opcional = false, ayuda, opciones, ancho = false, ...atributos }) {
  const id = `campo-${nombre}-${++contadorCampos}`;
  const idAyuda = ayuda ? `${id}-ayuda` : null;

  let control;
  if (tipo === 'select') {
    control = el('select', { id, name: nombre, required: !opcional, 'aria-describedby': idAyuda, ...atributos },
      (opciones ?? []).map(([valor, texto]) => el('option', { value: valor }, texto)));
  } else if (tipo === 'textarea') {
    control = el('textarea', { id, name: nombre, required: !opcional, 'aria-describedby': idAyuda, ...atributos });
  } else {
    control = el('input', { id, name: nombre, type: tipo, required: !opcional, 'aria-describedby': idAyuda, ...atributos });
  }

  return el('div', { class: `campo${ancho ? ' campo--ancho' : ''}` },
    el('label', { for: id }, etiqueta, opcional ? el('span', { class: 'campo__opcional' }, ' (opcional)') : null),
    control,
    ayuda ? el('p', { class: 'campo__ayuda', id: idAyuda }, ayuda) : null,
  );
}

/** Lee un formulario como objeto; los campos vacíos se ommiten. */
export function datosDe(formulario) {
  const datos = {};
  for (const [clave, valor] of new FormData(formulario).entries()) {
    const texto = String(valor).trim();
    if (texto !== '') datos[clave] = texto;
  }
  return datos;
}

export function limpiarErrores(formulario) {
  formulario.querySelectorAll('.campo__error').forEach((n) => n.remove());
  formulario.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
    control.removeAttribute('aria-invalid');
    const ayuda = control.getAttribute('aria-describedby')?.split(' ').filter((id) => !id.endsWith('-error')).join(' ');
    if (ayuda) control.setAttribute('aria-describedby', ayuda);
    else control.removeAttribute('aria-describedby');
  });
  const general = formulario.querySelector('.error-formulario');
  if (general) general.textContent = '';
}

/** Muestra el mensaje general y marca cada campo que el servidor rechazó. */
export function mostrarErrores(formulario, error) {
  limpiarErrores(formulario);

  let general = formulario.querySelector('.error-formulario');
  if (!general) {
    general = el('div', { class: 'error-formulario', role: 'alert', tabindex: '-1' });
    const encabezado = formulario.querySelector('h1, h2');
    if (encabezado) encabezado.after(general);
    else formulario.prepend(general);
  }
  general.textContent = error.message;

  let primero = null;
  for (const [nombre, mensajes] of Object.entries(error.errores ?? {})) {
    const control = formulario.elements.namedItem(nombre);
    if (!(control instanceof Element)) continue;

    const idError = `${control.id}-error`;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), idError].filter(Boolean).join(' '));
    control.closest('.campo')?.append(el('p', { class: 'campo__error', id: idError }, mensajes[0]));
    primero ??= control;
  }

  (primero ?? general).focus();
}

/** Desactiva el botón mientras la petición está en curso (esto evita doble envios). */
export async function ocupado(boton, textoMientras, tarea) {
  const original = boton.textContent;
  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  boton.textContent = textoMientras;
  try {
    return await tarea();
  } finally {
    boton.disabled = false;
    boton.removeAttribute('aria-busy');
    boton.textContent = original;
  }
}


export function aviso(mensaje, tipo = 'info') {
  const contenedor = document.getElementById('avisos');
  if (!contenedor) return;
  const nodo = el('div', { class: `aviso aviso--${tipo}` }, mensaje);
  contenedor.append(nodo);
  setTimeout(() => nodo.remove(), tipo === 'error' ? 8000 : 5000);
}

export function titulo(texto) {
  document.title = texto ? `${texto} | Kakawa` : 'Kakawa';
}
