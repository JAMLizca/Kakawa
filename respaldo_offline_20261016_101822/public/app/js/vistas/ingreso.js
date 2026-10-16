import { api } from '../api.js';
import { sesion } from '../sesion.js';
import { aviso, datosDe, el, limpiarErrores, mostrarErrores, ocupado, titulo } from '../ui.js';

const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esperar = (ms) => new Promise((listo) => setTimeout(listo, sinMovimiento() ? 0 : ms));

// La etiqueta va después del campo para poder flotarla con CSS (input:focus + label).
// El placeholder es un espacio: solo sirve para saber si el campo está vacío.
function campoFlotante({ etiqueta, nombre, tipo = 'text', ...atributos }) {
  const id = `acceso-${nombre}`;
  return el('div', { class: 'campo acceso__campo' },
    el('input', { id, name: nombre, type: tipo, required: true, placeholder: ' ', ...atributos }),
    el('label', { for: id }, etiqueta));
}

export default function vistaIngreso(contenedor) {
  titulo('Iniciar sesión');

  const boton = el('button', { class: 'acceso__boton', type: 'submit' }, 'Ingresar');
  const verClave = el('button', { class: 'acceso__ver', type: 'button', 'aria-pressed': 'false',
    'aria-controls': 'acceso-password' }, 'Mostrar');

  const campoClave = campoFlotante({ etiqueta: 'Contraseña', nombre: 'password', tipo: 'password',
    autocomplete: 'current-password' });
  campoClave.classList.add('acceso__campo--clave');
  campoClave.append(verClave);


  const formulario = el('form', { class: 'acceso__formulario', novalidate: true },
    el('h2', { class: 'acceso__titulo' }, 'Inicia sesión'),
    campoFlotante({ etiqueta: 'Nombre de usuario', nombre: 'usuario', autocomplete: 'username',
      autocapitalize: 'none', spellcheck: 'false' }),
    campoClave,
    boton);

  const tarjeta = el('section', { class: 'acceso__tarjeta', 'aria-labelledby': 'acceso-titulo' },
    formulario,
    el('details', { class: 'acceso__demo' },
      el('summary', {}, 'Usuarios de demostración'),
      el('dl', {},
        el('dt', {}, 'admin'), el('dd', {}, 'Admin2026*'),
        el('dt', {}, 'operador'), el('dd', {}, 'Operador2026*')),
      el('p', {}, 'Datos simulados para la evaluación del reto.')));
  formulario.querySelector('h2').id = 'acceso-titulo';

  const pantalla = el('div', { class: 'acceso' },
    el('h1', { class: 'acceso__nombre' }, 'Kakawa'),
    tarjeta,
    el('p', { class: 'acceso__publico' },
      '¿Compró un producto? ', el('a', { href: 'ficha.html' }, 'Consulte su origen con el código')));

  verClave.addEventListener('click', () => {
    const clave = formulario.elements.namedItem('password');
    const visible = clave.type === 'password';
    clave.type = visible ? 'text' : 'password';
    verClave.textContent = visible ? 'Ocultar' : 'Mostrar';
    verClave.setAttribute('aria-pressed', String(visible));
    clave.focus();
  });


  tarjeta.addEventListener('animationend', (e) => {
    if (e.animationName === 'acceso-sacudir') tarjeta.classList.remove('acceso__tarjeta--error');
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limpiarErrores(formulario);

    await ocupado(boton, 'Ingresando…', async () => {
      try {
        const respuesta = await api('/auth/login', { metodo: 'POST', datos: datosDe(formulario) });
        sesion.guardar(respuesta);
        pantalla.classList.add('acceso--saliendo');
        await esperar(350);
        aviso(`Hola, ${respuesta.usuario.nombre}.`, 'exito');
        location.hash = respuesta.usuario.rol === 'cliente' ? '#/tienda' : '#/lotes';
      } catch (error) {
        tarjeta.classList.remove('acceso__tarjeta--error');
        void tarjeta.offsetWidth; // reinicia la animación si falla dos veces seguidas
        tarjeta.classList.add('acceso__tarjeta--error');
        mostrarErrores(formulario, error);
      }
    });
  });

  contenedor.replaceChildren(pantalla);
  formulario.elements.namedItem('usuario').focus();
}
