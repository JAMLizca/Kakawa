import { api, nuevaOperacion } from '../api.js';
import { bloqueEconomico, bloqueMerma, listaAlertas } from '../componentes/analisis.js';
import { sesion } from '../sesion.js';
import {
  aviso, campo, datosDe, el, formato, hoy, insignia, limpiarErrores, mostrarErrores, ocupado, titulo, vaciar,
} from '../ui.js';

const ETAPAS = ['Fermentación', 'Secado', 'Selección', 'Tostado', 'Descascarillado', 'Molienda', 'Prensado', 'Empaque'];
const UMBRAL_REFERENCIA = 15; // Solo para la vista previa; la alerta oficial la calcula el servidor.

export default async function vistaTransformar(contenedor, loteInicial) {
  titulo('Registrar transformación');
  const esAdmin = sesion.esAdmin();
  let operacionId = nuevaOperacion();
  let fuentes = []; // [{ valor, texto, disponible, unidad }]

  const zonaResultado = el('div', { class: 'resultado', 'aria-live': 'polite' });

  // ---------- Lotes que se pueden transformar ----------
  let lotes = [];
  try {
    lotes = (await api('/lotes')).lotes.filter((l) => l.estado !== 'bloqueado');
  } catch (error) {
    vaciar(contenedor, el('div', { class: 'vacio' }, el('p', {}, error.message)));
    return;
  }

  if (lotes.length === 0) {

    vaciar(contenedor, el('div', { class: 'vacio' },
      el('h1', {}, 'Registrar transformación'),
      el('p', {}, 'No hay lotes disponibles para transformar. Los lotes bloqueados no se pueden transformar.'),
      el('a', { class: 'boton boton--secundario', href: '#/lotes' }, 'Ir a lotes')));
    return;
  }

  // Formulario
  const selectLote = el('select', { id: 'tr-lote', name: 'lote_id', required: true },
    el('option', { value: '' }, 'Seleccione un lote'),
    lotes.map((l) => el('option', { value: l.id }, `${l.id}, ${l.origen} (${formato.kg(l.disponible, l.unidad)} sin transformar)`)));

  const grupoFuente = el('fieldset', { class: 'campo campo--ancho opciones-fuente' },
    el('legend', {}, 'Tomar la entrada de'),
    el('p', { class: 'campo__ayuda' }, 'Seleccione primero el lote.'));

  const previa = el('p', { class: 'previa', 'aria-live': 'polite' });
  const botonGuardar = el('button', { class: 'boton boton--exito', type: 'submit' }, 'Registrar transformación');

  const datalistEtapas = el('datalist', { id: 'etapas-conocidas' }, ETAPAS.map((e) => el('option', { value: e })));

  const formulario = el('form', { class: 'formulario formulario--columnas', novalidate: true },
    el('div', { class: 'campo campo--ancho' }, el('label', { for: 'tr-lote' }, 'Lote'), selectLote),
    grupoFuente,
    campo({ etiqueta: 'Etapa', nombre: 'etapa', list: 'etapas-conocidas', maxlength: 80, autocomplete: 'off',
      ayuda: 'Por ejemplo: Fermentación, Secado, Tostado.' }),
    campo({ etiqueta: 'Responsable', nombre: 'responsable', maxlength: 120, value: sesion.usuario()?.nombre ?? '' }),
    campo({ etiqueta: 'Cantidad de entrada (kg)', nombre: 'cantidad_entrada', tipo: 'number', min: '0.001', step: '0.001',
      inputmode: 'decimal', ayuda: 'No puede superar lo disponible.' }),
    campo({ etiqueta: 'Cantidad de salida (kg)', nombre: 'cantidad_salida', tipo: 'number', min: '0', step: '0.001',
      inputmode: 'decimal', ayuda: 'Lo que queda después de la etapa.' }),
    el('div', { class: 'campo--ancho' }, previa),

    campo({ etiqueta: 'Fecha', nombre: 'fecha', tipo: 'date', max: hoy(), value: hoy() }),
    campo({ etiqueta: 'Nombre del producto resultante', nombre: 'producto_nombre', opcional: true, maxlength: 120,
      ayuda: 'Si lo deja vacío se usa "Etapa de lote".' }),
    campo({ etiqueta: 'Costo total de la etapa (COP)', nombre: 'costo_etapa', tipo: 'number', min: '0', step: '1',
      inputmode: 'numeric', opcional: true }),
    campo({ etiqueta: 'Costos incluidos', nombre: 'costos_incluidos', opcional: true, maxlength: 500,
      ayuda: 'Por ejemplo: mano de obra, energía y transporte.' }),
    esAdmin ? campo({ etiqueta: 'Precio de venta (COP por kg)', nombre: 'precio_venta', tipo: 'number', min: '1', step: '1',
      inputmode: 'numeric', opcional: true }) : null,
    campo({ etiqueta: 'Insumos agregados', nombre: 'insumos_agregados', opcional: true, maxlength: 500, ancho: true,
      ayuda: 'Obligatorio si la salida es mayor que la entrada (por ejemplo, azúcar 10 kg).' }),
    campo({ etiqueta: 'Incidencias', nombre: 'incidencias', tipo: 'textarea', opcional: true, maxlength: 1000, ancho: true }),
    el('div', { class: 'acciones campo--ancho' }, botonGuardar,
      el('a', { class: 'boton boton--secundario', href: '#/lotes' }, 'Cancelar')),
    datalistEtapas,
  );

  const control = (nombre) => formulario.elements.namedItem(nombre);

  // ---------- Fuente de la entrada: el lote o un producto del mismo lote ----------
  async function cargarFuentes(loteId, productoPreferido = null) {
    vaciar(grupoFuente, el('legend', {}, 'Tomar la entrada de'), el('p', { class: 'campo__ayuda' }, 'Cargando existencias…'));
    fuentes = [];
    if (!loteId) {
      vaciar(grupoFuente, el('legend', {}, 'Tomar la entrada de'), el('p', { class: 'campo__ayuda' }, 'Seleccione primero el lote.'));
      return;
    }

    try {
      const { inventario, productos } = await api(`/lotes/${encodeURIComponent(loteId)}`);
      if (inventario.disponible > 0) {
        fuentes.push({ valor: '', texto: `Cacao recibido del lote ${loteId}`, disponible: inventario.disponible, unidad: inventario.unidad });

      }
      productos.filter((p) => p.disponible > 0 && p.estado !== 'bloqueado').forEach((p) => {
        fuentes.push({ valor: p.id, texto: `${p.id}, ${p.nombre}`, disponible: p.disponible, unidad: p.unidad, estado: p.estado });
      });
    } catch (error) {
      vaciar(grupoFuente, el('legend', {}, 'Tomar la entrada de'), el('p', { class: 'campo__error' }, error.message));
      return;
    }

    if (fuentes.length === 0) {
      vaciar(grupoFuente, el('legend', {}, 'Tomar la entrada de'),
        el('p', { class: 'campo__error' }, 'Este lote ya no tiene existencia para transformar.'));
      return;
    }

    const elegida = fuentes.find((f) => f.valor === productoPreferido) ?? fuentes[0];
    vaciar(grupoFuente, el('legend', {}, 'Tomar la entrada de'),
      fuentes.map((f, i) => {
        const id = `fuente-${i}`;
        return el('div', { class: 'opcion' },
          el('input', { type: 'radio', id, name: 'entrada_producto_id', value: f.valor, checked: f === elegida }),
          el('label', { for: id },
            el('span', {}, f.texto),
            el('span', { class: 'opcion__detalle cifra' }, `${formato.kg(f.disponible, f.unidad)} disponibles`),
            f.estado ? insignia(f.estado) : null));
      }));

    grupoFuente.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', ajustarMaximo));
    ajustarMaximo();
  }

  function fuenteActual() {

    const valor = formulario.querySelector('input[name=entrada_producto_id]:checked')?.value ?? '';
    return fuentes.find((f) => f.valor === valor) ?? null;
  }

  function ajustarMaximo() {
    const fuente = fuenteActual();
    const entrada = control('cantidad_entrada');
    if (!fuente) return;
    entrada.max = String(fuente.disponible);
    if (!entrada.value) entrada.value = String(fuente.disponible);
    actualizarPrevia();
  }

  // Vista previa inmediata: ayuda al operador.
  function actualizarPrevia() {
    const entrada = Number(control('cantidad_entrada').value);
    const salida = Number(control('cantidad_salida').value);
    const fuente = fuenteActual();
    previa.className = 'previa';

    if (!entrada || control('cantidad_salida').value === '') {
      previa.textContent = 'Escriba la entrada y la salida para ver la merma estimada.';
      return;
    }
    if (fuente && entrada > fuente.disponible) {
      previa.classList.add('previa--error');
      previa.textContent = `La entrada supera lo disponible (${formato.kg(fuente.disponible)}). El sistema la rechazará.`;
      return;
    }
    if (salida > entrada) {
      previa.classList.add('previa--aviso');
      previa.textContent = 'La salida es mayor que la entrada: registre los insumos agregados.';

      return;
    }
    const merma = ((entrada - salida) * 100) / entrada;
    const alta = merma > UMBRAL_REFERENCIA;
    previa.classList.add(alta ? 'previa--aviso' : 'previa--ok');
    previa.textContent = `Merma estimada: ${formato.pct(merma)} (${formato.kg(entrada - salida)} menos).`
      + (alta ? ` Supera el ${UMBRAL_REFERENCIA} %: se generará una alerta.` : '');
  }

  ['cantidad_entrada', 'cantidad_salida'].forEach((n) => control(n).addEventListener('input', actualizarPrevia));
  selectLote.addEventListener('change', () => {
    control('cantidad_entrada').value = '';
    cargarFuentes(selectLote.value);
    history.replaceState(null, '', selectLote.value ? `#/transformar/${encodeURIComponent(selectLote.value)}` : '#/transformar');
  });

  // ---------- Envío ----------
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limpiarErrores(formulario);

    await ocupado(botonGuardar, 'Registrando…', async () => {
      const datos = { ...datosDe(formulario), operacion_id: operacionId, unidad: 'kg' };
      if (!datos.entrada_producto_id) delete datos.entrada_producto_id;

      try {
        const respuesta = await api('/transformaciones', { metodo: 'POST', datos });
        operacionId = nuevaOperacion(); // la siguiente es una operación nueva
        aviso(respuesta.mensaje, respuesta.repetida ? 'info' : 'exito');
        mostrarResultado(respuesta);
      } catch (error) {
        if (error.estado === 0) {

        
          error.message = 'No se pudo confirmar el registro por un problema de conexión. Puede volver a enviar: no se consumirá dos veces.';
        } else if (error.codigo === 'operacion_en_conflicto') {
          operacionId = nuevaOperacion();
          error.message = 'Ya había una operación registrada con datos distintos. Revise los datos y envíe de nuevo para registrarla como nueva.';
        }
        mostrarErrores(formulario, error);
      }
    });
  });

  function mostrarResultado({ mensaje, repetida, pendiente, transformacion: t, disponible_restante: restante, analisis }) {
    vaciar(zonaResultado, el('section', { class: `panel panel--resultado${repetida ? ' panel--repetida' : ''}`, tabindex: '-1' },
      el('h2', {}, pendiente ? 'Guardada sin conexión' : repetida ? 'Operación ya registrada' : 'Transformación registrada'),
      el('p', {}, mensaje),
      el('dl', { class: 'datos datos--dos' },
        el('div', {}, el('dt', {}, 'Producto generado'), el('dd', { class: 'cifra' }, pendiente ? 'Se asigna al sincronizar' : t.producto_id)),
        el('div', {}, el('dt', {}, 'Etapa'), el('dd', {}, t.etapa)),
        el('div', {}, el('dt', {}, 'Entrada y salida'),
          el('dd', { class: 'cifra' }, `${formato.kg(t.cantidad_entrada, t.unidad)} a ${formato.kg(t.cantidad_salida, t.unidad)}`)),
        el('div', {}, el('dt', {}, `Queda en ${t.entrada_desde}`), el('dd', { class: 'cifra' }, formato.kg(restante, t.unidad)))),
      bloqueMerma(analisis.merma),
      listaAlertas(analisis.alertas),
      bloqueEconomico(analisis.economico),
      el('div', { class: 'acciones' },
        el('a', { class: 'boton', href: `#/lotes/${encodeURIComponent(t.lote_id)}` }, 'Ver trazabilidad del lote'),
        el('button', { class: 'boton boton--secundario', type: 'button', onClick: () => continuarCon(t) },
          'Registrar la siguiente etapa'))));

    zonaResultado.querySelector('.panel')?.focus();
  }


  
  async function continuarCon(t) {
    vaciar(zonaResultado);
    ['etapa', 'cantidad_entrada', 'cantidad_salida', 'producto_nombre', 'costo_etapa', 'costos_incluidos',
      'insumos_agregados', 'incidencias', 'precio_venta'].forEach((n) => { if (control(n)) control(n).value = ''; });
    await cargarFuentes(t.lote_id, t.producto_id);
    control('etapa').focus();
  }

  // Pintar
  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Registrar transformación'),
        el('p', {}, 'Una etapa por operación y de un solo lote. La salida queda vinculada a su origen.'))),
    el('section', { class: 'panel' }, formulario),
    zonaResultado);

  const inicial = lotes.find((l) => l.id === loteInicial);
  if (inicial) {
    selectLote.value = inicial.id;
    await cargarFuentes(inicial.id);
    control('etapa').focus();
  } else {
    selectLote.focus();
  }
  actualizarPrevia();
}
