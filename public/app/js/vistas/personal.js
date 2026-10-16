// Personal (solo administrador): crear operadores, activar o desactivar su cuenta y asignar contraseña.
// El servidor siempre crea el rol operador y vuelve a validar que quien lo pide sea administrador.
import { api } from '../api.js';
import { abrirDialogo } from '../componentes/dialogo.js';
import { aviso, campo, datosDe, el, formato, titulo, vaciar } from '../ui.js';

const AYUDA_CLAVE = 'Mínimo 8 caracteres, con letras y números. Entréguesela al operador; él podrá entrar de inmediato.';

function camposClave() {
  return [
    campo({ etiqueta: 'Contraseña', nombre: 'password', tipo: 'password', autocomplete: 'new-password', ayuda: AYUDA_CLAVE }),
    campo({ etiqueta: 'Repita la contraseña', nombre: 'password_confirmation', tipo: 'password', autocomplete: 'new-password' }),
  ];
}

export default async function vistaPersonal(contenedor) {
  titulo('Personal');
  let usuarios = [];

  const botonCrear = el('button', { class: 'boton', type: 'button' }, 'Crear operador');
  const resumen = el('p', { class: 'resumen', 'aria-live': 'polite' });
  const lista = el('div', { 'aria-live': 'polite' }, el('p', { class: 'cargando' }, 'Cargando el personal…'));

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Personal'),
        el('p', {}, 'Cuentas de quienes trabajan en la asociación. Aquí se crean los operadores que registran lotes y transformaciones.')),
      el('div', { class: 'acciones acciones--compactas' }, botonCrear)),
    resumen,
    lista);

  // ---------- Crear operador ----------
  botonCrear.addEventListener('click', () => abrirDialogo({
    titulo: 'Crear operador',
    descripcion: 'La cuenta se crea con el rol de operador: recepción de lotes y registro de transformaciones, sin ver costos.',
    campos: [
      campo({ etiqueta: 'Nombre completo', nombre: 'nombre', autocomplete: 'off', maxlength: 120 }),
      campo({ etiqueta: 'Usuario', nombre: 'usuario', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: 30,
        ayuda: 'De 4 a 30 caracteres: minúsculas, números, punto o guion.' }),
      campo({ etiqueta: 'Cédula', nombre: 'documento', opcional: true, autocomplete: 'off', maxlength: 20 }),
      campo({ etiqueta: 'Teléfono', nombre: 'telefono', tipo: 'tel', opcional: true, autocomplete: 'off', maxlength: 20 }),
      campo({ etiqueta: 'Correo', nombre: 'correo', tipo: 'email', opcional: true, autocomplete: 'off', maxlength: 120 }),
      ...camposClave(),
    ],
    textoConfirmar: 'Crear operador',
    variante: 'boton--exito',
    alConfirmar: async (formulario) => {
      const r = await api('/usuarios', { metodo: 'POST', datos: datosDe(formulario) });
      aviso(r.mensaje, 'exito');
      await cargar(r.usuario.id);
    },
  }));

  // ---------- Acciones por operador ----------
  function cambiarEstado(u) {
    const activar = !u.activo;
    abrirDialogo({
      titulo: `${activar ? 'Activar' : 'Desactivar'} a ${u.nombre}`,
      descripcion: activar
        ? 'Podrá iniciar sesión otra vez con su contraseña.'
        : 'No podrá iniciar sesión y se cerrarán sus sesiones abiertas. Sus registros y la auditoría se conservan.',
      campos: [campo({ etiqueta: 'Motivo', nombre: 'motivo', tipo: 'textarea', minlength: 5, maxlength: 255,
        ayuda: 'Queda registrado en la auditoría.' })],
      textoConfirmar: activar ? 'Activar' : 'Desactivar',
      variante: activar ? 'boton--exito' : 'boton--peligro',
      alConfirmar: async (formulario) => {
        const r = await api(`/usuarios/${u.id}/estado`, { metodo: 'POST', datos: { ...datosDe(formulario), activo: activar } });
        aviso(r.mensaje, 'exito');
        await cargar(u.id);
      },
    });
  }

  function cambiarClave(u) {
    abrirDialogo({
      titulo: `Nueva contraseña para ${u.nombre}`,
      descripcion: 'La contraseña anterior deja de servir y se cierran sus sesiones abiertas.',
      campos: camposClave(),
      textoConfirmar: 'Guardar contraseña',
      alConfirmar: async (formulario) => {
        const r = await api(`/usuarios/${u.id}/clave`, { metodo: 'POST', datos: datosDe(formulario) });
        aviso(r.mensaje, 'exito');
      },
    });
  }

  // ---------- Lista ----------
  function pintar(resaltar = null) {
    const operadores = usuarios.filter((u) => u.rol === 'operador');
    const activos = operadores.filter((u) => u.activo).length;
    resumen.textContent = `${operadores.length} ${operadores.length === 1 ? 'operador' : 'operadores'} (${activos} ${activos === 1 ? 'activo' : 'activos'}).`;

    if (!usuarios.length) {
      vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, 'Todavía no hay personal registrado.')));
      return;
    }

    vaciar(lista, el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla tabla--apilable personal' },
      el('caption', { class: 'visualmente-oculto' }, 'Personal de la asociación'),
      el('thead', {}, el('tr', {},
        ['Nombre', 'Usuario', 'Rol', 'Estado', 'Contacto', 'Creado'].map((t) => el('th', { scope: 'col' }, t)),
        el('th', { scope: 'col' }, el('span', { class: 'visualmente-oculto' }, 'Acciones')))),
      el('tbody', {}, usuarios.map((u) => {
        const esOperador = u.rol === 'operador';
        return el('tr', { class: [u.id === resaltar ? 'fila-nueva' : '', u.activo ? '' : 'personal--inactivo'].join(' ').trim() || null },
          el('th', { scope: 'row', 'data-etiqueta': 'Nombre' }, u.nombre),
          el('td', { 'data-etiqueta': 'Usuario', class: 'cifra' }, u.usuario),
          el('td', { 'data-etiqueta': 'Rol' }, el('span', { class: `rol-chip rol-chip--${u.rol}` }, esOperador ? 'Operador' : 'Administrador')),
          el('td', { 'data-etiqueta': 'Estado' }, el('span', { class: `estado-cuenta estado-cuenta--${u.activo ? 'activa' : 'inactiva'}` },
            u.activo ? 'Activa' : 'Inactiva')),
          el('td', { 'data-etiqueta': 'Contacto' }, [u.telefono, u.correo].filter(Boolean).join(' · ') || '—'),
          el('td', { 'data-etiqueta': 'Creado' }, u.creado ? formato.fecha(u.creado) : '—'),
          el('td', { class: 'tabla__acciones', 'data-etiqueta': 'Acciones' }, esOperador
            ? el('div', { class: 'acciones-fila' },
              el('button', { class: 'boton boton--secundario boton--pequeno', type: 'button', onClick: () => cambiarClave(u),
                'aria-label': `Cambiar la contraseña de ${u.nombre}` }, 'Contraseña'),
              el('button', { class: `boton boton--pequeno ${u.activo ? 'boton--peligro' : 'boton--exito'}`, type: 'button',
                onClick: () => cambiarEstado(u), 'aria-label': `${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre}` },
              u.activo ? 'Desactivar' : 'Activar'))
            : el('span', { class: 'texto-suave' }, '—')));
      })))));
  }

  async function cargar(resaltar = null) {
    try {
      usuarios = (await api('/usuarios')).usuarios;
      pintar(resaltar);
    } catch (error) {
      vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, error.message)));
    }
  }

  await cargar();
}
