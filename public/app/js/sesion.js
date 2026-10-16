// Sesión del usuario, persistente en IndexedDB: sigue activa al cerrar y abrir el navegador,
// también sin conexión. "Cerrar sesión" borra el token y las copias locales (los cambios sin enviar
// se conservan y se envían cuando ese mismo usuario vuelva a entrar).
//
// La lectura es síncrona (sesion.token(), sesion.usuario()…) porque este módulo carga la sesión
// antes de que cualquier otro módulo la use (await de primer nivel).
import { borrarCopiasLocales, db } from './offline/db.js';

/** Días que se permite trabajar sin que el servidor confirme la sesión. */
const DIAS_SIN_CONEXION = 7;
const RESPALDO = 'kakawa.sesion'; // copia en sessionStorage si IndexedDB no está disponible (modo privado)

let actual = null;

try {
  actual = (await db.sesion.get('actual')) ?? null;
} catch {
  actual = null;
}
if (!actual) {
  try {
    actual = JSON.parse(sessionStorage.getItem(RESPALDO) ?? 'null');
  } catch {
    actual = null;
  }
}

async function persistir() {
  try {
    if (actual) sessionStorage.setItem(RESPALDO, JSON.stringify(actual));
    else sessionStorage.removeItem(RESPALDO);
  } catch {
    /* sin sessionStorage */
  }
  try {
    if (actual) await db.sesion.put(actual);
    else await db.sesion.delete('actual');
  } catch {
    /* sin IndexedDB: la sesión dura mientras la pestaña esté abierta */
  }
}

export const sesion = {
  /** Guarda el token y el usuario que devolvió /auth/login o /auth/registro. */
  async guardar({ token, usuario, expira = null }) {
    actual = { clave: 'actual', token, usuario, expira, guardada_en: Date.now(), verificada_en: Date.now() };
    await persistir();
  },

  token() {
    return actual?.token ?? null;
  },

  usuario() {
    return actual?.usuario ?? null;
  },

  // Solo decide qué se muestra. Los permisos reales los aplica el servidor.
  esAdmin() {
    return actual?.usuario?.rol === 'administrador';
  },

  activa() {
    return Boolean(actual?.token && actual?.usuario);
  },

  /** Cierra la sesión local. Lo que se muestra se actualiza de inmediato; el borrado termina después. */
  async cerrar() {
    actual = null;
    await persistir();
    try {
      await borrarCopiasLocales();
    } catch {
      /* nada que borrar */
    }
  },

  /**
   * Verificación al abrir la app:
   *  - Con conexión: pregunta al servidor (/auth/yo). Si el token venció, cierra la sesión.
   *  - Sin conexión: deja entrar con la sesión guardada, salvo que lleve más de DIAS_SIN_CONEXION sin confirmarse.
   * @returns {'sin_sesion'|'valida'|'sin_conexion'|'vencida'}
   */
  async verificar() {
    if (!this.activa()) return 'sin_sesion';

    const sinConexion = async () => {
      const dias = (Date.now() - (actual?.verificada_en ?? 0)) / 86_400_000;
      if (dias > DIAS_SIN_CONEXION) {
        await this.cerrar();
        return 'vencida';
      }
      return 'sin_conexion';
    };

    if (!navigator.onLine) return sinConexion();

    try {
      const r = await fetch('/api/auth/yo', {
        headers: { Accept: 'application/json', Authorization: `Bearer ${actual.token}` },
      });
      if (r.status === 401) {
        await this.cerrar();
        return 'vencida';
      }
      if (!r.ok) return sinConexion(); // servidor con problemas: se trabaja con la copia local
      const { usuario } = await r.json();
      actual = { ...actual, usuario, verificada_en: Date.now() };
      await persistir();
      return 'valida';
    } catch {
      return sinConexion(); // el servidor no responde
    }
  },
};
