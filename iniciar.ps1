$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Asegurar-Node24 {
  $carpeta = Join-Path $PSScriptRoot 'bin\node-v24.22.3-win-x64'
  $exe = Join-Path $carpeta 'node.exe'
  if (Test-Path $exe) { return $exe }
  New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'bin') | Out-Null
  $zip = Join-Path $PSScriptRoot 'bin\node24.zip'
  Write-Host 'Descargando Node.js 24 solo para n8n. El Node 22 del sistema no se toca.'
  Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.22.3/node-v24.22.3-win-x64.zip' -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath (Join-Path $PSScriptRoot 'bin') -Force
  Remove-Item $zip
  if (-not (Test-Path $exe)) { throw 'No se pudo preparar Node.js 24.' }
  return $exe
}

function Asegurar-Sqlite([string]$node) {
  $binario = Join-Path $PSScriptRoot 'node_modules\sqlite3\build\Release\node_sqlite3.node'
  if (Test-Path $binario) { return }
  Write-Host 'Instalando el binario de SQLite de n8n...'
  Push-Location (Join-Path $PSScriptRoot 'node_modules\sqlite3')
  & $node '..\prebuild-install\bin.js' -r napi
  Pop-Location
}

$node = Asegurar-Node24
Asegurar-Sqlite $node
& $node (Join-Path $PSScriptRoot 'lib\preparar.js')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el modelo de digitos.' }

$env:N8N_USER_FOLDER = Join-Path $PSScriptRoot '.n8n'
$env:N8N_PORT = '5678'
$env:N8N_PROTOCOL = 'http'
$env:N8N_SECURE_COOKIE = 'false'
$env:N8N_DIAGNOSTICS_ENABLED = 'false'
$env:N8N_PERSONALIZATION_ENABLED = 'false'
$env:N8N_HIRING_BANNER_ENABLED = 'false'
$env:N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = 'false'
$env:N8N_RESTRICT_FILE_ACCESS_TO = (Join-Path $PSScriptRoot 'imagenes')
$env:EXECUTIONS_DATA_PRUNE = 'true'
$env:EXECUTIONS_DATA_MAX_AGE = '48'
$env:PUERTO_DEMO = '3456'
$env:NODE_OPTIONS = '--max-old-space-size=1024'

$n8n = Join-Path $PSScriptRoot 'node_modules\n8n\bin\n8n'
$marca = Join-Path $env:N8N_USER_FOLDER 'flujo-listo.txt'
$lista = & $node $n8n list:workflow 2>&1 | Out-String
if ($lista -notmatch 'Clasificar digitos') {
  & $node $n8n import:workflow --input=(Join-Path $PSScriptRoot 'workflows\digitos.json')
  $lista = & $node $n8n list:workflow 2>&1 | Out-String
}
$activas = & $node $n8n list:workflow --active=true 2>&1 | Out-String
if ($activas -notmatch 'Clasificar digitos') {
  $id = [regex]::Match($lista, '(?m)^(\S+)\|Clasificar digitos\s*$').Groups[1].Value
  if (-not $id) { throw 'No pude publicar el flujo Clasificar digitos.' }
  & $node $n8n publish:workflow --id=$id
}
New-Item -ItemType Directory -Force -Path $env:N8N_USER_FOLDER | Out-Null
Set-Content -Path $marca -Value 'Clasificar digitos' -Encoding ascii

$salud = $false
try {
  $respuesta = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3456/salud' -TimeoutSec 2
  $salud = $respuesta.StatusCode -eq 200
} catch {
  $salud = $false
}
if (-not $salud) {
  Start-Process -FilePath $node -ArgumentList 'lib\servidor.js' -WorkingDirectory $PSScriptRoot -WindowStyle Normal
  Start-Sleep -Seconds 1
}

Write-Host ''
Write-Host 'Demo:  http://127.0.0.1:3456'
Write-Host 'n8n:   http://127.0.0.1:5678'
Write-Host 'Abre el flujo Clasificar digitos. La pagina sube varias imagenes y n8n las mueve a la carpeta 0-9.'
Write-Host ''

& $node $n8n start
