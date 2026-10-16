// Base de datos local de Kakawa (IndexedDB con Dexie.js). Sobrevive al cierre del navegador.
//
// Tablas de entidades (lotes, transformaciones, productos, solicitudes). Cada fila es una de dos cosas:
//  - Copia del servidor: { clave: 'CAC001', id: 'CAC001', accion: null, sincronizado: 1, datos }
//    Sirve para consultar sin conexión.
//  - Cambio hecho sin conexión: { clave: 'TMP-…', id_temporal: 'TMP-…', accion: 'CREATE'|'UPDATE'|'DELETE',
//    sincronizado: 0, estado_sync: 'pendiente'|'rechazada', datos, orden }. Al sincronizar pasa a
//    sincronizado: 1 y guarda el id real (CAC004, CAC004-P01, 12…).
//
// `sincronizado` se guarda como 0/1 y no como true/false: IndexedDB no puede indexar booleanos.
// `lecturas` guarda la última respuesta de cada consulta GET (detalle de lote, alertas…) por usuario.
import Dexie from '../../vendor/dexie.mjs';

export const db = new Dexie('kakawa');

db.version(1).stores({
  sesion: '&clave',
  lotes: '&clave, id, id_temporal, sincronizado, accion, usuario_id, orden',
  transformaciones: '&clave, id, id_temporal, lote_id, sincronizado, accion, usuario_id, orden',
  productos: '&clave, id, id_temporal, sincronizado, accion, usuario_id, orden',
  solicitudes: '&clave, id, id_temporal, sincronizado, accion, usuario_id, orden',
  lecturas: '&clave, usuario_id, guardada_en',
});

export const PENDIENTE = 0;
export const SINCRONIZADO = 1;

/** Entidad de la API → tabla local. */
export const TABLAS = {
  lote: 'lotes',
  transformacion: 'transformaciones',
  producto: 'productos',
  solicitud: 'solicitudes',
};

/**
 * Identificador temporal de lo creado sin conexión: TMP- + 12 caracteres hexadecimales en mayúscula.
 * Usa getRandomValues (disponible también por http://IP, donde crypto.randomUUID no existe).
 * Va en mayúsculas porque el enrutador convierte a mayúsculas los ids de la dirección (#/lotes/TMP-…).
 */
export function idTemporal() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `TMP-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export const esTemporal = (valor) => typeof valor === 'string' && valor.toUpperCase().startsWith('TMP-');

// Orden de captura: la cola se envía en el mismo orden en que se registró (el lote antes que su transformación).
let ultimoOrden = 0;
export function siguienteOrden() {
  ultimoOrden = Math.max(Date.now() * 1000, ultimoOrden + 1);
  return ultimoOrden;
}

/**
 * Al cerrar sesión: borra las copias del servidor y las lecturas guardadas (pueden tener costos),
 * pero conserva los cambios que todavía no se enviaron (sincronizado: 0).
 */
export async function borrarCopiasLocales() {
  await db.transaction('rw', [db.lotes, db.transformaciones, db.productos, db.solicitudes, db.lecturas], async () => {
    for (const tabla of Object.values(TABLAS)) {
      await db[tabla].where('sincronizado').equals(SINCRONIZADO).delete();
    }
    await db.lecturas.where('usuario_id').notEqual(0).delete(); // 0 = consultas públicas (catálogo, fichas)
  });
}
