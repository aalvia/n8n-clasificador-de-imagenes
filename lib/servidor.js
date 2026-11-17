const fs = require('fs');
const http = require('http');
const path = require('path');
const clasificar = require('./clasificar');
const { preparar } = require('./preparar');

const PUERTO = Number(process.env.PUERTO_DEMO || 3456);
const MOVIMIENTOS = path.join(__dirname, '..', 'data', 'movimientos.json');
const EJEMPLOS = path.join(__dirname, '..', 'ejemplos');

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    let tamano = 0;
    req.on('data', (trozo) => {
      tamano += trozo.length;
      if (tamano > 12 * 1024 * 1024) {
        reject(new Error('las imagenes pesan demasiado'));
        req.destroy();
        return;
      }
      trozos.push(trozo);
    });
    req.on('end', () => {
      const texto = Buffer.concat(trozos).toString('utf8').trim();
      if (!texto) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(texto));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function enviar(res, codigo, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

function enviarHtml(res, html) {
  const cuerpo = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': cuerpo.length,
  });
  res.end(cuerpo);
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listar(carpeta) {
  if (!fs.existsSync(carpeta)) return [];
  return fs.readdirSync(carpeta)
    .filter((nombre) => clasificar.nombreSeguro(nombre))
    .sort();
}

function tablero() {
  const carpetas = {};
  for (let digito = 0; digito <= 9; digito += 1) {
    carpetas[digito] = listar(path.join(clasificar.IMAGENES, String(digito)));
  }
  let ultimos = [];
  try {
    ultimos = JSON.parse(fs.readFileSync(MOVIMIENTOS, 'utf8'));
  } catch (error) {
    ultimos = [];
  }
  return { entrada: listar(clasificar.ENTRADA), carpetas, ultimos };
}

function registrar(movimiento) {
  let ultimos = [];
  try {
    ultimos = JSON.parse(fs.readFileSync(MOVIMIENTOS, 'utf8'));
  } catch (error) {
    ultimos = [];
  }
  ultimos.unshift(movimiento);
  fs.mkdirSync(path.dirname(MOVIMIENTOS), { recursive: true });
  fs.writeFileSync(MOVIMIENTOS, JSON.stringify(ultimos.slice(0, 30), null, 2));
}

function guardarSubida(imagen, indice) {
  const datos = String(imagen.datos || '');
  const base64 = datos.includes(',') ? datos.slice(datos.indexOf(',') + 1) : datos;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) {
    throw new Error('una imagen esta vacia o pesa mas de 3 MB');
  }
  const extension = buffer[0] === 0xff && buffer[1] === 0xd8 ? 'jpg' : 'png';
  if (extension === 'png' && buffer[0] !== 0x89) throw new Error('usa PNG o JPG');
  const nombre = `foto-${Date.now()}-${indice}.${extension}`;
  fs.writeFileSync(path.join(clasificar.ENTRADA, nombre), buffer);
  return nombre;
}

function copiarEjemplos() {
  const copiados = [];
  for (let digito = 0; digito <= 9; digito += 1) {
    const origen = path.join(EJEMPLOS, `${digito}.png`);
    const nombre = `ejemplo-${digito}.png`;
    fs.copyFileSync(origen, path.join(clasificar.ENTRADA, nombre));
    copiados.push(nombre);
  }
  return copiados;
}

function llamarN8n() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      'http://127.0.0.1:5678/webhook/clasificar',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 }, timeout: 10000 },
      (res) => {
        res.resume();
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`n8n respondio ${res.statusCode}. Abre el flujo Clasificar digitos y activalo.`));
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('n8n no contesto')));
    req.on('error', () => reject(new Error('n8n no esta encendido. Ejecuta .\\iniciar.ps1')));
    req.end('{}');
  });
}

async function procesar() {
  await llamarN8n();
  const limite = Date.now() + 20000;
  let estado = tablero();
  while (estado.entrada.length && Date.now() < limite) {
    await esperar(400);
    estado = tablero();
  }
  return estado;
}

function servirArchivo(res, digito, nombre) {
  const seguro = clasificar.nombreSeguro(nombre);
  const carpeta = digito === 'entrada' ? clasificar.ENTRADA : path.join(clasificar.IMAGENES, digito);
  if (!seguro || (digito !== 'entrada' && !/^[0-9]$/.test(digito))) {
    enviar(res, 404, { error: 'archivo no encontrado' });
    return;
  }
  const ruta = path.join(carpeta, seguro);
  if (!fs.existsSync(ruta)) {
    enviar(res, 404, { error: 'archivo no encontrado' });
    return;
  }
  const cuerpo = fs.readFileSync(ruta);
  const tipo = seguro.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': cuerpo.length, 'Cache-Control': 'no-store' });
  res.end(cuerpo);
}

const PAGINA = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Digitos 0 a 9</title>
  <style>
    body { margin: 0; font-family: Segoe UI, sans-serif; background: #f4f6f8; color: #1c2430; }
    header { background: #1f4b99; color: white; padding: 16px 20px; }
    header h1 { margin: 0; font-size: 22px; }
    header p { margin: 6px 0 0; font-size: 14px; opacity: .9; }
    main { padding: 16px 20px 32px; }
    .acciones { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
    button, input[type=file] { font: inherit; }
    button { background: #1f4b99; color: white; border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
    button.secundario { background: #4d627f; }
    button:disabled { opacity: .6; cursor: wait; }
    #estado { min-height: 1.4em; margin: 8px 0 16px; }
    .rejilla { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; }
    .caja { background: white; border-radius: 10px; padding: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .caja h2 { margin: 0 0 8px; font-size: 18px; }
    .caja img { width: 56px; height: 56px; object-fit: contain; background: #111; image-rendering: pixelated; margin: 2px; }
    ul { padding-left: 18px; }
  </style>
</head>
<body>
  <header>
    <h1>Digitos del 0 al 9</h1>
    <p>El modelo solo dice el numero. n8n mueve la imagen a la carpeta de ese digito.</p>
  </header>
  <main>
    <div class="acciones">
      <input id="archivos" type="file" accept="image/png,image/jpeg" multiple>
      <button id="subir" type="button">Subir y clasificar</button>
      <button id="ejemplos" class="secundario" type="button">Usar ejemplos 0 a 9</button>
    </div>
    <div id="estado">Puedes subir varias imagenes a la vez, o cargar los diez ejemplos manuscritos.</div>
    <ul id="ultimos"></ul>
    <div id="rejilla" class="rejilla"></div>
  </main>
  <script>
    const estado = document.getElementById('estado');
    const ultimos = document.getElementById('ultimos');
    const rejilla = document.getElementById('rejilla');
    const botones = [document.getElementById('subir'), document.getElementById('ejemplos')];
    function pintar(datos) {
      ultimos.innerHTML = '';
      (datos.ultimos || []).slice(0, 10).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item.nombre + ' → carpeta ' + item.digito + ' (' + Math.round(item.confianza * 100) + '%)';
        ultimos.appendChild(li);
      });
      rejilla.innerHTML = '';
      for (let digito = 0; digito <= 9; digito += 1) {
        const caja = document.createElement('section');
        caja.className = 'caja';
        const titulo = document.createElement('h2');
        titulo.textContent = String(digito);
        caja.appendChild(titulo);
        (datos.carpetas[digito] || datos.carpetas[String(digito)] || []).forEach((nombre) => {
          const img = document.createElement('img');
          img.src = '/ver/' + digito + '/' + encodeURIComponent(nombre) + '?t=' + Date.now();
          img.alt = nombre;
          caja.appendChild(img);
        });
        rejilla.appendChild(caja);
      }
    }
    async function correr(paso) {
      botones.forEach((boton) => { boton.disabled = true; });
      estado.textContent = 'Enviando las imagenes a n8n...';
      try {
        await paso();
        const respuesta = await fetch('/procesar', { method: 'POST' });
        const datos = await respuesta.json();
        if (!respuesta.ok) throw new Error(datos.error || 'no se pudo clasificar');
        pintar(datos);
        estado.textContent = datos.entrada.length
          ? 'Quedaron imagenes en la entrada. Revisa que el flujo de n8n este activo.'
          : 'Listo. n8n movio las imagenes.';
      } catch (error) {
        estado.textContent = error.message;
      }
      botones.forEach((boton) => { boton.disabled = false; });
    }
    document.getElementById('subir').onclick = () => correr(async () => {
      const archivos = Array.from(document.getElementById('archivos').files || []);
      if (!archivos.length) throw new Error('elige una o varias imagenes');
      const imagenes = [];
      for (const archivo of archivos) {
        const datos = await new Promise((resolve, reject) => {
          const lector = new FileReader();
          lector.onload = () => resolve(lector.result);
          lector.onerror = () => reject(new Error('no pude leer una imagen'));
          lector.readAsDataURL(archivo);
        });
        imagenes.push({ nombre: archivo.name, datos });
      }
      const respuesta = await fetch('/subir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagenes }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'no se pudieron guardar');
    });
    document.getElementById('ejemplos').onclick = () => correr(async () => {
      const respuesta = await fetch('/ejemplos', { method: 'POST' });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'no pude copiar los ejemplos');
    });
    fetch('/tablero').then((respuesta) => respuesta.json()).then(pintar);
  </script>
</body>
</html>`;

async function manejar(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/demo')) {
    enviarHtml(res, PAGINA);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/salud') {
    enviar(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/tablero') {
    enviar(res, 200, tablero());
    return;
  }
  if (req.method === 'GET' && url.pathname === '/pendientes') {
    const archivos = listar(clasificar.ENTRADA).map((nombre) => ({
      nombre,
      origen: clasificar.rutaEntrada(nombre).replace(/\\/g, '/'),
    }));
    enviar(res, 200, { archivos });
    return;
  }
  const ver = url.pathname.match(/^\/ver\/([^/]+)\/([^/]+)$/);
  if (req.method === 'GET' && ver) {
    servirArchivo(res, ver[1], decodeURIComponent(ver[2]));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/subir') {
    const cuerpo = await leerCuerpo(req);
    const imagenes = Array.isArray(cuerpo.imagenes) ? cuerpo.imagenes.slice(0, 12) : [];
    if (!imagenes.length) {
      enviar(res, 400, { error: 'no llegaron imagenes' });
      return;
    }
    const guardadas = imagenes.map((imagen, indice) => guardarSubida(imagen, indice));
    enviar(res, 200, { guardadas });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/ejemplos') {
    enviar(res, 200, { guardadas: copiarEjemplos() });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/procesar') {
    enviar(res, 200, await procesar());
    return;
  }
  if (req.method === 'POST' && url.pathname === '/clasificar') {
    const cuerpo = await leerCuerpo(req);
    const resultado = await clasificar.clasificarNombre(cuerpo.nombre);
    console.log(`${resultado.nombre} -> ${resultado.digito} (${resultado.confianza})`);
    enviar(res, 200, resultado);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/quitar') {
    const cuerpo = await leerCuerpo(req);
    const nombre = clasificar.nombreSeguro(cuerpo.nombre);
    const digito = Number(cuerpo.digito);
    const origen = clasificar.rutaEntrada(nombre);
    const destino = clasificar.rutaDestino(digito, nombre);
    if (!origen || !destino || !fs.existsSync(destino)) {
      enviar(res, 409, { error: 'n8n todavia no guardo la imagen en su carpeta' });
      return;
    }
    if (fs.existsSync(origen)) fs.unlinkSync(origen);
    registrar({
      nombre,
      digito,
      confianza: Number(cuerpo.confianza) || 0,
      cuando: new Date().toISOString(),
    });
    enviar(res, 200, { ok: true, nombre, digito });
    return;
  }
  enviar(res, 404, { error: 'ruta no encontrada' });
}

preparar().then(() => {
  const servidor = http.createServer((req, res) => {
    manejar(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) enviar(res, 500, { error: error.message || 'error interno' });
    });
  });
  servidor.listen(PUERTO, '127.0.0.1', () => {
    console.log(`Demo de digitos en http://127.0.0.1:${PUERTO}`);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
