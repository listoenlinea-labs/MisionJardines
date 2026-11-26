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
# Preservar el XML original (incluye principal S4U, acciones y condiciones).
# RestartOnFailure es opcional, pero Count e Interval son obligatorios si existe.
# Quitar el nodo entero evita HRESULT 0x80041319 al serializar Count=0.
$originalXml=Export-ScheduledTask -TaskName $original.TaskName -TaskPath $original.TaskPath
[xml]$recoveryXml=$originalXml
$boot=$recoveryXml.SelectSingleNode("/*[local-name()='Task']/*[local-name()='Triggers']/*[local-name()='BootTrigger']")
if(!$boot -or $recoveryXml.SelectNodes("/*[local-name()='Task']/*[local-name()='Triggers']/*").Count -ne 1){throw 'Se esperaba un unico disparador de inicio; no se modifico la tarea'}
$repetition=$boot.SelectSingleNode("*[local-name()='Repetition']")
if(!$repetition){throw 'No se encontro la repeticion de la tarea original'}
$interval=$repetition.SelectSingleNode("*[local-name()='Interval']")
if(!$interval){throw 'No se encontro el intervalo de la tarea original'}
$interval.InnerText='PT2H'
$duration=$repetition.SelectSingleNode("*[local-name()='Duration']")
if($duration){$null=$repetition.RemoveChild($duration)}
$stop=$repetition.SelectSingleNode("*[local-name()='StopAtDurationEnd']")
if($stop){$stop.InnerText='false'}
foreach($retry in @($recoveryXml.SelectNodes("/*[local-name()='Task']/*[local-name()='Settings']/*[local-name()='RestartOnFailure']"))){$null=$retry.ParentNode.RemoveChild($retry)}
$originalXml | Set-Content -LiteralPath ($backup+'.xml') -Encoding Unicode
$trigger=New-ScheduledTaskTrigger -AtStartup
$trigger.Delay='PT1M'
# Reinicio periódico si el proceso termina; IgnoreNew evita duplicados.
$repeat=(New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)).Repetition
$trigger.Repetition=$repeat
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$AgentPath+'" -Monitor')
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$recoveryRegistered=$false
try {
    Copy-Item -LiteralPath $AgentPath -Destination $recoveryPath -Force
    Register-ScheduledTask -TaskName $original.TaskName -TaskPath $original.TaskPath -Xml $recoveryXml.OuterXml -Force | Out-Null
    $recoveryRegistered=$true
    if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue}
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $name
    Start-ScheduledTask -TaskName $original.TaskName -TaskPath $original.TaskPath
    Write-Host 'Modo de dos horas instalado. Canal de ordenes activo y recuperacion programada cada 2 horas.'
} catch {
    $failure=$_
    Copy-Item -LiteralPath $backup -Destination $recoveryPath -Force
    if($recoveryRegistered){
        try {Register-ScheduledTask -TaskName $original.TaskName -TaskPath $original.TaskPath -Xml $originalXml -Force | Out-Null}
        catch {Write-Warning 'No se pudo restaurar la tarea; revisar el respaldo XML antes de continuar'}
    }
    throw $failure
}
