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

export class ApiError extends Error {
  constructor(estado, cuerpo) {
    super(cuerpo?.mensaje || MENSAJES_POR_ESTADO[estado] || 'Ocurrió un error inesperado.');
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
      sesion.cerrar();
      window.dispatchEvent(new CustomEvent('kakawa:sesion-vencida'));
    }
    throw new ApiError(respuesta.status, cuerpo);
  }

  return respuesta;
}

export async function api(ruta, opciones = {}) {
  const respuesta = await pedir(ruta, opciones);
  if (respuesta.status === 204) return null;
  return respuesta.json();
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
