import { api } from '../api.js';
import { tablaHistorial } from '../componentes/historial.js';
import { el, titulo, vaciar } from '../ui.js';

export default async function vistaAuditoria(contenedor) {
  titulo('Auditoría');

  const entrada = el('input', { id: 'filtro-entidad', name: 'entidad_id', maxlength: 40, autocomplete: 'off',
    autocapitalize: 'characters', placeholder: 'CAC001 o CAC001-P01' });
  const limite = el('select', { id: 'filtro-limite', name: 'limite' },
    [['50', 'Últimos 50'], ['200', 'Últimos 200'], ['500', 'Últimos 500']].map(([v, t]) => el('option', { value: v }, t)));
  limite.value = '200';

  const resumen = el('p', { class: 'resumen', 'aria-live': 'polite' });
  const resultados = el('div', {});

  const filtros = el('form', { class: 'filtros', role: 'search', 'aria-label': 'Filtrar auditoría' },
    el('div', { class: 'campo' }, el('label', { for: 'filtro-entidad' }, 'Lote o producto'), entrada),
    el('div', { class: 'campo' }, el('label', { for: 'filtro-limite' }, 'Registros'), limite),
    el('div', { class: 'campo campo--boton' }, el('button', { class: 'boton boton--secundario', type: 'submit' }, 'Filtrar')));

  filtros.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
  limite.addEventListener('change', cargar);

  vaciar(contenedor,
    el('div', { class: 'encabezado-vista' },
      el('div', {},
        el('h1', {}, 'Auditoría'),
        el('p', {}, 'Quién cambió qué y cuándo, con el valor anterior y el nuevo. Este registro no se puede borrar.'))),
    filtros, resumen, resultados);

  async function cargar() {
    const p = new URLSearchParams({ limite: limite.value });
    const entidad = entrada.value.trim().toUpperCase();
    if (entidad) p.set('entidad_id', entidad);

    resultados.setAttribute('aria-busy', 'true');
    try {
      const { auditoria } = await api(`/auditoria?${p}`);
      resumen.textContent = auditoria.length
        ? `${auditoria.length} ${auditoria.length === 1 ? 'registro' : 'registros'}${entidad ? ` de ${entidad}` : ''}, del más reciente al más antiguo.`
        : '';
      vaciar(resultados, auditoria.length
        ? tablaHistorial(auditoria, { titulo: 'Registro de auditoría' })
        : el('div', { class: 'vacio' }, el('p', {}, entidad ? `No hay registros de ${entidad}.` : 'Todavía no hay registros.')));
    } catch (error) {
      vaciar(resultados, el('div', { class: 'vacio' }, el('p', {}, error.message)));
    } finally {
      resultados.removeAttribute('aria-busy');
    }
  }

  await cargar();
}
