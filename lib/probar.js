const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { clasificarBuffer } = require('./clasificar');

async function probar() {
  for (let digito = 0; digito <= 9; digito += 1) {
    const buffer = fs.readFileSync(path.join(__dirname, '..', 'ejemplos', `${digito}.png`));
    const resultado = await clasificarBuffer(buffer);
    if (resultado.digito !== digito) {
      throw new Error(`el ejemplo ${digito} se clasifico como ${resultado.digito}`);
    }
    const png = PNG.sync.read(buffer);
    const escala = 4;
    const fotoPng = new PNG({ width: png.width * escala, height: png.height * escala });
    for (let y = 0; y < fotoPng.height; y += 1) {
      for (let x = 0; x < fotoPng.width; x += 1) {
        const origen = ((Math.floor(y / escala) * png.width) + Math.floor(x / escala)) * 4;
        const destino = ((y * fotoPng.width) + x) * 4;
        fotoPng.data[destino] = 255 - png.data[origen];
        fotoPng.data[destino + 1] = 255 - png.data[origen + 1];
        fotoPng.data[destino + 2] = 255 - png.data[origen + 2];
        fotoPng.data[destino + 3] = 255;
      }
    }
    const foto = await clasificarBuffer(PNG.sync.write(fotoPng));
    if (foto.digito !== digito) {
      throw new Error(`el ejemplo invertido ${digito} se clasifico como ${foto.digito}`);
    }
    console.log(`${digito} confianza ${resultado.confianza.toFixed(3)}`);
  }
  console.log('pruebas ok');
}

probar().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
