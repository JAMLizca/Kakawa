import { el, formato } from '../ui.js';

export function bloqueMerma(merma) {
  if (!merma) return null;
  const supera = merma.aplica && merma.valor > merma.umbral;

  return el('div', { class: `dato-destacado${supera ? ' dato-destacado--alerta' : ''}` },
    el('span', { class: 'dato-destacado__etiqueta' }, 'Merma'),
    el('span', { class: 'dato-destacado__valor cifra' }, merma.aplica ? formato.pct(merma.valor) : 'No aplica'),
    el('span', { class: 'dato-destacado__detalle' }, merma.explicacion),
    merma.aplica ? el('span', { class: 'dato-destacado__detalle' }, `Umbral de alerta: más de ${formato.pct(merma.umbral)}`) : null,
  );
}

export function listaAlertas(alertas) {
  if (!alertas?.length) return null;

  return el('ul', { class: 'alertas', 'aria-label': 'Alertas' },
    alertas.map((a) => el('li', { class: `alerta alerta--${a.tipo}` },
      el('p', { class: 'alerta__causa' }, a.causa),
      el('p', { class: 'alerta__regla' }, `Regla: ${a.regla}`))));
}

export function bloqueEconomico(economico) {
  if (!economico) return null;
  const u = economico.unidad;

  return el('section', { class: 'economico', 'aria-label': 'Balance económico' },

    el('h4', {}, 'Costo y margen'),
    el('dl', { class: 'datos datos--dos' },
      el('div', {}, el('dt', {}, 'Costo total de la etapa'), el('dd', { class: 'cifra' }, formato.cop(economico.costo_total))),
      el('div', {}, el('dt', {}, 'Salida vendible'), el('dd', { class: 'cifra' }, formato.kg(economico.salida_vendible, u))),
      el('div', {}, el('dt', {}, `Costo unitario (COP/${u})`),
        el('dd', { class: 'cifra cifra--grande' }, formato.cop(economico.costo_unitario))),
      el('div', {}, el('dt', {}, 'Precio de venta'), el('dd', { class: 'cifra' },
        economico.precio_venta === null ? 'Sin precio' : `${formato.cop(economico.precio_venta)}/${u}`)),
      el('div', {}, el('dt', {}, 'Margen sobre venta'),
        el('dd', { class: 'cifra cifra--grande' }, formato.pct(economico.margen_venta))),
      el('div', {}, el('dt', {}, 'Costos incluidos'), el('dd', {}, economico.costos_incluidos || 'No especificados')),
    ),
    el('div', { class: 'formulas' },
      el('p', {}, el('strong', {}, 'Cálculo del costo unitario: '), economico.explicacion.costo_unitario),
      el('p', {}, el('strong', {}, 'Cálculo del margen: '), economico.explicacion.margen_venta),
      el('details', {},
        el('summary', {}, 'Fórmulas y supuestos'),
        el('ul', {},
          el('li', {}, economico.formulas.costo_unitario),
          el('li', {}, economico.formulas.margen_venta),
          economico.supuestos.map((s) => el('li', {}, s))))),
  );
}
