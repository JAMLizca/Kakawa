import { api } from '../api.js';
import { sesion } from '../sesion.js';
import { aviso, campo, datosDe, el, limpiarErrores, mostrarErrores, ocupado, titulo } from '../ui.js';

export default function vistaIngreso(contenedor) {
  titulo('Iniciar sesión');

  const boton = el('button', { class: 'boton', type: 'submit' }, 'Iniciar sesión');

  const formulario = el('form', { class: 'formulario', novalidate: true },
    el('h1', {}, 'Iniciar sesión'),
    campo({ etiqueta: 'Usuario', nombre: 'usuario', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' }),
    campo({ etiqueta: 'Contraseña', nombre: 'password', tipo: 'password', autocomplete: 'current-password' }),
    boton,
  );

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limpiarErrores(formulario);

    await ocupado(boton, 'Ingresando…', async () => {
      try {
        const respuesta = await api('/auth/login', { metodo: 'POST', datos: datosDe(formulario) });
        sesion.guardar(respuesta);
        aviso(`Hola, ${respuesta.usuario.nombre}.`, 'exito');
        location.hash = '#/lotes';
      } catch (error) {
        mostrarErrores(formulario, error);
      }
    });

  });

  contenedor.append(el('div', { class: 'ingreso' },
    el('section', { class: 'ingreso__marca', 'aria-label': 'Kakawa' },
      el('p', { class: 'ingreso__nombre' }, 'Kakawa'),
      el('p', { class: 'ingreso__lema' }, 'Cada kilo de cacao, desde la finca hasta el comprador.'),
      el('ul', { class: 'ingreso__cadena', 'aria-label': 'Lo que registra Kakawa' },
        ['Recepción', 'Transformación', 'Merma y costos', 'Estado', 'Ficha pública'].map((t) => el('li', {}, t))),
    ),
    el('section', { class: 'ingreso__formulario' },
      formulario,
      el('details', { class: 'ingreso__demo' },
        el('summary', {}, 'Usuarios de demostración'),
        el('dl', {},
          el('dt', {}, 'admin'), el('dd', {}, 'Admin2026*'),
          el('dt', {}, 'operador'), el('dd', {}, 'Operador2026*')),
        el('p', {}, 'Datos simulados para la evaluación del reto.')),
      el('p', { class: 'ingreso__publico' },
        '¿Compró un producto? ', el('a', { href: 'ficha.html' }, 'Consulte su origen con el código')),
    ),
  ));

  formulario.elements.namedItem('usuario').focus();
}
