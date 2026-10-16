// Captura sin conexión y cola de sincronización.
//  - capturar(): guarda en IndexedDB (sincronizado: 0) un cambio que no se pudo enviar y devuelve
//    una respuesta con la misma forma que la del servidor, para que la pantalla siga igual.
//  - sincronizar(): envía en lote (POST /api/sincronizar) todo lo pendiente, en orden, y guarda los ids reales.
//    Se ejecuta al volver la conexión (evento `online`), al abrir la app y cada minuto mientras haya pendientes.
import { sesion } from '../sesion.js';
import { db, esTemporal, idTemporal, PENDIENTE, siguienteOrden, SINCRONIZADO, TABLAS } from './db.js';
import { alertasLocales, detalleDeLote, loteLocal, mermaLocal } from './lecturas.js';

const TAMANO_LOTE = 50; // operaciones por envío
const REFERENCIAS = ['id', 'lote_id', 'entrada_producto_id', 'producto_id'];

/** Rutas de la API cuyos cambios se pueden capturar sin conexión. */
const CAPTURABLES = [
  { metodo: 'POST', patron: /^\/lotes$/, entidad: 'lote', accion: 'CREATE' },
  { metodo: 'POST', patron: /^\/transformaciones$/, entidad: 'transformacion', accion: 'CREATE' },
  { metodo: 'POST', patron: /^\/lotes\/([^/]+)\/estado$/, entidad: 'lote', accion: 'UPDATE' },
  { metodo: 'POST', patron: /^\/productos\/([^/]+)\/estado$/, entidad: 'producto', accion: 'UPDATE' },
  { metodo: 'PATCH', patron: /^\/productos\/([^/]+)\/precio$/, entidad: 'producto', accion: 'UPDATE' },
  { metodo: 'POST', patron: /^\/solicitudes$/, entidad: 'solicitud', accion: 'CREATE' },
  { metodo: 'POST', patron: /^\/solicitudes\/(\d+)\/respuesta$/, entidad: 'solicitud', accion: 'UPDATE' },
];

export function esCapturable(metodo, ruta) {
  for (const c of CAPTURABLES) {
    const m = c.metodo === metodo && ruta.match(c.patron);
    if (m) return { entidad: c.entidad, accion: c.accion, id: m[1] ? decodeURIComponent(m[1]).toUpperCase() : null };
  }
  return null;
}

function avisarCambio() {
  window.dispatchEvent(new CustomEvent('kakawa:cola'));
}

// ---------- Validación local (los mismos mensajes que el servidor) ----------

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const esNumero = (v) => v !== undefined && v !== '' && Number.isFinite(Number(v));

async function validarLocal(entidad, accion, d) {
  const e = {};
  const exigir = (campo, mensaje) => { if (d[campo] === undefined || d[campo] === '') e[campo] = [mensaje]; };
  const fecha = (campo) => {
    if (d[campo] && !/^\d{4}-\d{2}-\d{2}$/.test(d[campo])) e[campo] = ['La fecha debe tener el formato AAAA-MM-DD.'];
    else if (d[campo] && d[campo] > hoy()) e[campo] = ['La fecha no puede ser futura.'];
  };

  if (entidad === 'lote' && accion === 'CREATE') {
    exigir('productor', 'Indique el productor.');
    exigir('origen', 'Indique el origen (municipio o finca).');
    exigir('fecha_recepcion', 'Indique la fecha de recepción.');
    fecha('fecha_recepcion');
    if (!esNumero(d.cantidad_recibida) || Number(d.cantidad_recibida) <= 0) e.cantidad_recibida = ['La cantidad recibida debe ser mayor que cero.'];
  }

  if (entidad === 'transformacion') {
    exigir('lote_id', 'Seleccione el lote.');
    exigir('etapa', 'Indique la etapa (ej. fermentación, secado).');
    exigir('responsable', 'Indique el responsable.');
    exigir('fecha', 'Indique la fecha.');
    fecha('fecha');
    const entrada = Number(d.cantidad_entrada);
    const salida = Number(d.cantidad_salida);
    if (!esNumero(d.cantidad_entrada) || entrada <= 0) e.cantidad_entrada = ['La cantidad de entrada debe ser mayor que cero.'];
    if (!esNumero(d.cantidad_salida) || salida < 0) e.cantidad_salida = ['La cantidad de salida no puede ser negativa.'];
    if (!e.cantidad_entrada && !e.cantidad_salida && salida > entrada && !d.insumos_agregados) {
      e.insumos_agregados = ['Una salida mayor que la entrada requiere registrar los insumos agregados.'];
    }

    // Inventario (RF08) con la copia local: no se puede consumir más de lo disponible ni un lote bloqueado.
    if (!e.cantidad_entrada && d.lote_id) {
      const detalle = await detalleDeLote(d.lote_id);
      if (detalle) {
        const origen = d.entrada_producto_id ? detalle.productos.find((p) => p.id === d.entrada_producto_id) : detalle.inventario;
        if (detalle.lote.estado === 'bloqueado') e.lote_id = [`El lote ${d.lote_id} está bloqueado; no se puede transformar.`];
        else if (origen && entrada > origen.disponible + 0.0005) {
          e.cantidad_entrada = [`Existencia insuficiente: disponible ${origen.disponible} kg, solicitado ${entrada} kg.`];
        }
        if (d.fecha && detalle.lote.fecha_recepcion && d.fecha < detalle.lote.fecha_recepcion) {
          e.fecha = [`La fecha de la transformación no puede ser anterior a la recepción del lote (${detalle.lote.fecha_recepcion}).`];
        }
      }
    }
  }

  if (accion === 'UPDATE' && (entidad === 'lote' || entidad === 'producto') && d.precio_venta === undefined) {
    if (!['liberado', 'bloqueado'].includes(d.estado)) e.estado = ['El estado debe ser "liberado" o "bloqueado".'];
    if (!d.motivo) e.motivo = ['El motivo es obligatorio para liberar o bloquear.'];
    else if (d.motivo.length < 5) e.motivo = ['Explique el motivo con al menos 5 caracteres.'];
  }
  if (entidad === 'producto' && d.precio_venta !== undefined && (!esNumero(d.precio_venta) || Number(d.precio_venta) <= 0)) {
    e.precio_venta = ['El precio debe ser mayor que cero.'];
  }

  if (entidad === 'solicitud' && accion === 'CREATE') {
    exigir('producto_id', 'Indique el producto.');
    if (!esNumero(d.cantidad) || Number(d.cantidad) <= 0) e.cantidad = ['La cantidad debe ser mayor que cero.'];
  }
  if (entidad === 'solicitud' && accion === 'UPDATE') {
    if (!['aceptada', 'rechazada'].includes(d.estado)) e.estado = ['La respuesta debe ser aceptada o rechazada.'];
    if (d.estado === 'rechazada' && !d.respuesta) e.respuesta = ['Explique al comprador por qué se rechaza.'];
  }

  return Object.keys(e).length ? e : null;
}

// ---------- Captura ----------

/**
 * Guarda un cambio sin conexión.
 * @returns {Promise<{respuesta?: object, errores?: object, mensaje?: string}>}
 */
export async function capturar({ entidad, accion, id }, datosOriginales) {
  const usuario = sesion.usuario();
  if (!usuario) return { errores: {}, mensaje: 'Inicie sesión para guardar cambios sin conexión.' };

  const datos = structuredClone(datosOriginales ?? {});
  for (const campo of ['lote_id', 'entrada_producto_id', 'producto_id']) {
    if (typeof datos[campo] === 'string') datos[campo] = datos[campo].trim().toUpperCase();
  }
  if (id) datos.id = id;

  const errores = await validarLocal(entidad, accion, datos);
  if (errores) return { errores, mensaje: 'Revise los datos marcados.' };

  const temporal = idTemporal();
  // La transformación conserva el operacion_id de la pantalla: si el servidor alcanzó a registrarla,
  // al sincronizar responde "repetida" y no consume dos veces.
  if (entidad === 'transformacion' && !datos.operacion_id) datos.operacion_id = temporal;

  const fila = {
    clave: temporal,
    id: accion === 'CREATE' ? null : datos.id,
    id_temporal: temporal,
    accion,
    sincronizado: PENDIENTE,
    estado_sync: 'pendiente',
    datos,
    lote_id: datos.lote_id ?? null,
    usuario_id: usuario.id,
    orden: siguienteOrden(),
    creado_en: new Date().toISOString(),
    error: null,
  };
  await db[TABLAS[entidad]].add(fila);
  avisarCambio();

  // Si el navegador cree que hay red (p. ej. el servidor se cayó un momento), se intenta enseguida.
  if (navigator.onLine) setTimeout(() => sincronizar(), 1500);

  return { respuesta: await respuestaLocal(entidad, accion, fila) };
}

/** Respuesta con la forma de la API, marcada con `pendiente: true`. */
async function respuestaLocal(entidad, accion, fila) {
  const mensaje = 'Sin conexión: quedó guardado en este equipo y se enviará al volver la conexión.';
  const d = fila.datos;

  if (entidad === 'lote' && accion === 'CREATE') {
    return { mensaje: `Sin conexión: el lote quedó guardado en este equipo (${fila.id_temporal}) y se enviará al volver la conexión.`,
      pendiente: true, lote: loteLocal(fila) };
  }

  if (entidad === 'transformacion') {
    const entrada = Number(d.cantidad_entrada);
    const salida = Number(d.cantidad_salida);
    const merma = mermaLocal(entrada, salida, d.insumos_agregados);
    const detalle = await detalleDeLote(d.lote_id);
    const origen = d.entrada_producto_id
      ? detalle?.productos.find((p) => p.id === d.entrada_producto_id)
      : detalle?.inventario;
    return {
      mensaje: 'Sin conexión: la transformación quedó guardada en este equipo. El código del producto se asigna al sincronizar.',
      pendiente: true,
      repetida: false,
      transformacion: {
        operacion_id: d.operacion_id, lote_id: d.lote_id, entrada_desde: d.entrada_producto_id || d.lote_id,
        producto_id: fila.id_temporal, etapa: d.etapa, responsable: d.responsable, fecha: d.fecha,
        cantidad_entrada: entrada, cantidad_salida: salida, unidad: 'kg',
        insumos_agregados: d.insumos_agregados ?? null, incidencias: d.incidencias ?? null,
      },
      disponible_restante: origen?.disponible ?? null,
      analisis: { merma, alertas: alertasLocales(merma), economico: null },
    };
  }

  return { mensaje, pendiente: true };
}

// ---------- Consulta de la cola ----------

/** Todos los cambios locales del usuario actual, del más antiguo al más reciente. */
export async function cambiosLocales() {
  const uid = sesion.usuario()?.id;
  const filas = [];
  for (const [entidad, tabla] of Object.entries(TABLAS)) {
    const deTabla = await db[tabla].where('usuario_id').equals(uid ?? -1).filter((f) => f.accion !== null).toArray()
      .catch(() => []);
    deTabla.forEach((f) => filas.push({ ...f, entidad, tabla }));
  }
  return filas.sort((a, b) => a.orden - b.orden);
}

/** Cuántos cambios esperan envío y cuántos rechazó el servidor. */
export async function resumenCola() {
  try {
    const sinEnviar = (await cambiosLocales()).filter((f) => f.sincronizado === PENDIENTE);
    return {
      pendientes: sinEnviar.filter((f) => f.estado_sync !== 'rechazada').length,
      rechazadas: sinEnviar.filter((f) => f.estado_sync === 'rechazada').length,
    };
  } catch {
    return { pendientes: 0, rechazadas: 0 };
  }
}

/** Descarta un cambio local que no llegó al servidor (equivale a un DELETE local: nunca se envía). */
export async function descartar(tabla, clave) {
  await db[tabla].where('clave').equals(clave).filter((f) => f.sincronizado === PENDIENTE).delete();
  avisarCambio();
}

/** Vuelve a poner en la cola un cambio rechazado (p. ej. después de corregir el inventario). */
export async function reintentar(tabla, clave) {
  await db[tabla].update(clave, { estado_sync: 'pendiente', error: null });
  avisarCambio();
  return sincronizar();
}

// ---------- Sincronización ----------

let enCurso = null;

/** Envía la cola. Si ya hay un envío en curso, devuelve ese mismo. */
export function sincronizar() {
  if (!enCurso) enCurso = enviarCola().finally(() => { enCurso = null; });
  return enCurso;
}

export const sincronizando = () => enCurso !== null;

async function pendientesParaEnviar(uid) {
  const filas = [];
  for (const [entidad, tabla] of Object.entries(TABLAS)) {
    const deTabla = await db[tabla].where('sincronizado').equals(PENDIENTE)
      .filter((f) => f.usuario_id === uid && f.estado_sync === 'pendiente').toArray();
    deTabla.forEach((f) => filas.push({ fila: f, entidad, tabla }));
  }
  return filas.sort((a, b) => a.fila.orden - b.fila.orden);
}

/** Cambia TMP-… por el id real en los cambios que siguen pendientes (para que las pantallas cuadren). */
async function traducirReferencias(mapa) {
  if (!Object.keys(mapa).length) return;
  for (const tabla of Object.values(TABLAS)) {
    const filas = await db[tabla].where('sincronizado').equals(PENDIENTE).toArray();
    for (const f of filas) {
      let cambio = false;
      for (const campo of REFERENCIAS) {
        const v = f.datos[campo];
        if (esTemporal(v) && mapa[v]) { f.datos[campo] = mapa[v]; cambio = true; }
      }
      if (esTemporal(f.id) && mapa[f.id]) { f.id = mapa[f.id]; cambio = true; }
      if (cambio) await db[tabla].put({ ...f, lote_id: f.datos.lote_id ?? null });
    }
  }
}

async function enviarCola() {
  const resumen = { aplicadas: 0, rechazadas: 0, reintentar: 0, mapa: {} };
  const usuario = sesion.usuario();
  if (!usuario || !sesion.token() || !navigator.onLine) return resumen;

  window.dispatchEvent(new CustomEvent('kakawa:sincronizando'));
  try {
    for (;;) {
      const tanda = (await pendientesParaEnviar(usuario.id)).slice(0, TAMANO_LOTE);
      if (!tanda.length) break;

      let respuesta;
      try {
        respuesta = await fetch('/api/sincronizar', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token()}` },
          body: JSON.stringify({
            operaciones: tanda.map(({ fila, entidad }) => ({
              id_temporal: fila.id_temporal, entidad, accion: fila.accion, datos: fila.datos, creado_en: fila.creado_en,
            })),
          }),
        });
      } catch {
        break; // sin conexión otra vez: se reintenta luego
      }

      if (respuesta.status === 401) {
        // Token vencido: los cambios se conservan y se envían cuando el usuario vuelva a iniciar sesión.
        await sesion.cerrar();
        window.dispatchEvent(new CustomEvent('kakawa:sesion-vencida'));
        break;
      }
      if (!respuesta.ok) break; // 5xx o 429: se reintenta más tarde

      const { resultados } = await respuesta.json();
      const ahora = new Date().toISOString();
      let hayQueReintentar = false;

      for (const r of resultados) {
        const item = tanda.find((x) => x.fila.id_temporal === r.id_temporal);
        if (!item) continue;
        const { fila, tabla } = item;

        if (r.estado === 'aplicada') {
          resumen.aplicadas += 1;
          if (r.id_real) resumen.mapa[fila.id_temporal] = r.id_real;
          await db[tabla].update(fila.clave, {
            sincronizado: SINCRONIZADO, estado_sync: 'aplicada', id: r.id_real ?? fila.id,
            sincronizado_en: ahora, repetida: Boolean(r.repetida), error: null,
          });
        } else if (r.estado === 'rechazada') {
          resumen.rechazadas += 1;
          await db[tabla].update(fila.clave, {
            estado_sync: 'rechazada', error: { codigo: r.codigo, mensaje: r.mensaje, errores: r.errores ?? null },
          });
        } else {
          resumen.reintentar += 1;
          hayQueReintentar = true;
        }
      }
      await traducirReferencias(resumen.mapa);
      if (hayQueReintentar) break; // falla temporal del servidor: no insistir en bucle
    }
  } finally {
    avisarCambio();
    window.dispatchEvent(new CustomEvent('kakawa:sincronizado', { detail: resumen }));
  }
  return resumen;
}

// ---------- Disparadores ----------
window.addEventListener('online', () => sincronizar());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine) sincronizar();
});
setInterval(async () => {
  if (navigator.onLine && sesion.activa() && (await resumenCola()).pendientes > 0) sincronizar();
}, 60_000);
