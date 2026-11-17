const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const ort = require('onnxruntime-node');

const RAIZ = path.join(__dirname, '..');
const MODELO = path.join(RAIZ, 'modelos', 'mnist-8.onnx');
const ENTRADA = path.join(RAIZ, 'imagenes', 'entrada');
const IMAGENES = path.join(RAIZ, 'imagenes');

let sesion;

function nombreSeguro(nombre) {
  const base = path.basename(String(nombre || ''));
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(base)) return null;
  if (!/\.(png|jpe?g)$/i.test(base)) return null;
  return base;
}

function rutaEntrada(nombre) {
  const seguro = nombreSeguro(nombre);
  if (!seguro) return null;
  return path.join(ENTRADA, seguro);
}

function rutaDestino(digito, nombre) {
  const seguro = nombreSeguro(nombre);
  if (!seguro || digito < 0 || digito > 9) return null;
  return path.join(IMAGENES, String(digito), seguro);
}

function decodificar(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNG.sync.read(buffer);
    return { ancho: png.width, alto: png.height, rgba: png.data };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const jpg = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return { ancho: jpg.width, alto: jpg.height, rgba: jpg.data };
  }
  throw new Error('usa una imagen PNG o JPG');
}

function gris(rgba, indice) {
  const origen = indice * 4;
  return (0.299 * rgba[origen]) + (0.587 * rgba[origen + 1]) + (0.114 * rgba[origen + 2]);
}

function preparar(buffer) {
  const { ancho, alto, rgba } = decodificar(buffer);
  const cantidad = ancho * alto;
  const pixel = new Float32Array(cantidad);
  let suma = 0;
  for (let i = 0; i < cantidad; i += 1) {
    pixel[i] = gris(rgba, i);
    suma += pixel[i];
  }
  const fondoClaro = suma / cantidad > 127;
  if (fondoClaro) {
    for (let i = 0; i < cantidad; i += 1) pixel[i] = 255 - pixel[i];
  }
  if (ancho === 28 && alto === 28) {
    const directo = new Float32Array(784);
    for (let i = 0; i < 784; i += 1) directo[i] = pixel[i] / 255;
    return directo;
  }

  let minX = ancho;
  let minY = alto;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      if (pixel[(y * ancho) + x] > 30) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = ancho - 1;
    maxY = alto - 1;
  }
  const cajaAncho = maxX - minX + 1;
  const cajaAlto = maxY - minY + 1;
  const escala = 20 / Math.max(cajaAncho, cajaAlto);
  const destinoAncho = cajaAncho * escala;
  const destinoAlto = cajaAlto * escala;
  const destinoX = (28 - destinoAncho) / 2;
  const destinoY = (28 - destinoAlto) / 2;
  const salida = new Float32Array(784);
  for (let y = 0; y < 28; y += 1) {
    for (let x = 0; x < 28; x += 1) {
      const sx = minX + ((x + 0.5 - destinoX) / escala);
      const sy = minY + ((y + 0.5 - destinoY) / escala);
      salida[(y * 28) + x] = muestra(pixel, ancho, alto, sx, sy) / 255;
    }
  }
  return salida;
}

function muestra(pixel, ancho, alto, x, y) {
  if (x < 0 || y < 0 || x >= ancho - 1 || y >= alto - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const arriba = (pixel[(y0 * ancho) + x0] * (1 - dx)) + (pixel[(y0 * ancho) + x0 + 1] * dx);
  const abajo = (pixel[((y0 + 1) * ancho) + x0] * (1 - dx)) + (pixel[((y0 + 1) * ancho) + x0 + 1] * dx);
  return (arriba * (1 - dy)) + (abajo * dy);
}

function probabilidades(valores) {
  const puntajes = Array.from(valores);
  const maximo = Math.max(...puntajes);
  const expuestos = puntajes.map((valor) => Math.exp(valor - maximo));
  const total = expuestos.reduce((suma, valor) => suma + valor, 0);
  const yaSonProbabilidades = puntajes.every((valor) => valor >= 0 && valor <= 1)
    && Math.abs(puntajes.reduce((suma, valor) => suma + valor, 0) - 1) < 0.05;
  return yaSonProbabilidades ? puntajes : expuestos.map((valor) => valor / total);
}

async function sesionModelo() {
  if (!sesion) sesion = await ort.InferenceSession.create(MODELO);
  return sesion;
}

async function clasificarBuffer(buffer) {
  const modelo = await sesionModelo();
  const tensor = new ort.Tensor('float32', preparar(buffer), [1, 1, 28, 28]);
  const salida = await modelo.run({ [modelo.inputNames[0]]: tensor });
  const prob = probabilidades(salida[modelo.outputNames[0]].data);
  let digito = 0;
  for (let i = 1; i < prob.length; i += 1) {
    if (prob[i] > prob[digito]) digito = i;
  }
  return { digito, confianza: prob[digito] };
}

async function clasificarNombre(nombre) {
  const origen = rutaEntrada(nombre);
  if (!origen || !fs.existsSync(origen)) {
    throw new Error('esa imagen no esta en la bandeja de entrada');
  }
  const resultado = await clasificarBuffer(fs.readFileSync(origen));
  const seguro = nombreSeguro(nombre);
  const destino = rutaDestino(resultado.digito, seguro);
  return {
    nombre: seguro,
    digito: resultado.digito,
    confianza: Number(resultado.confianza.toFixed(4)),
    origen: origen.replace(/\\/g, '/'),
    destino: destino.replace(/\\/g, '/'),
  };
}

module.exports = {
  ENTRADA,
  IMAGENES,
  clasificarBuffer,
  clasificarNombre,
  nombreSeguro,
  rutaDestino,
  rutaEntrada,
};
