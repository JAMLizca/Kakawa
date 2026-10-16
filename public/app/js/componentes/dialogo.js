import { el, limpiarErrores, mostrarErrores, ocupado } from '../ui.js';

/**
 * abrirDialogo({ titulo, descripcion, campos, textoConfirmar, variante, alConfirmar })
 * alConfirmar(formulario) debe lanzar ApiError si el servidor rechaza; el diálogo muestra los errores.
 */
export function abrirDialogo({ titulo, descripcion, campos = [], textoConfirmar, variante = '', alConfirmar }) {
  const origen = document.activeElement;
  const idTitulo = `dialogo-titulo-${Date.now()}`;

  const confirmar = el('button', { class: `boton ${variante}`, type: 'submit' }, textoConfirmar);
  const cancelar = el('button', { class: 'boton boton--secundario', type: 'button' }, 'Cancelar');

  const formulario = el('form', { class: 'formulario', method: 'dialog', novalidate: true },
    el('h2', { id: idTitulo }, titulo),
    descripcion ? el('p', { class: 'dialogo__descripcion' }, descripcion) : null,
    campos,
    el('div', { class: 'acciones' }, confirmar, cancelar));

  const dialogo = el('dialog', { class: 'dialogo', 'aria-labelledby': idTitulo }, formulario);

  const cerrar = () => dialogo.close();
  cancelar.addEventListener('click', cerrar);
  dialogo.addEventListener('close', () => {
    dialogo.remove();
    origen?.focus?.();
  });

  formulario.addEventListener('submit', async (evento) => {

    evento.preventDefault();
    limpiarErrores(formulario);
    await ocupado(confirmar, 'Guardando…', async () => {
      try {
        await alConfirmar(formulario);
        cerrar();
      } catch (error) {
        mostrarErrores(formulario, error);
      }
    });
  });

  document.body.append(dialogo);
  dialogo.showModal();
  formulario.querySelector('input, select, textarea')?.focus();
  return dialogo;
}
