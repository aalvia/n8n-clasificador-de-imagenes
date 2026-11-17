const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');
const { PNG } = require('pngjs');

const RAIZ = path.join(__dirname, '..');
const MODELO = path.join(RAIZ, 'modelos', 'mnist-8.onnx');
const EJEMPLOS = path.join(RAIZ, 'ejemplos');
const IMAGENES = path.join(RAIZ, 'imagenes');

const MODELOS = [
  'https://huggingface.co/amd/mnist-8/resolve/main/mnist-8.onnx',
  'https://media.githubusercontent.com/media/onnx/models/main/validated/vision/classification/mnist/model/mnist-8.onnx',
];

const MNIST_IMAGENES = 'https://ossci-datasets.s3.amazonaws.com/mnist/t10k-images-idx3-ubyte.gz';
const MNIST_ETIQUETAS = 'https://ossci-datasets.s3.amazonaws.com/mnist/t10k-labels-idx1-ubyte.gz';

function asegurarCarpetas() {
  fs.mkdirSync(path.dirname(MODELO), { recursive: true });
  fs.mkdirSync(EJEMPLOS, { recursive: true });
  fs.mkdirSync(path.join(IMAGENES, 'entrada'), { recursive: true });
  for (let digito = 0; digito <= 9; digito += 1) {
    fs.mkdirSync(path.join(IMAGENES, String(digito)), { recursive: true });
  }
}

function descargar(url, destino) {
  return new Promise((resolve, reject) => {
    const solicitud = https.get(url, (respuesta) => {
      if (respuesta.statusCode >= 300 && respuesta.statusCode < 400 && respuesta.headers.location) {
        respuesta.resume();
        descargar(respuesta.headers.location, destino).then(resolve, reject);
        return;
      }
      if (respuesta.statusCode !== 200) {
        respuesta.resume();
        reject(new Error(`HTTP ${respuesta.statusCode} al descargar ${url}`));
        return;
      }
      const archivo = fs.createWriteStream(destino);
      respuesta.pipe(archivo);
      archivo.on('finish', () => archivo.close(() => resolve()));
      archivo.on('error', reject);
    });
    solicitud.on('error', reject);
  });
}

async function asegurarModelo() {
  if (fs.existsSync(MODELO) && fs.statSync(MODELO).size > 5000) return;
  fs.mkdirSync(path.dirname(MODELO), { recursive: true });
  let ultimoError;
  for (const url of MODELOS) {
    try {
      console.log(`Descargando modelo MNIST desde ${url}`);
      await descargar(url, MODELO);
      const inicio = fs.readFileSync(MODELO).subarray(0, 1);
      if (fs.statSync(MODELO).size > 5000 && inicio[0] !== 60) return;
      fs.unlinkSync(MODELO);
      ultimoError = new Error('el archivo descargado no es el modelo');
    } catch (error) {
      ultimoError = error;
      if (fs.existsSync(MODELO)) fs.unlinkSync(MODELO);
    }
  }
  throw ultimoError;
}

function leerIdxImagenes(buffer) {
  if (buffer.readInt32BE(0) !== 2051) throw new Error('archivo de imagenes MNIST invalido');
  const cantidad = buffer.readInt32BE(4);
  const alto = buffer.readInt32BE(8);
  const ancho = buffer.readInt32BE(12);
  return { cantidad, alto, ancho, pixeles: buffer.subarray(16) };
}

function leerIdxEtiquetas(buffer) {
  if (buffer.readInt32BE(0) !== 2049) throw new Error('archivo de etiquetas MNIST invalido');
  return buffer.subarray(8);
}

async function asegurarEjemplos() {
  if (fs.existsSync(path.join(EJEMPLOS, '0.png')) && fs.existsSync(path.join(EJEMPLOS, '9.png'))) return;
  console.log('Descargando ejemplos manuscritos del 0 al 9');
  const temporal = path.join(RAIZ, 'data');
  fs.mkdirSync(temporal, { recursive: true });
  const imagenesGz = path.join(temporal, 't10k-images-idx3-ubyte.gz');
  const etiquetasGz = path.join(temporal, 't10k-labels-idx1-ubyte.gz');
  await descargar(MNIST_IMAGENES, imagenesGz);
  await descargar(MNIST_ETIQUETAS, etiquetasGz);
  const imagenes = leerIdxImagenes(zlib.gunzipSync(fs.readFileSync(imagenesGz)));
  const etiquetas = leerIdxEtiquetas(zlib.gunzipSync(fs.readFileSync(etiquetasGz)));
  const vistos = new Set();
  const tamano = imagenes.alto * imagenes.ancho;
  for (let indice = 0; indice < etiquetas.length && vistos.size < 10; indice += 1) {
    const digito = etiquetas[indice];
    if (vistos.has(digito)) continue;
    vistos.add(digito);
    const png = new PNG({ width: imagenes.ancho, height: imagenes.alto });
    const origen = imagenes.pixeles.subarray(indice * tamano, (indice + 1) * tamano);
    for (let i = 0; i < tamano; i += 1) {
      const valor = origen[i];
      png.data[i * 4] = valor;
      png.data[i * 4 + 1] = valor;
      png.data[i * 4 + 2] = valor;
      png.data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(path.join(EJEMPLOS, `${digito}.png`), PNG.sync.write(png));
  }
  fs.unlinkSync(imagenesGz);
  fs.unlinkSync(etiquetasGz);
  if (vistos.size !== 10) throw new Error('no encontre los diez digitos en los ejemplos');
}

function crearParaSubir() {
  const destino = path.join(RAIZ, 'para-subir');
  fs.mkdirSync(destino, { recursive: true });
  const escala = 8;
  for (let digito = 0; digito <= 9; digito += 1) {
    const png = PNG.sync.read(fs.readFileSync(path.join(EJEMPLOS, `${digito}.png`)));
    const grande = new PNG({ width: png.width * escala, height: png.height * escala });
    for (let y = 0; y < grande.height; y += 1) {
      for (let x = 0; x < grande.width; x += 1) {
        const origen = ((Math.floor(y / escala) * png.width) + Math.floor(x / escala)) * 4;
        const tinta = 255 - png.data[origen];
        const pixel = ((y * grande.width) + x) * 4;
        grande.data[pixel] = tinta;
        grande.data[pixel + 1] = tinta;
        grande.data[pixel + 2] = tinta;
        grande.data[pixel + 3] = 255;
      }
    }
    fs.writeFileSync(path.join(destino, `numero-${digito}.png`), PNG.sync.write(grande));
  }
}

async function preparar() {
  asegurarCarpetas();
  await asegurarModelo();
  await asegurarEjemplos();
  crearParaSubir();
  console.log('Modelo, ejemplos y carpeta para-subir listos');
}

if (require.main === module) {
  preparar().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { preparar, MODELO, EJEMPLOS, IMAGENES };
