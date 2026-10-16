const ECC_POR_BLOQUE = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOQUES = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const NIVEL_M = 0; // bits de formato para el nivel M

function modulosDeDatos(version) {
  let resultado = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alineaciones = Math.floor(version / 7) + 2;
    resultado -= (25 * alineaciones - 10) * alineaciones - 55;
    if (version >= 7) resultado -= 36;
  }
  return resultado;
}

const capacidad = (v) => Math.floor(modulosDeDatos(v) / 8) - ECC_POR_BLOQUE[v] * BLOQUES[v];

// Reed-Solomon en GF(256)
function multiplicar(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}


function divisor(grado) {
  const resultado = new Array(grado - 1).fill(0).concat([1]);
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < resultado.length; j++) {
      resultado[j] = multiplicar(resultado[j], raiz);
      if (j + 1 < resultado.length) resultado[j] ^= resultado[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return resultado;
}

function residuo(datos, div) {
  const resultado = div.map(() => 0);
  for (const b of datos) {
    const factor = b ^ resultado.shift();
    resultado.push(0);
    div.forEach((coef, i) => { resultado[i] ^= multiplicar(coef, factor); });
  }
  return resultado;
}


function codificar(bytes) {
  let version = 1;
  while (version <= 10 && bytes.length + (version < 10 ? 2 : 3) > capacidad(version)) version++;
  if (version > 10) throw new Error('El texto es demasiado largo para el código QR.');

  const bits = [];
  const poner = (valor, largo) => { for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  poner(0b0100, 4); // modo byte

  poner(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => poner(b, 8));

  const capacidadBits = capacidad(version) * 8;
  poner(0, Math.min(4, capacidadBits - bits.length));
  poner(0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < capacidadBits; relleno ^= 0xec ^ 0x11) poner(relleno, 8);

  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  
  const total = Math.floor(modulosDeDatos(version) / 8);
  const nBloques = BLOQUES[version];
  const nEcc = ECC_POR_BLOQUE[version];
  const cortos = nBloques - (total % nBloques);
  const largoCorto = Math.floor(total / nBloques);
  const div = divisor(nEcc);

  const bloques = [];
  for (let i = 0, k = 0; i < nBloques; i++) {
    const tam = largoCorto - nEcc + (i < cortos ? 0 : 1);
    const dat = datos.slice(k, k + tam);
    k += tam;
    const ecc = residuo(dat, div);
    if (i < cortos) dat.push(0);
    bloques.push(dat.concat(ecc));
  }

  const final = [];
  for (let i = 0; i < bloques[0].length; i++) {
    bloques.forEach((bloque, j) => {

      if (i !== largoCorto - nEcc || j >= cortos) final.push(bloque[i]);
    });
  }
  return { version, codigos: final };
}

function construir(version, codigos) {
  const tam = version * 4 + 17;
  const modulos = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const funcion = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const fijar = (x, y, oscuro) => { modulos[y][x] = oscuro; funcion[y][x] = true; };

  for (let i = 0; i < tam; i++) { fijar(6, i, i % 2 === 0); fijar(i, 6, i % 2 === 0); }

  const buscador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx; const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < tam && y >= 0 && y < tam) fijar(x, y, d !== 2 && d !== 4);
      }
    }
  };
  buscador(3, 3); buscador(tam - 4, 3); buscador(3, tam - 4);

  if (version >= 2) {
    const n = Math.floor(version / 7) + 2;
    const paso = Math.floor((version * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const pos = [6];
    for (let p = tam - 7; pos.length < n; p -= paso) pos.splice(1, 0, p);
    pos.forEach((y, i) => pos.forEach((x, j) => {

      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fijar(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
  }

  const formato = (mascara) => {
    const dato = (NIVEL_M << 3) | mascara;
    let r = dato;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((dato << 10) | r) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) fijar(8, i, bit(i));
    fijar(8, 7, bit(6)); fijar(8, 8, bit(7)); fijar(7, 8, bit(8));
    for (let i = 9; i < 15; i++) fijar(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) fijar(tam - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) fijar(8, tam - 15 + i, bit(i));
    fijar(8, tam - 8, true);
  };
  formato(0);

  if (version >= 7) {
    let r = version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (version << 12) | r;
    for (let i = 0; i < 18; i++) {
      const oscuro = ((b >>> i) & 1) !== 0;
      const a = tam - 11 + (i % 3); const c = Math.floor(i / 3);
      fijar(a, c, oscuro); fijar(c, a, oscuro);
    }
  }

 

  let i = 0;
  for (let derecha = tam - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let v = 0; v < tam; v++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const subiendo = ((derecha + 1) & 2) === 0;
        const y = subiendo ? tam - 1 - v : v;
        if (!funcion[y][x] && i < codigos.length * 8) {
          modulos[y][x] = ((codigos[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

 
  const aplicar = (m) => {
    for (let y = 0; y < tam; y++) {
      for (let x = 0; x < tam; x++) {
        if (funcion[y][x]) continue;
        const inv = [
          (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
          (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, ((x * y) % 2) + ((x * y) % 3) === 0,
          (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
        ][m];
        if (inv) modulos[y][x] = !modulos[y][x];
      }
    }
  };

  let mejor = 0; let menor = Infinity;

  for (let m = 0; m < 8; m++) {
    aplicar(m); formato(m);
    const p = penalizacion(modulos);
    if (p < menor) { menor = p; mejor = m; }
    aplicar(m);
  }
  aplicar(mejor); formato(mejor);
  return modulos;
}

function penalizacion(m) {
  const tam = m.length;
  let total = 0;
  const lineas = (obtener) => {
    for (let a = 0; a < tam; a++) {
      let racha = 1;
      for (let b = 1; b <= tam; b++) {
        if (b < tam && obtener(a, b) === obtener(a, b - 1)) racha++;
        else { if (racha >= 5) total += racha - 2; racha = 1; }
      }
      for (let b = 0; b + 10 < tam + 1; b++) {
        const s = Array.from({ length: 11 }, (_, k) => (b + k < tam ? obtener(a, b + k) : false));
        const patron = [true, false, true, true, true, false, true];
        const ok = (inicio) => patron.every((v, k) => s[inicio + k] === v);
        if ((ok(0) && !s[7] && !s[8] && !s[9] && !s[10]) || (ok(4) && !s[0] && !s[1] && !s[2] && !s[3])) total += 40;
      }
    }
  };
  lineas((a, b) => m[a][b]);
  lineas((a, b) => m[b][a]);
  let oscuros = 0;
  for (let y = 0; y < tam; y++) {

    for (let x = 0; x < tam; x++) {
      if (m[y][x]) oscuros++;
      if (x + 1 < tam && y + 1 < tam && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) total += 3;
    }
  }
  total += Math.floor(Math.abs(oscuros * 20 - tam * tam * 10) / (tam * tam)) * 10;
  return total;
}


export function codigoQr(texto, { etiqueta = 'Código QR', margen = 4, color = '#2b1d14' } = {}) {
  const { version, codigos } = codificar(Array.from(new TextEncoder().encode(texto)));
  const modulos = construir(version, codigos);
  const tam = modulos.length + margen * 2;

  let trazo = '';
  modulos.forEach((fila, y) => fila.forEach((oscuro, x) => {
    if (oscuro) trazo += `M${x + margen},${y + margen}h1v1h-1z`;
  }));

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${tam} ${tam}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', etiqueta);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const fondo = document.createElementNS(ns, 'rect');
  fondo.setAttribute('width', String(tam));
  fondo.setAttribute('height', String(tam));
  fondo.setAttribute('fill', '#ffffff');
  const camino = document.createElementNS(ns, 'path');
  camino.setAttribute('d', trazo);

  camino.setAttribute('fill', color);
  svg.append(fondo, camino);
  return svg;
}

export const _interno = { codificar, construir }; // para pruebas
