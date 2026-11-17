# Clasificar dígitos del 0 al 9 con n8n

Demo local para Windows, en una laptop de 8 GB de RAM y sin tarjeta de video. Subes una o varias imágenes, un modelo pequeño dice qué número es, y n8n mueve cada archivo a la carpeta de ese dígito.

## Qué es n8n

n8n es un programa para armar procesos por pasos. Cada paso es un nodo en un lienzo: recibir un aviso, llamar a una dirección, leer un archivo, guardarlo en otro sitio. La edición que usa esta demo es la comunitaria, versión 2.47.7. No hace falta licencia ni cuenta de pago.

Aquí n8n no clasifica la imagen. Solo organiza el trabajo: lista los archivos, pide el número al modelo y guarda cada imagen en `imagenes/0` … `imagenes/9`.

## Qué hay en esta carpeta

| Ruta | Para qué sirve |
| --- | --- |
| `para-subir/` | Diez imágenes grandes, `numero-0.png` … `numero-9.png`. Estas son las que subes a mano para comprobar la demo. |
| `ejemplos/` | Los mismos números, en el tamaño original de 28×28. El botón **Usar ejemplos 0 a 9** los copia solo. |
| `imagenes/entrada/` | Bandeja. Las imágenes esperan aquí hasta que n8n las mueve. |
| `imagenes/0` … `imagenes/9` | Destino. El nombre de la carpeta es el dígito. |
| `modelos/mnist-8.onnx` | El modelo. Se descarga solo la primera vez. Pesa unos 26 KB. |
| `workflows/digitos.json` | El flujo que n8n importa. |
| `lib/clasificar.js` | Prepara la imagen y ejecuta el modelo. |
| `lib/servidor.js` | La página http://127.0.0.1:3456 |
| `iniciar.ps1` | Arranca el modelo, la página y n8n. |

## El modelo

Se usa **MNIST-8**, el clasificador clásico de dígitos escritos a mano, en formato ONNX.

- Ficha en Hugging Face: [amd/mnist-8](https://huggingface.co/amd/mnist-8). Si esa descarga falla, se usa la misma red publicada en el ONNX Model Zoo.
- Motor: `onnxruntime-node` 1.22.0, solo CPU. No usa la tarjeta de video.
- Entrada: una imagen en gris de 28×28.
- Salida: diez puntajes, uno por cada dígito del 0 al 9. Gana el más alto.
- Entrenado con números manuscritos. Un trazo parecido al de un cuaderno se clasifica bien. Una foto borrosa, un número impreso muy distinto o dos cifras en la misma imagen pueden fallar.

Antes de consultar al modelo, el programa deja la imagen en la forma que MNIST espera: si el fondo es claro, invierte los colores para que el trazo quede claro sobre fondo oscuro. Si la imagen ya mide 28×28, usa esos píxeles. Si es más grande, recorta el número, lo reduce para que quepa en 20 píxeles y lo centra en un cuadro de 28×28.

Las diez imágenes de `para-subir/` ya se probaron con este modelo y cada una da su propio dígito.

## El flujo

El flujo se llama **Clasificar digitos**. En esta computadora está en http://127.0.0.1:5678/workflow/ZEMXfldvbv5paFBV. En otra PC el enlace cambia; búscalo por el nombre.

| Nodo | Qué hace |
| --- | --- |
| Probar a mano | Lo disparas con el botón de ejecutar, dentro del lienzo de n8n. |
| Clasificar ahora | Lo dispara la página al pulsar **Subir y clasificar** o **Usar ejemplos 0 a 9**. |
| Listar entrada | Pide la lista de archivos que hay en `imagenes/entrada`. |
| Separar imagenes | Convierte esa lista en un archivo por paso, para poder subir varias a la vez. |
| Clasificar digito | Envía el nombre a http://127.0.0.1:3456/clasificar. El modelo responde el dígito, la confianza y la carpeta de destino. No mueve el archivo. |
| Leer imagen | n8n lee el archivo desde la bandeja. |
| Guardar en carpeta | n8n lo escribe en `imagenes/0` … `imagenes/9`, según el dígito. |
| Quitar de entrada | Borra el original solo cuando la copia ya está en la carpeta del dígito. |

n8n solo puede leer y escribir dentro de `imagenes`. Eso lo fija `N8N_RESTRICT_FILE_ACCESS_TO` en `iniciar.ps1`.

## Instalarlo en otra PC

Sirve en Windows 10 u 11, con unos 8 GB de RAM. Hace falta internet la primera vez. No hace falta Docker, Ollama ni una tarjeta de video.

El script descarga Node.js 24 dentro de `bin\` y lo usa solo para esta demo. El Node que ya tenga la PC, si hay otro, no se reemplaza. n8n 2.47.7 exige Node 24 o superior.

1. Copia esta carpeta a la otra PC. Puedes dejar fuera `node_modules`, `.n8n`, `bin` y `modelos`: se vuelven a crear. Lleva siempre `lib`, `workflows`, `package.json`, `package-lock.json` e `iniciar.ps1`.
2. Abre PowerShell en esa carpeta.
3. Instala los programas con el Node que ya tenga la PC:

```powershell
npm install
```

4. Arranca:

```powershell
.\iniciar.ps1
```

La primera vez el script hace esto, en orden:

1. Descarga Node.js 24 a `bin\node-v24.22.3-win-x64` si todavía no está.
2. Completa el binario de SQLite que usa n8n, si faltaba.
3. Descarga `modelos\mnist-8.onnx` y crea `ejemplos\`, `para-subir\` y las carpetas `imagenes\0` … `imagenes\9`.
4. Importa y publica el flujo **Clasificar digitos**.
5. Abre la página de la demo en el puerto 3456.
6. Abre n8n en el puerto 5678.

La primera visita a http://127.0.0.1:5678 pide crear el usuario dueño de n8n. Usa esa dirección, con `127.0.0.1`. Elige un correo y una contraseña y guárdalos: son de esta instalación. Puedes omitir el asistente y la lista de producción. El flujo ya queda importado.

Si al clasificar aparece un error de `onnxruntime_binding.node`, el paquete se instaló sin su binario. En la carpeta del proyecto ejecuta:

```powershell
node .\node_modules\onnxruntime-node\script\install.js
npm install onnxruntime-node@1.22.0
```

y vuelve a lanzar `.\iniciar.ps1`.

## Levantar la demo en esta PC

Cierra Docker Desktop si está abierto, para dejar RAM libre. En PowerShell, dentro de `G:\n8n`:

```powershell
.\iniciar.ps1
```

Deja esa ventana abierta. Cuando diga que n8n está listo:

- Página para subir imágenes: http://127.0.0.1:3456
- Lienzo de n8n: http://127.0.0.1:5678

Para apagar, cierra la ventana de PowerShell donde corre `iniciar.ps1` y la ventana del servidor de la demo.

## Comprobarlo subiendo las imágenes

1. Abre http://127.0.0.1:3456
2. En el selector de archivos entra a la carpeta `para-subir`.
3. Elige `numero-0.png` hasta `numero-9.png`. Puedes seleccionar las diez juntas.
4. Pulsa **Subir y clasificar**.
5. En la página, cada número debe aparecer dentro de la caja de su dígito. En el disco quedan en `imagenes\0\numero-0.png`, `imagenes\1\numero-1.png`, y así hasta el 9.

El botón **Usar ejemplos 0 a 9** hace la misma prueba con los archivos pequeños de `ejemplos\`, sin que tengas que elegirlos.

Para repetir la prueba del modelo sin abrir el navegador:

```powershell
.\bin\node-v24.22.3-win-x64\node.exe lib\probar.js
```

Tiene que terminar con `pruebas ok`.
