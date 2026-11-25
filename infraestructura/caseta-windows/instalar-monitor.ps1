# Ejecutar en PowerShell como administrador. No modifica la tarea de recuperación.
param([string]$AgentPath='C:\MisionJardines\monitor-infraestructura.ps1')
$ErrorActionPreference='Stop'
$original=Get-ScheduledTask -TaskName 'Recuperar Conmutador Mision Jardines'
$name='Monitoreo Infraestructura Mision Jardines'
if(!(Test-Path -LiteralPath $AgentPath)){throw 'No se encontro el agente de monitoreo'}
$tokens=$null;$errors=$null
$null=[System.Management.Automation.Language.Parser]::ParseFile($AgentPath,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'El script de monitoreo contiene errores de sintaxis'}
if($original.Principal.LogonType -ne 'S4U'){throw 'La tarea original no usa S4U; configurar el monitor con la misma cuenta manualmente'}
$principal=New-ScheduledTaskPrincipal -UserId $original.Principal.UserId -LogonType S4U -RunLevel Highest
$trigger=New-ScheduledTaskTrigger -AtStartup
$trigger.Delay='PT1M'
# Reinicio periódico si el proceso termina; IgnoreNew evita duplicados.
$repeat=(New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)).Repetition
$trigger.Repetition=$repeat
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$AgentPath+'" -Monitor')
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue}
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host 'Monitor registrado. La tarea original de recuperacion sigue intacta.'
