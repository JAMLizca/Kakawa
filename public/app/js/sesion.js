const CLAVE_TOKEN = 'kakawa.token';
const CLAVE_USUARIO = 'kakawa.usuario';

function leer(clave) {
  try {
    return sessionStorage.getItem(clave);
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

export const sesion = {
  guardar({ token, usuario }) {
    try {
      sessionStorage.setItem(CLAVE_TOKEN, token);
      sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
    } catch {
      /* sin almacenamiento: la sesión dura mientras la página esté abierta */
    }
    this._memoria = { token, usuario };
  },

  token() {
    return leer(CLAVE_TOKEN) ?? this._memoria?.token ?? null;
  },

  usuario() {
    const crudo = leer(CLAVE_USUARIO);
    if (crudo) {
      try {
        return JSON.parse(crudo);
      } catch {
        return null;
      }
    }
    return this._memoria?.usuario ?? null;
  },

  
  esAdmin() {
    return this.usuario()?.rol === 'administrador';
  },

  activa() {
    return Boolean(this.token() && this.usuario());
  },

  cerrar() {
    try {
      sessionStorage.removeItem(CLAVE_TOKEN);
      sessionStorage.removeItem(CLAVE_USUARIO);
    } catch {
      /* nada que borrar */
    }
    this._memoria = null;
  },

  _memoria: null,
};
