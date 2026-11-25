# Ejecutar elevado. Migra las dos tareas existentes al modo de dos horas.
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
$recoveryPath='C:\MisionJardines\recuperar-conmutador.ps1'
if(!(Test-Path -LiteralPath $recoveryPath)){throw 'No se encontro el script de recuperacion existente'}
if($original.State -eq 'Running'){throw 'La recuperacion esta en curso; vuelve a ejecutar cuando termine'}
$backup=Join-Path 'C:\MisionJardines' ('recuperar-conmutador.'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.bak.ps1')
Copy-Item -LiteralPath $recoveryPath -Destination $backup -ErrorAction Stop
# El instalador puede restaurar la versión y el disparador originales si falla.
$recoveryTrigger=New-ScheduledTaskTrigger -AtStartup
$recoveryTrigger.Delay='PT1M'
$recoveryTrigger.Repetition=(New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 2)).Repetition
$trigger=New-ScheduledTaskTrigger -AtStartup
$trigger.Delay='PT1M'
# Reinicio periódico si el proceso termina; IgnoreNew evita duplicados.
$repeat=(New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)).Repetition
$trigger.Repetition=$repeat
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$AgentPath+'" -Monitor')
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue}
try {
    Copy-Item -LiteralPath $AgentPath -Destination $recoveryPath -Force
    Set-ScheduledTask -TaskName $original.TaskName -TaskPath $original.TaskPath -Trigger $recoveryTrigger | Out-Null
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $name
    Start-ScheduledTask -TaskName $original.TaskName -TaskPath $original.TaskPath
    Write-Host 'Modo de dos horas instalado. Canal de ordenes activo y recuperacion programada cada 2 horas.'
} catch {
    Copy-Item -LiteralPath $backup -Destination $recoveryPath -Force
    Set-ScheduledTask -TaskName $original.TaskName -TaskPath $original.TaskPath -Trigger $original.Triggers | Out-Null
    throw
}
