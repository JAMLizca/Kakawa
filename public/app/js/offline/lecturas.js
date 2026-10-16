// Consultas sin conexión: guarda la última respuesta de cada GET y, sin conexión, la devuelve
// con los cambios pendientes ya aplicados (lotes nuevos, transformaciones, bloqueos, precios, solicitudes).
// Así lo que el usuario registró sin conexión aparece de inmediato en las pantallas de siempre.
import { sesion } from '../sesion.js';
import { db, PENDIENTE, SINCRONIZADO } from './db.js';

/** Umbral de merma por defecto del servidor (config kakawa.umbral_merma). Solo para el cálculo local. */
export const UMBRAL_MERMA = 15;

const NO_GUARDAR = [/^\/auth\//, /^\/exportar\//, /^\/sincronizar/];
const PUBLICAS = [/^\/publico\//];

const redondear = (n) => Math.round(n * 1000) / 1000;
const numero = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

export function esLeible(ruta) {
  return !NO_GUARDAR.some((r) => r.test(ruta));
}

function usuarioDe(ruta) {
  return PUBLICAS.some((r) => r.test(ruta)) ? 0 : (sesion.usuario()?.id ?? -1);
}

const claveDe = (ruta) => `${usuarioDe(ruta)}|${ruta}`;

/** Cambios hechos sin conexión que siguen pendientes (los rechazados no cuentan: no ocurrieron). */
export async function pendientes(tabla) {
  const uid = sesion.usuario()?.id;
  if (uid === undefined) return [];
  const filas = await db[tabla].where('sincronizado').equals(PENDIENTE).toArray();
  return filas
    .filter((f) => f.usuario_id === uid && f.estado_sync !== 'rechazada')
    .sort((a, b) => a.orden - b.orden);
}

// ---------- Guardar ----------

/** Guarda la respuesta de un GET exitoso. La lista de lotes además llena la tabla `lotes`. */
export async function guardarLectura(ruta, datos) {
  if (!esLeible(ruta)) return;
  const uid = usuarioDe(ruta);
  try {
    await db.lecturas.put({ clave: claveDe(ruta), usuario_id: uid, ruta, datos, guardada_en: Date.now() });

    if (/^\/lotes(\?|$)/.test(ruta) && Array.isArray(datos?.lotes)) {
      const filas = datos.lotes.map((l) => ({
        clave: l.id, id: l.id, id_temporal: null, accion: null, sincronizado: SINCRONIZADO,
        usuario_id: uid, datos: l, guardado_en: Date.now(),
      }));
      await db.transaction('rw', db.lotes, async () => {
        // La lista sin filtros es la foto completa: reemplaza las copias anteriores.
        if (!ruta.includes('?')) {
          await db.lotes.where('sincronizado').equals(SINCRONIZADO).filter((f) => f.accion === null).delete();
        }
        await db.lotes.bulkPut(filas);
      });
    }
  } catch {
    /* almacenamiento lleno o bloqueado: la app sigue funcionando con conexión */
  }
}

// ---------- Leer sin conexión ----------

/**
 * Respuesta local para un GET. Devuelve null si no hay nada guardado.
 * Las respuestas llevan `sin_conexion: true` y `guardada_en`.
 */
export async function leerLectura(ruta) {
  if (/^\/lotes(\?|$)/.test(ruta)) return listaDeLotes(ruta);

  const detalle = ruta.match(/^\/lotes\/([^/?]+)$/);
  if (detalle) return detalleDeLote(decodeURIComponent(detalle[1]).toUpperCase());

  const guardada = await db.lecturas.get(claveDe(ruta));
  if (/^\/mis-solicitudes$/.test(ruta)) return misSolicitudes(guardada);
  if (/^\/solicitudes(\?|$)/.test(ruta)) return solicitudesAdmin(guardada);
  if (!guardada) return null;
  return { ...structuredClone(guardada.datos), sin_conexion: true, guardada_en: guardada.guardada_en };
}

/** Resumen de un lote creado sin conexión, con la forma de GET /lotes. */
export function loteLocal(fila) {
  const d = fila.datos;
  const kg = numero(d.cantidad_recibida) ?? 0;
  return {
    id: fila.id_temporal,
    productor: d.productor ?? '',
    origen: d.origen ?? '',
    fecha_recepcion: d.fecha_recepcion ?? null,
    descripcion: d.descripcion ?? null,
    recibido: kg,
    consumido: 0,
    disponible: kg,
    unidad: d.unidad ?? 'kg',
    estado: 'pendiente',
    motivo_estado: null,
    pendiente_sync: true,
  };
}

async function listaDeLotes(ruta) {
  const uid = sesion.usuario()?.id;
  const copias = (await db.lotes.where('sincronizado').equals(SINCRONIZADO).toArray())
    .filter((f) => f.accion === null && f.usuario_id === uid);
  const nuevos = (await pendientes('lotes')).filter((f) => f.accion === 'CREATE');
  if (!copias.length && !nuevos.length) return null;

  const lotes = [...copias.map((f) => structuredClone(f.datos)), ...nuevos.map(loteLocal)];

  // Consumo de las transformaciones pendientes que toman cacao directo del lote.
  for (const t of await pendientes('transformaciones')) {
    if (t.datos.entrada_producto_id) continue;
    const l = lotes.find((x) => x.id === t.datos.lote_id);
    if (!l) continue;
    const kg = numero(t.datos.cantidad_entrada) ?? 0;
    l.consumido = redondear(l.consumido + kg);
    l.disponible = redondear(l.disponible - kg);
  }
  // Cambios de estado pendientes.
  for (const u of (await pendientes('lotes')).filter((f) => f.accion === 'UPDATE')) {
    const l = lotes.find((x) => x.id === u.id);
    if (l) Object.assign(l, { estado: u.datos.estado, motivo_estado: u.datos.motivo, pendiente_sync: true });
  }

  const p = new URLSearchParams(ruta.split('?')[1] ?? '');
  const origen = p.get('origen');
  const estado = p.get('estado');
  const filtrados = lotes
    .filter((l) => !origen || l.origen === origen)
    .filter((l) => !estado || l.estado === estado)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    filtros: { origen, estado },
    total: filtrados.length,
    lotes: filtrados,
    origenes: [...new Set(lotes.map((l) => l.origen))].sort((a, b) => a.localeCompare(b, 'es')),
    sin_conexion: true,
  };
}

/** Merma calculada en el equipo (el servidor la recalcula al sincronizar). */
export function mermaLocal(entrada, salida, insumos) {
  if (salida > entrada && insumos) {
    return { aplica: false, valor: null, umbral: UMBRAL_MERMA,
      explicacion: 'La salida supera la entrada por los insumos agregados: la merma no aplica.' };
  }
  const valor = entrada > 0 ? Math.round(((entrada - salida) / entrada) * 10000) / 100 : 0;
  return { aplica: true, valor, umbral: UMBRAL_MERMA,
    explicacion: `(${entrada} − ${salida}) ÷ ${entrada} × 100 = ${valor} %. Calculada en este equipo; se confirma al sincronizar.` };
}

export function alertasLocales(merma) {
  return merma.aplica && merma.valor > merma.umbral
    ? [{ tipo: 'merma', causa: `Merma de ${merma.valor} %, mayor al umbral de ${merma.umbral} % (calculada sin conexión).`,
      regla: `Merma > ${merma.umbral} % de la entrada` }]
    : [];
}

function detalleDeLoteNuevo(fila) {
  const l = loteLocal(fila);
  return {
    lote: { id: l.id, productor: l.productor, origen: l.origen, fecha_recepcion: l.fecha_recepcion,
      cantidad_recibida: l.recibido, unidad: l.unidad, descripcion: l.descripcion, estado: 'pendiente',
      motivo_estado: null, registrado_por: sesion.usuario()?.usuario ?? null, pendiente_sync: true },
    inventario: { recibido: l.recibido, consumido: 0, disponible: l.recibido, unidad: l.unidad },
    etapas: [],
    productos: [],
    afectacion: null,
  };
}

/** Detalle de un lote (forma de GET /lotes/{id}) con los cambios pendientes aplicados. */
export async function detalleDeLote(loteId) {
  const guardada = await db.lecturas.get(claveDe(`/lotes/${encodeURIComponent(loteId)}`));
  let d = guardada ? structuredClone(guardada.datos) : null;
  if (!d) {
    const nuevo = (await pendientes('lotes')).find((f) => f.accion === 'CREATE' && f.id_temporal === loteId);
    if (!nuevo) return null;
    d = detalleDeLoteNuevo(nuevo);
  }

  // Transformaciones pendientes de este lote, en el orden en que se capturaron.
  for (const t of (await pendientes('transformaciones')).filter((f) => f.datos.lote_id === d.lote.id)) {
    const x = t.datos;
    const entrada = numero(x.cantidad_entrada) ?? 0;
    const salida = numero(x.cantidad_salida) ?? 0;
    const desde = x.entrada_producto_id || d.lote.id;

    if (x.entrada_producto_id) {
      const p = d.productos.find((y) => y.id === x.entrada_producto_id);
      if (p) Object.assign(p, { consumido: redondear((p.consumido ?? 0) + entrada), disponible: redondear(p.disponible - entrada) });
    } else {
      d.inventario.consumido = redondear(d.inventario.consumido + entrada);
      d.inventario.disponible = redondear(d.inventario.disponible - entrada);
    }

    const merma = mermaLocal(entrada, salida, x.insumos_agregados);
    d.etapas.push({
      operacion_id: x.operacion_id, etapa: x.etapa, responsable: x.responsable, fecha: x.fecha,
      entrada_desde: desde, cantidad_entrada: entrada, producto_salida: t.id_temporal, cantidad_salida: salida,
      unidad: 'kg', insumos_agregados: x.insumos_agregados ?? null, incidencias: x.incidencias ?? null,
      merma, alertas: alertasLocales(merma), economico: null, pendiente_sync: true,
    });
    d.productos.push({
      id: t.id_temporal, nombre: x.producto_nombre || `${x.etapa} de ${d.lote.id}`, cantidad: salida,
      consumido: 0, disponible: salida, unidad: 'kg', precio_venta: numero(x.precio_venta),
      estado: 'pendiente', motivo_estado: null, pendiente_sync: true,
    });
  }

  // Bloqueos y liberaciones pendientes (bloquear el lote bloquea sus productos, como en el servidor).
  for (const u of (await pendientes('lotes')).filter((f) => f.accion === 'UPDATE' && f.id === d.lote.id)) {
    Object.assign(d.lote, { estado: u.datos.estado, motivo_estado: u.datos.motivo });
    if (u.datos.estado === 'bloqueado') {
      d.productos.forEach((p) => { if (p.estado !== 'bloqueado') Object.assign(p, { estado: 'bloqueado', motivo_estado: `Bloqueo del lote ${d.lote.id}: ${u.datos.motivo}` }); });
    }
  }
  for (const u of (await pendientes('productos')).filter((f) => f.accion === 'UPDATE')) {
    const p = d.productos.find((y) => y.id === u.id);
    if (!p) continue;
    if (u.datos.precio_venta !== undefined) p.precio_venta = numero(u.datos.precio_venta);
    if (u.datos.estado) Object.assign(p, { estado: u.datos.estado, motivo_estado: u.datos.motivo });
  }

  d.afectacion = {
    disponible_en_lote: d.inventario.disponible,
    productos_total: redondear(d.productos.reduce((s, p) => s + p.cantidad, 0)),
    productos_disponible: redondear(d.productos.reduce((s, p) => s + p.disponible, 0)),
    productos_bloqueados: d.productos.filter((p) => p.estado === 'bloqueado').map((p) => p.id),
    unidad: d.lote.unidad,
  };
  d.sin_conexion = true;
  d.guardada_en = guardada?.guardada_en ?? null;
  return d;
}

async function misSolicitudes(guardada) {
  const nuevas = (await pendientes('solicitudes')).filter((f) => f.accion === 'CREATE');
  if (!guardada && !nuevas.length) return null;
  const base = guardada ? structuredClone(guardada.datos.solicitudes) : [];
  const locales = nuevas.reverse().map((f) => ({
    id: f.id_temporal, producto_id: f.datos.producto_id, producto: f.datos.producto_nombre ?? null,
    cantidad: numero(f.datos.cantidad), unidad: 'kg', mensaje: f.datos.mensaje ?? null,
    estado: 'pendiente', respuesta: null, creada: f.creado_en, atendida: null, pendiente_sync: true,
  }));
  return { solicitudes: [...locales, ...base], sin_conexion: true };
}

async function solicitudesAdmin(guardada) {
  if (!guardada) return null;
  const datos = structuredClone(guardada.datos);
  for (const u of (await pendientes('solicitudes')).filter((f) => f.accion === 'UPDATE')) {
    const s = datos.solicitudes.find((x) => String(x.id) === String(u.id));
    if (s) Object.assign(s, { estado: u.datos.estado, respuesta: u.datos.respuesta ?? null, pendiente_sync: true });
  }
  return { ...datos, sin_conexion: true, guardada_en: guardada.guardada_en };
}
