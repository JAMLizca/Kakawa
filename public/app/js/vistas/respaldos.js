// Respaldo y restauración (RF07, E07). Solo administrador.
// Restaurar reemplaza los datos (no duplica) y se verifica con conteos, kilos y huellas por tabla.
import { api, ApiError } from '../api.js';
import { abrirDialogo } from '../componentes/dialogo.js';
import { aviso, el, formato, ocupado, titulo, vaciar } from '../ui.js';

const NOMBRES_TABLA = {
  users: 'Usuarios',
  lotes: 'Lotes',
  productos: 'Productos',
  transformaciones: 'Transformaciones',
  auditoria: 'Auditoría',
};

export default async function vistaRespaldos(contenedor) {
  titulo('Respaldos');

  const botonCrear = el('button', { class: 'boton', type: 'button' }, 'Crear respaldo');
  const zonaResultado = el('div', { class: 'resultado', 'aria-live': 'polite' });
  const lista = el('div', {});

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Respaldos'),
        el('p', {}, 'Copias verificables de lotes, productos, transformaciones, usuarios y auditoría.')),
      el('div', { class: 'acciones acciones--compactas' }, botonCrear)),
    zonaResultado,
    el('section', { class: 'seccion', 'aria-labelledby': 'titulo-lista' },
      el('h2', { id: 'titulo-lista' }, 'Respaldos guardados'),
      lista),
    el('details', { class: 'ayuda-consola' },
      el('summary', {}, 'Respaldo y restauración desde la consola'),
      el('p', {}, 'Las mismas operaciones están disponibles en la terminal del servidor:'),
      el('pre', {}, el('code', {},
        'php artisan kakawa:respaldar\n'
        + 'php artisan kakawa:verificar-respaldo <archivo>\n'
        + 'php artisan kakawa:restaurar <archivo>'))));

  botonCrear.addEventListener('click', () => ocupado(botonCrear, 'Creando…', async () => {
    try {
      const r = await api('/respaldos', { metodo: 'POST' });
      aviso(r.mensaje, 'exito');
      vaciar(zonaResultado, el('section', { class: 'panel panel--resultado', tabindex: '-1' },
        el('h2', {}, 'Respaldo creado'),
        el('p', { class: 'cifra' }, r.nombre),
        el('dl', { class: 'datos datos--dos' },
          Object.entries(r.conteos).map(([t, n]) => el('div', {}, el('dt', {}, NOMBRES_TABLA[t] ?? t), el('dd', { class: 'cifra' }, String(n)))),
          el('div', {}, el('dt', {}, 'Kilos recibidos'), el('dd', { class: 'cifra' }, formato.kg(r.totales.kg_recibidos))),
          el('div', {}, el('dt', {}, 'Lotes'), el('dd', {}, r.totales.ids_lotes.join(', ') || '—')))));
      zonaResultado.querySelector('.panel')?.focus();
      await cargar();
    } catch (error) {
      aviso(error.message, 'error');
    }
  }));

  function confirmarRestauracion(nombre) {
    const casilla = el('input', { type: 'checkbox', id: 'confirmar-restauracion', name: 'confirmar' });
    const dialogo = abrirDialogo({
      titulo: `Restaurar ${nombre}`,
      descripcion: 'Los datos actuales se reemplazarán por los del respaldo. Antes se guarda automáticamente un respaldo de seguridad del estado actual.',
      campos: [el('div', { class: 'campo campo--casilla' },
        casilla, el('label', { for: 'confirmar-restauracion' }, 'Entiendo que los datos actuales se reemplazarán.'))],
      textoConfirmar: 'Restaurar',
      variante: 'boton--peligro',
      alConfirmar: async () => {
        if (!casilla.checked) {
          throw new ApiError(422, { error: 'dato_invalido', errores: { confirmar: ['Marque la casilla para confirmar.'] } },
            'Confirme que entiende que los datos actuales se reemplazarán.');
        }
        const r = await api('/respaldos/restaurar', { metodo: 'POST', datos: { archivo: nombre } });
        aviso(r.mensaje, r.verificacion.integro ? 'exito' : 'error');
        mostrarVerificacion(r);
        await cargar();
      },
    });
    // Tras restaurar, la lista se vuelve a pintar y el botón de origen ya no existe:
    // al cerrar el diálogo el foco pasa al panel con el resultado.
    dialogo.addEventListener('close', () => zonaResultado.querySelector('.panel')?.focus());
  }

  function mostrarVerificacion(r) {
    const v = r.verificacion;
    vaciar(zonaResultado, el('section', { class: `panel panel--resultado${v.integro ? '' : ' panel--fallo'}`, tabindex: '-1' },
      el('h2', {}, v.integro ? 'Restauración verificada' : 'Restauración con diferencias'),
      el('p', {}, r.mensaje),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla tabla--apilable tabla--densa' },
        el('caption', { class: 'visualmente-oculto' }, 'Verificación de integridad por tabla'),
        el('thead', {}, el('tr', {}, ['Tabla', 'En el respaldo', 'En la base', 'Huella'].map((t, i) =>
          el('th', { scope: 'col', class: i === 1 || i === 2 ? 'numero' : null }, t)))),
        el('tbody', {}, Object.entries(v.tablas).map(([t, d]) => el('tr', {},
          el('th', { scope: 'row' }, NOMBRES_TABLA[t] ?? t),
          el('td', { class: 'numero', 'data-etiqueta': 'En el respaldo' }, String(d.en_respaldo)),
          el('td', { class: 'numero', 'data-etiqueta': 'En la base' }, String(d.en_base)),
          el('td', { 'data-etiqueta': 'Huella' }, d.huella_coincide
            ? el('span', { class: 'insignia insignia--liberado' }, 'Coincide')
            : el('span', { class: 'insignia insignia--bloqueado' }, 'No coincide'))))))),
      el('dl', { class: 'datos datos--dos' },
        el('div', {}, el('dt', {}, 'Kilos recibidos'), el('dd', { class: 'cifra' }, formato.kg(v.totales_base.kg_recibidos))),
        el('div', {}, el('dt', {}, 'Kilos consumidos'), el('dd', { class: 'cifra' }, formato.kg(v.totales_base.kg_consumidos))),
        el('div', {}, el('dt', {}, 'Kilos producidos'), el('dd', { class: 'cifra' }, formato.kg(v.totales_base.kg_producidos))),
        el('div', {}, el('dt', {}, 'Respaldo de seguridad previo'), el('dd', { class: 'cifra' }, r.respaldo_previo ?? '—')),
        el('div', {}, el('dt', {}, 'Duración'), el('dd', { class: 'cifra' }, `${formato.numero(r.duracion_ms)} ms`)))));
    zonaResultado.querySelector('.panel')?.focus();
  }

  async function cargar() {
    try {
      const { respaldos } = await api('/respaldos');
      if (respaldos.length === 0) {
        vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, 'Todavía no hay respaldos. Use "Crear respaldo".')));
        return;
      }
      vaciar(lista, el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla tabla--apilable' },
        el('caption', { class: 'visualmente-oculto' }, 'Respaldos guardados'),
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col' }, 'Archivo'), el('th', { scope: 'col' }, 'Fecha'),
          el('th', { scope: 'col', class: 'numero' }, 'Tamaño'),
          el('th', { scope: 'col' }, el('span', { class: 'visualmente-oculto' }, 'Acciones')))),
        el('tbody', {}, respaldos.map((r) => el('tr', {},
          el('th', { scope: 'row', 'data-etiqueta': 'Archivo' }, r.nombre),
          el('td', { 'data-etiqueta': 'Fecha' }, formato.fechaHora(r.modificado)),
          el('td', { class: 'numero', 'data-etiqueta': 'Tamaño' }, `${formato.numero(r.tamano_kb)} KB`),
          el('td', { class: 'tabla__acciones', 'data-etiqueta': 'Acciones' },
            el('button', { class: 'boton boton--secundario boton--pequeno', type: 'button',
              'aria-label': `Restaurar ${r.nombre}`, onClick: () => confirmarRestauracion(r.nombre) }, 'Restaurar'))))))));
    } catch (error) {
      vaciar(lista, el('div', { class: 'vacio' }, el('p', {}, error.message)));
    }
  }

  await cargar();
}
