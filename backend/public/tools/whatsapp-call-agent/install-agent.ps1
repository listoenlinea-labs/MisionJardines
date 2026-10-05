param()

$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot 'whatsapp-call-agent.ps1'
if (-not (Test-Path $source)) {
    Write-Host 'No se encontró whatsapp-call-agent.ps1 en la misma carpeta.' -ForegroundColor Red
    exit 1
}

$installDir = Join-Path $env:LOCALAPPDATA 'MisionJardines\WhatsAppCallAgent'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$target = Join-Path $installDir 'whatsapp-call-agent.ps1'
Copy-Item -Force $source $target

$protocolRoot = 'HKCU:\Software\Classes\misionjardines-call'
New-Item -Force -Path $protocolRoot | Out-Null
Set-ItemProperty -Path $protocolRoot -Name '(default)' -Value 'URL:Mision Jardines WhatsApp Call'
New-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

$commandKey = Join-Path $protocolRoot 'shell\open\command'
New-Item -Force -Path $commandKey | Out-Null

$escapedTarget = $target.Replace('"', '\"')
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $escapedTarget + '" "%1"'
Set-ItemProperty -Path $commandKey -Name '(default)' -Value $command

Write-Host ''
Write-Host 'Agente de llamadas de Misión Jardines instalado correctamente.' -ForegroundColor Green
Write-Host 'Protocolo registrado: misionjardines-call://' -ForegroundColor Green
Write-Host ''
Write-Host 'IMPORTANTE:' -ForegroundColor Yellow
Write-Host '1. Deja WhatsApp para Windows vinculado únicamente a la cuenta de caseta 3337278609.'
Write-Host '2. La primera vez Chrome puede pedir permiso para abrir el agente; marca "Permitir siempre".'
Write-Host '3. WhatsApp debe tener permiso de micrófono en Windows.'
Write-Host ''
Read-Host 'Presiona Enter para cerrar'
