@echo off
setlocal
title Mision Jardines - Instalador de llamadas WhatsApp

set "BASE=https://api-misionjardines.listoenlinea.host/tools/whatsapp-call-agent"
set "TMPDIR=%TEMP%\MisionJardinesWhatsAppAgent"

if not exist "%TMPDIR%" mkdir "%TMPDIR%"

echo.
echo Descargando agente de llamadas Mision Jardines...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Invoke-WebRequest -UseBasicParsing '%BASE%/whatsapp-call-agent.ps1' -OutFile '%TMPDIR%\whatsapp-call-agent.ps1'; Invoke-WebRequest -UseBasicParsing '%BASE%/install-agent.ps1' -OutFile '%TMPDIR%\install-agent.ps1'"

if errorlevel 1 (
  echo.
  echo No fue posible descargar los archivos del agente.
  echo Verifica que esta computadora tenga acceso a Internet.
  pause
  exit /b 1
)

echo.
echo Instalando...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TMPDIR%\install-agent.ps1"

if errorlevel 1 (
  echo.
  echo La instalacion no pudo completarse.
  pause
  exit /b 1
)

echo.
echo Instalacion terminada.
endlocal
