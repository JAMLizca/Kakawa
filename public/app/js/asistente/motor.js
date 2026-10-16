// Motor del asistente de Kakawa. Funciona igual con y sin conexión: entiende la pregunta en el
// navegador (palabras clave, sin servicios externos ni IA) y arma la respuesta.
// Los datos vivos (catálogo y fichas) llegan por el contexto: con conexión vienen del servidor y,
// sin conexión, de la copia guardada en IndexedDB.
//
// Una respuesta es un objeto serializable (se guarda en sessionStorage):
//   { texto: ['párrafo', …], lista?: [{ texto, href? }], acciones?: [Accion], nota?: 'texto' }
//   Accion = { texto, tipo: 'ir' | 'enlace' | 'pregunta', destino }

/** Quita tildes y signos: "¿Cuánto cuesta?" → "cuanto cuesta". */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9ñ-]+/g, ' ').trim();
}

const kg = (n) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n)} kg`;
const fecha = (iso) => (iso ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  .format(new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)) : 'sin fecha');
const fechaHora = (ms) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));

const CODIGO_PRODUCTO = /\bcac\d{3}-p\d{2}\b/i;
const CODIGO_LOTE = /\bcac\d{3}\b/i;

// Acciones reutilizables
const IR_CATALOGO = { texto: 'Ver el catálogo', tipo: 'ir', destino: '#catalogo' };
const IR_REGISTRO = { texto: 'Crear cuenta', tipo: 'ir', destino: '#registro' };
const IR_ACCESO = { texto: 'Iniciar sesión', tipo: 'ir', destino: '#acceso' };
const CONSULTAR = { texto: 'Consultar un código', tipo: 'pregunta', destino: 'Quiero consultar un código' };
const P = (texto) => ({ texto, tipo: 'pregunta', destino: texto });

export const SUGERENCIAS_INICIALES = [
  P('¿Qué cacao hay disponible?'),
  P('¿Cómo compro?'),
  CONSULTAR,
  P('¿Qué es la merma?'),
  P('¿Funciona sin internet?'),
];

/**
 * Intenciones: cada una suma un punto por palabra clave encontrada. Una clave terminada en "*"
 * acepta cualquier terminación (compr* → comprar, compro, compra). Gana la de más puntos; en empate,
 * la que aparece primero (por eso precio y comprar van antes que catálogo).
 */
const INTENCIONES = [
  { id: 'saludo', claves: ['hola', 'buenas', 'buenos', 'saludos', 'hey', 'que tal'] },
  { id: 'despedida', claves: ['gracias', 'chao', 'adios', 'hasta luego', 'listo', 'perfecto', 'genial'] },
  { id: 'ayuda', claves: ['ayuda', 'ayudame', 'que puedes', 'que sabes', 'opciones', 'menu', 'como funciona'] },
  { id: 'precio', claves: ['precio*', 'cuesta', 'cuestan', 'valor', 'cotiza*', 'cuanto vale', 'tarifa*', 'pago', 'pagar'] },
  { id: 'comprar', claves: ['compr*', 'pedido*', 'pedir', 'solicitud*', 'solicitar', 'adquirir', 'encargar'] },
  { id: 'catalogo', claves: ['disponib*', 'catalogo', 'producto*', 'venden', 'vende', 'hay', 'stock', 'inventario', 'kilo*', 'kg', 'oferta*', 'tienen'] },
  { id: 'registro', claves: ['registr*', 'crear cuenta', 'cuenta nueva', 'inscrib*', 'afiliar*', 'abrir cuenta', 'crear una cuenta'] },
  { id: 'acceso', claves: ['iniciar sesion', 'inicio de sesion', 'entrar', 'ingresar', 'login', 'usuario', 'administrador', 'operador', 'rol', 'roles'] },
  { id: 'clave', claves: ['olvide', 'olvido', 'recuperar', 'restablecer', 'contrasena', 'clave'] },
  { id: 'consulta', claves: ['consultar', 'codigo', 'qr', 'etiqueta', 'rastrear', 'buscar un producto'] },
  { id: 'trazabilidad', claves: ['trazabilidad', 'origen', 'recorrido', 'historia', 'de donde', 'procedencia', 'rastreo'] },
  { id: 'merma', claves: ['merma', 'perdida*', 'rendimiento', 'desperdicio'] },
  { id: 'calidad', claves: ['calidad', 'bloquea*', 'liberad*', 'seguro', 'confiable', 'garantia', 'revision'] },
  { id: 'proceso', claves: ['proceso', 'fermenta*', 'secado', 'seca*', 'tostion', 'tostad*', 'transforma*', 'etapa*', 'como trabajan', 'como lo hacen'] },
  { id: 'asociacion', claves: ['asociacion', 'quienes', 'kakawa', 'huila', 'productores', 'fincas', 'nosotros'] },
  { id: 'municipios', claves: ['municipio*', 'de donde viene', 'zonas', 'region*', 'lugares'] },
  { id: 'sin_conexion', claves: ['sin internet', 'sin conexion', 'offline', 'internet', 'conexion', 'sin red', 'desconectado'] },
  { id: 'contacto', claves: ['contacto', 'contactar', 'telefono', 'correo', 'whatsapp', 'llamar', 'direccion', 'ubicacion', 'escribir'] },
];

function puntuar(normalizado, intencion) {
  const palabras = normalizado.split(' ');
  let puntos = 0;
  for (const clave of intencion.claves) {
    if (clave.includes(' ')) {
      if (normalizado.includes(clave)) puntos += 2; // frase completa: pesa más
    } else if (clave.endsWith('*')) {
      const raiz = clave.slice(0, -1);
      if (palabras.some((p) => p.startsWith(raiz))) puntos += 1;
    } else if (palabras.includes(clave)) {
      puntos += 1;
    }
  }
  return puntos;
}

export function detectarIntencion(texto) {
  const n = normalizar(texto);
  let mejor = { id: null, puntos: 0 };
  for (const intencion of INTENCIONES) {
    const puntos = puntuar(n, intencion);
    if (puntos > mejor.puntos) mejor = { id: intencion.id, puntos };
  }
  return mejor.id;
}

// ---------- Respuestas con datos ----------

function notaDatos(datos) {
  return datos?.sin_conexion
    ? `Sin conexión: datos guardados${datos.guardada_en ? ` el ${fechaHora(datos.guardada_en)}` : ''}.`
    : undefined;
}

async function leerCatalogo(ctx) {
  try {
    return await ctx.catalogo();
  } catch {
    return null;
  }
}

const sinCatalogo = () => ({
  texto: ['No tengo el catálogo guardado en este equipo y no hay conexión.',
    'Cuando vuelva la conexión podré mostrarle el cacao disponible.'],
  acciones: [P('¿Funciona sin internet?')],
});

function itemProducto(p) {
  return { texto: `${p.nombre} (${p.codigo}): ${kg(p.cantidad_disponible)}, ${p.origen}`, href: `ficha.html?codigo=${encodeURIComponent(p.codigo)}` };
}

async function responderCatalogo(ctx, filtro = null) {
  const datos = await leerCatalogo(ctx);
  if (!datos) return sinCatalogo();
  const todos = datos.productos ?? [];
  const productos = filtro ? todos.filter(filtro.prueba) : todos;

  if (!todos.length) {
    return { texto: ['Por ahora no hay cacao disponible para la venta.', 'Cuando la asociación libere nuevos productos aparecerán en el catálogo.'],
      acciones: [P('¿Cómo compro?')], nota: notaDatos(datos) };
  }
  if (!productos.length) {
    return { texto: [`No hay productos disponibles ${filtro.descripcion}.`, 'Estos son los municipios con cacao disponible:'],
      lista: [...new Set(todos.map((p) => p.origen))].map((m) => ({ texto: m })), acciones: [IR_CATALOGO], nota: notaDatos(datos) };
  }

  const total = productos.reduce((s, p) => s + Number(p.cantidad_disponible), 0);
  const municipios = [...new Set(productos.map((p) => p.origen))];
  const ordenados = [...productos].sort((a, b) => b.cantidad_disponible - a.cantidad_disponible);
  return {
    texto: [
      `${filtro ? `${filtro.titulo}: hay` : 'Hay'} ${productos.length} ${productos.length === 1 ? 'producto disponible' : 'productos disponibles'}, `
        + `${kg(total)} en total${filtro ? '' : `, de ${municipios.join(', ')}`}.`,
      ordenados.length > 5 ? 'Los de mayor cantidad:' : 'Toque uno para ver su recorrido:',
    ],
    lista: ordenados.slice(0, 5).map(itemProducto),
    acciones: [IR_CATALOGO, P('¿Cómo compro?')],
    nota: notaDatos(datos),
  };
}

async function responderFicha(ctx, codigo) {
  let f;
  try {
    f = await ctx.ficha(codigo);
  } catch (error) {
    if (error?.estado === 404) {
      return { texto: [`No encontré un producto con el código ${codigo}.`, 'Revise la etiqueta: el código tiene la forma CAC001-P01.'], acciones: [IR_CATALOGO] };
    }
    return { texto: [`No pude consultar ${codigo}: no hay conexión y esa ficha no está guardada en este equipo.`,
      'Las fichas que ya se abrieron una vez sí se pueden consultar sin conexión.'], acciones: [IR_CATALOGO] };
  }

  const etapas = f.recorrido ?? [];
  return {
    texto: [
      `${f.nombre} (${f.codigo}) viene del lote ${f.origen.lote} de ${f.origen.municipio}, ${f.origen.departamento}, recibido el ${fecha(f.origen.fecha_recepcion)}.`,
      f.disponible_para_venta ? `${f.mensaje} Hay ${kg(f.presentacion.cantidad_disponible)}.` : f.mensaje,
      etapas.length ? `Su recorrido tiene ${etapas.length} ${etapas.length === 1 ? 'etapa' : 'etapas'}:` : 'Aún no tiene etapas registradas.',
    ],
    lista: etapas.map((e) => ({
      texto: `${e.etapa}, ${fecha(e.fecha)}`
        + (e.cantidad_entrada != null ? `: ${kg(e.cantidad_entrada)} a ${kg(e.cantidad_salida)}` : '')
        + (e.merma != null ? ` (merma ${e.merma} %)` : ''),
    })),
    acciones: [
      { texto: 'Ver el recorrido completo', tipo: 'enlace', destino: `ficha.html?codigo=${encodeURIComponent(f.codigo)}` },
      f.disponible_para_venta ? P('¿Cómo compro?') : IR_CATALOGO,
    ],
    nota: notaDatos(f),
  };
}

function espacio(ctx) {
  const u = ctx.usuario?.();
  if (!u) return null;
  return u.rol === 'cliente'
    ? { texto: 'Ir a mi tienda', tipo: 'enlace', destino: 'index.html#/tienda' }
    : { texto: 'Ir a mi espacio', tipo: 'enlace', destino: 'index.html#/lotes' };
}

// ---------- Respuestas fijas ----------

const FIJAS = {
  saludo: () => ({ texto: ['¡Hola! Soy el asistente de Kakawa.', '¿En qué le ayudo?'], acciones: SUGERENCIAS_INICIALES }),
  despedida: () => ({ texto: ['Con gusto. Si tiene otra pregunta, aquí estoy.'] }),
  ayuda: () => ({
    texto: ['Puedo ayudarle con:'],
    lista: [{ texto: 'El cacao disponible y de qué municipio viene' }, { texto: 'El recorrido de un producto por su código' },
      { texto: 'Cómo crear su cuenta y enviar una solicitud de compra' }, { texto: 'Qué es la trazabilidad, la merma y el control de calidad' },
      { texto: 'Cómo funciona Kakawa sin internet' }],
    acciones: SUGERENCIAS_INICIALES,
  }),
  precio: (ctx) => ({
    texto: ['Los precios se muestran solo a compradores registrados, dentro de la tienda.',
      'Crear la cuenta es gratis: después verá el precio por kilo de cada producto y podrá enviar su solicitud.'],
    acciones: [espacio(ctx) ?? IR_REGISTRO, IR_CATALOGO],
  }),
  comprar: (ctx) => ({
    texto: ['Para comprar:'],
    lista: [{ texto: '1. Cree su cuenta de comprador (nombre, documento, ciudad, correo, teléfono, usuario y contraseña).' },
      { texto: '2. En la tienda verá el precio de cada producto.' },
      { texto: '3. Envíe su solicitud con la cantidad en kilos.' },
      { texto: '4. La asociación la acepta o la rechaza; la respuesta aparece en "Mis solicitudes".' }],
    acciones: [espacio(ctx) ?? IR_REGISTRO, ...(espacio(ctx) ? [] : [IR_ACCESO]), IR_CATALOGO],
    nota: 'Sin conexión también puede enviar la solicitud: se guarda y se envía cuando vuelva la conexión.',
  }),
  registro: (ctx) => (ctx.usuario?.()
    ? { texto: [`Ya inició sesión como ${ctx.usuario().nombre}.`], acciones: [espacio(ctx)] }
    : { texto: ['Crear la cuenta toma un minuto. Le pediremos nombre completo, cédula o NIT, ciudad, correo, teléfono, un usuario y una contraseña de mínimo 8 caracteres con letras y números.',
      'Las cuentas que se crean aquí son de comprador. Las del personal las crea la asociación.'],
    acciones: [IR_REGISTRO] }),
  acceso: () => ({
    texto: ['Hay un solo inicio de sesión para todos: escriba su usuario y contraseña y Kakawa reconoce si es comprador, operador o administrador, y lo lleva a su espacio.',
      'Si ya inició sesión en este equipo, puede entrar aunque no haya internet.'],
    acciones: [IR_ACCESO, IR_REGISTRO],
  }),
  clave: () => ({
    texto: ['Por seguridad, la contraseña no se puede ver ni recuperar desde aquí.',
      'Si la olvidó, pida al administrador de la asociación que se la restablezca.'],
    acciones: [IR_ACCESO],
  }),
  consulta: () => ({
    texto: ['Escríbame el código del producto, por ejemplo CAC001-P01. Está impreso en la etiqueta, junto al código QR.',
      'También puede escanear el QR con la cámara del celular.'],
    esperaCodigo: true,
  }),
  trazabilidad: () => ({
    texto: ['La trazabilidad es la historia verificable de cada producto: de qué lote salió, de qué municipio, cuándo se recibió y por qué etapas pasó, con los kilos que entraron y salieron.',
      'Escríbame un código (CAC001-P01) y le muestro su recorrido.'],
    acciones: [CONSULTAR, IR_CATALOGO],
    esperaCodigo: true,
  }),
  merma: () => ({
    texto: ['La merma es lo que se pierde en una etapa, por ejemplo el agua que se evapora en el secado.',
      'Se calcula así: (entrada − salida) ÷ entrada × 100. Si entran 100 kg y salen 80 kg, la merma es 20 %.',
      'Cuando una etapa supera el 15 %, Kakawa genera una alerta para que la asociación la revise.'],
    acciones: [P('¿Cómo controlan la calidad?')],
  }),
  calidad: () => ({
    texto: ['Cada producto nace "pendiente" y solo se vende cuando la asociación lo libera.',
      'Si un lote presenta un problema, se bloquea con un motivo y todos sus productos quedan bloqueados al instante: nadie puede comprarlos y la ficha lo indica.'],
    acciones: [IR_CATALOGO],
  }),
  proceso: () => ({
    texto: ['Así trabajamos:'],
    lista: [{ texto: '1. Recepción: cada lote entra con su origen, productor, fecha y kilos.' },
      { texto: '2. Transformación: fermentación, secado y tostión, con la merma de cada etapa.' },
      { texto: '3. Control de calidad: la asociación libera o bloquea, siempre con motivo.' },
      { texto: '4. Venta: usted elige en el catálogo, revisa el recorrido y envía su solicitud.' }],
    acciones: [IR_CATALOGO],
  }),
  asociacion: () => ({
    texto: ['Kakawa reúne a productores de cacao del Huila que reciben, fermentan, secan y transforman su cacao en conjunto.',
      'Este sitio centraliza el catálogo para compradores y el acceso del personal de la asociación.'],
    acciones: [P('¿Cómo trabajan?'), IR_CATALOGO],
  }),
  sin_conexion: () => ({
    texto: ['Sí. Kakawa se puede usar sin internet:',
      'Este sitio y este asistente abren aunque no haya conexión. El catálogo y las fichas que ya se consultaron se muestran con la fecha en que se guardaron.',
      'Si ya inició sesión en este equipo, puede entrar a su espacio: lo que registre se guarda en el equipo y se envía solo cuando vuelve la conexión.'],
    acciones: [P('¿Qué cacao hay disponible?')],
  }),
  contacto: (ctx) => ({
    texto: ['La forma más directa de contactar a la asociación es enviar una solicitud de compra desde su cuenta: puede escribir un mensaje y la respuesta llega a "Mis solicitudes".'],
    acciones: [espacio(ctx) ?? IR_REGISTRO],
    nota: 'Los datos de este sitio son simulados para la demostración.',
  }),
};

const NO_ENTENDI = () => ({
  texto: ['No estoy seguro de haber entendido.', 'Puedo ayudarle con estas preguntas:'],
  acciones: SUGERENCIAS_INICIALES,
});

/**
 * Responde un mensaje.
 * @param {string} texto
 * @param {{ catalogo: () => Promise<object>, ficha: (codigo: string) => Promise<object>, usuario?: () => object|null, esperaCodigo?: boolean }} ctx
 */
export async function responder(texto, ctx) {
  const n = normalizar(texto);
  if (!n) return NO_ENTENDI();

  // 1. Un código de producto manda sobre todo lo demás.
  const producto = texto.match(CODIGO_PRODUCTO)?.[0];
  if (producto) return responderFicha(ctx, producto.toUpperCase());

  // 2. Un código de lote: los productos disponibles de ese lote.
  const lote = texto.match(CODIGO_LOTE)?.[0]?.toUpperCase();
  if (lote) {
    const r = await responderCatalogo(ctx, { prueba: (p) => p.lote === lote, titulo: `Del lote ${lote}`, descripcion: `del lote ${lote}` });
    r.texto.push('Las fichas públicas son por producto: toque uno para ver su recorrido.');
    return r;
  }

  // 3. Un municipio del catálogo ("¿tienen cacao de Rivera?").
  const datos = await leerCatalogo(ctx);
  const municipio = [...new Set((datos?.productos ?? []).map((p) => p.origen))].find((m) => n.includes(normalizar(m)));
  if (municipio) {
    return responderCatalogo(ctx, { prueba: (p) => p.origen === municipio, titulo: `De ${municipio}`, descripcion: `de ${municipio}` });
  }

  // 4. Esperaba un código y no llegó.
  if (ctx.esperaCodigo && /\d/.test(n)) {
    return { texto: ['Ese no parece un código de producto. Tiene la forma CAC001-P01 (lote, guion, producto).'], esperaCodigo: true };
  }

  // 5. Intención por palabras clave.
  const intencion = detectarIntencion(texto);
  if (intencion === 'catalogo' || intencion === 'municipios') return responderCatalogo(ctx);
  if (intencion && FIJAS[intencion]) return FIJAS[intencion](ctx);
  return NO_ENTENDI();
}
