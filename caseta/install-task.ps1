param([Parameter(Mandatory=$true)][string]$PythonPath)
$ErrorActionPreference = 'Stop'
if (!(Test-Path $PythonPath) -or !(Test-Path (Join-Path $PSScriptRoot 'config.json'))) {
    throw 'Se requiere la ruta absoluta de Python y config.json configurado.'
}
# Run from elevated PowerShell. Keep tokens and journal readable only by administrators/SYSTEM.
& icacls.exe $PSScriptRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron proteger los archivos de caseta.' }
$scriptPath = Join-Path $PSScriptRoot 'start-agent.ps1'
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '" -PythonPath "' + $PythonPath + '"'
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'MisionJardines-Caseta' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'MisionJardines-Caseta'
Write-Host 'Agente registrado para iniciar con Windows. Verifique el modo SIMULACION en la plataforma.'
