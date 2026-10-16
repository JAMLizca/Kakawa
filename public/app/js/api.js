// Cliente de la API de Kakawa. Toda petición pasa por aquí: agrega el token,
// convierte los errores del servidor en ApiError y avisa si la sesión venció.
// Sin conexión: las consultas responden con la copia guardada (IndexedDB) y los cambios
// permitidos se guardan en la cola local para enviarse al volver la conexión.
import { capturar, esCapturable } from './offline/cola.js';
import { esLeible, guardarLectura, leerLectura } from './offline/lecturas.js';
import { sesion } from './sesion.js';

const BASE = '/api';

const MENSAJES_POR_ESTADO = {
  0: 'No hay conexión con el servidor. Revise que Kakawa esté en ejecución.',
  401: 'Su sesión terminó. Inicie sesión de nuevo.',
  403: 'Su usuario no tiene permiso para esta acción.',
  404: 'No encontramos lo que busca.',
  409: 'La operación no se pudo completar por el estado actual de los datos.',
  422: 'Revise los datos marcados.',
  429: 'Demasiados intentos. Espere un minuto y vuelva a intentarlo.',
  500: 'El servidor tuvo un problema. Intente de nuevo.',
};

const RESPUESTA_INVALIDA = 'El servidor respondió algo inesperado. Revise la consola del servidor.';

export class ApiError extends Error {
  constructor(estado, cuerpo, mensaje = null) {
    super(mensaje || cuerpo?.mensaje || MENSAJES_POR_ESTADO[estado] || 'Ocurrió un error inesperado.');
    this.name = 'ApiError';
    this.estado = estado;
    this.codigo = cuerpo?.error ?? null;
    this.errores = cuerpo?.errores ?? {};
    this.datos = cuerpo?.datos ?? null;
  }
}

function encabezados(conCuerpo) {
  const h = { Accept: 'application/json' };
  const token = sesion.token();
  if (token) h.Authorization = `Bearer ${token}`;
  if (conCuerpo) h['Content-Type'] = 'application/json';
  return h;
}

async function pedir(ruta, { metodo = 'GET', datos } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, {
      method: metodo,
      headers: encabezados(datos !== undefined),
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
    });
  } catch {
    throw new ApiError(0, null);
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    if (respuesta.status === 401 && sesion.token()) {
      await sesion.cerrar();
      window.dispatchEvent(new CustomEvent('kakawa:sesion-vencida'));
    }
    throw new ApiError(respuesta.status, cuerpo);
  }

  return respuesta;
}

const SIN_COPIA = 'Sin conexión y sin una copia guardada de esta sección. Ábrala una vez con conexión para tenerla disponible.';
const SIN_CONEXION_ACCESO = 'Sin conexión. Iniciar sesión o crear una cuenta necesita conexión la primera vez; '
  + 'si ya inició sesión en este equipo, entre directamente a su espacio.';
const SOLO_CON_CONEXION = 'Esta acción necesita conexión con el servidor. Inténtelo cuando vuelva la conexión.';

async function guardarSinConexion(captura, datos) {
  const r = await capturar(captura, datos);
  if (r.errores) throw new ApiError(422, { error: 'dato_invalido', mensaje: r.mensaje, errores: r.errores });
  return r.respuesta;
}

export async function api(ruta, opciones = {}) {
  const metodo = (opciones.metodo ?? 'GET').toUpperCase();
  const captura = metodo === 'GET' ? null : esCapturable(metodo, ruta);

  // Sin red: el cambio se guarda en el equipo sin intentar el envío.
  if (captura && !navigator.onLine) return guardarSinConexion(captura, opciones.datos);

  let datos;
  try {
    const respuesta = await pedir(ruta, opciones);
    if (respuesta.status === 204) return null;
    try {
      datos = await respuesta.json();
    } catch {
      // Texto antes del JSON (p. ej. un archivo PHP con contenido fuera de <?php) o una página HTML.
      throw new ApiError(respuesta.status, null, RESPUESTA_INVALIDA);
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.estado !== 0) throw error;

    // El servidor no respondió.
    if (metodo === 'GET' && esLeible(ruta)) {
      const local = await leerLectura(ruta).catch(() => null);
      if (local) return local;
      throw new ApiError(0, null, SIN_COPIA);
    }
    if (captura) return guardarSinConexion(captura, opciones.datos);
    if (/^\/auth\/(login|registro)$/.test(ruta)) throw new ApiError(0, null, SIN_CONEXION_ACCESO);
    throw new ApiError(0, null, navigator.onLine ? null : SOLO_CON_CONEXION);
  }

  if (metodo === 'GET') await guardarLectura(ruta, datos);
  return datos;
}

// Descarga un archivo protegido (p. ej. el CSV) usando el token.
export async function descargar(ruta, nombrePorDefecto) {
  const respuesta = await pedir(ruta);
  const disposicion = respuesta.headers.get('Content-Disposition') || '';
  const nombre = /filename="?([^";]+)"?/i.exec(disposicion)?.[1] || nombrePorDefecto;

  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return nombre;
}

// Identificador único por operación: si la red falla y se reenvía, el servidor no consume dos veces.
export function nuevaOperacion() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
