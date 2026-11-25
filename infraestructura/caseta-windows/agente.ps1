# Recuperación programada cada 2 horas o canal ligero de órdenes (-Monitor).
param([switch]$Monitor)
$ErrorActionPreference = 'Stop'
$VBox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$VMName = 'conmutador'
$Base = 'C:\MisionJardines'
$Log = Join-Path $Base $(if($Monitor){'monitor.log'}else{'recuperacion.log'})

function Write-Log($Message) {
    Add-Content -Path $Log -Value "$(Get-Date -Format s) - $Message"
}
function Ensure-VM {
    $info = & $VBox showvminfo $VMName --machinereadable
    if ($LASTEXITCODE -ne 0) { throw 'No se encontro la maquina virtual' }
    $state = $info | Where-Object { $_ -match '^VMState=' }
    if ($state -eq 'VMState="running"') {
        Write-Log 'Ubuntu ya esta funcionando'
        return $true
    }
    if ($state -notin @('VMState="poweroff"','VMState="saved"','VMState="aborted"')) {
        throw "Estado inesperado: $state"
    }
    & $VBox startvm $VMName --type headless | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Error al iniciar VirtualBox' }
    Write-Log 'Maquina virtual iniciada correctamente'
    return $true
}
function Get-VMRunning {
    $info = & $VBox showvminfo $VMName --machinereadable
    if ($LASTEXITCODE -ne 0) { return $null }
    return [bool]($info -contains 'VMState="running"')
}
function Test-Tcp($hostName,$port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $a=$client.BeginConnect($hostName,$port,$null,$null)
        if (!$a.AsyncWaitHandle.WaitOne(1500)) { return $false }
        $client.EndConnect($a)
        return $true
    } catch { return $false } finally { $client.Dispose() }
}

# Bloque independiente: nunca depende de Hostinger ni de Internet.
$vm = $false
# La revisión se serializa entre ambas tareas mediante un mutex local.

# Bloque independiente: reporta IP incluso si VirtualBox fallo.
try {
    $config = Get-Content (Join-Path $Base 'infraestructura.json') -Raw | ConvertFrom-Json
    if ($config.api -ne 'https://api-misionjardines.listoenlinea.host/api' -or
        [string]$config.token -notmatch '^[a-fA-F0-9]{64}$') {
        throw 'Configuracion de infraestructura invalida'
    }

    function Get-State($recover=$false) {
        $s=@{vm=$vm;asterisk=$null;agente=$null;grandstream=$null;zkteco=(Test-Tcp $config.zkLocal 4370)}
        $script:details=@{ubuntu=$config.ubuntu;zkLocal=$config.zkLocal;grandstream=$config.grandstream;ubuntuAccesible=$null}
        if ($vm) { $script:details.ubuntuAccesible=Test-Tcp $config.ubuntu 22 }
        if ($config.grandstream) { $s.grandstream=Test-Tcp $config.grandstream 80 }
        if ($vm -and $config.sshKey -and $config.knownHosts -and
            (Test-Path $config.sshKey) -and (Test-Path $config.knownHosts) -and ($script:details.ubuntuAccesible -eq $true)) {
            $command=if($recover){'recover'}else{'status'}
            try {
                $out=& ssh.exe -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=5 -o ServerAliveInterval=3 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$($config.knownHosts)" -i $config.sshKey "vboxuser@$($config.ubuntu)" $command
                if($LASTEXITCODE -eq 0){
                    $r=($out -join '')|ConvertFrom-Json
                    $s.asterisk=[bool]$r.asterisk
                    $s.agente=[bool]$r.agente
                    foreach($key in @('asteriskEnabled','agenteEnabled','asteriskCli','sip6001','sip6002','erroresAsterisk','erroresAgente')) {
                        $script:details[$key]=$r.$key
                    }
                }
            } catch { Write-Log 'No se pudo consultar Ubuntu' }
        }
        return $s
    }
    function Send-State($s,$result=$null,$confirmation=$null) {
        # Forzar IPv4 en ambas solicitudes sin modificar la red de Windows.
        $curl=(Get-Command curl.exe -CommandType Application -ErrorAction Stop).Source
        $ipOutput=& $curl -q -4 -f -sS --connect-timeout 5 --max-time 12 'https://api.ipify.org'
        if($LASTEXITCODE -ne 0){throw 'Consulta IPv4 fallida'}
        $ip=($ipOutput -join '').Trim()
        if($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$'){throw 'No se obtuvo IPv4'}
        $body=@{ip=$ip;equipos=$s;resultado=$result;detalles=$script:details;monitor=$true;economico=$true;confirmacion=$confirmation}|ConvertTo-Json -Depth 5 -Compress
        # Config por stdin: el token no aparece en argumentos ni archivos temporales.
        $escaped=$body.Replace('\','\\').Replace('"','\"')
        $curlConfig=@(
            ('header = "Authorization: Bearer '+$config.token+'"')
            'header = "Content-Type: application/json"'
            ('data-binary = "'+$escaped+'"')
        ) -join "`n"
        $maxTime=60
        $output=@($curlConfig | & $curl -q -4 -sS --connect-timeout 10 --max-time $maxTime --request POST --config - --write-out '\n%{http_code}' ($config.api+'/infraestructura/agente'))
        $curlExit=$LASTEXITCODE
        if($curlExit -ne 0){throw "Reporte IPv4 fallido (curl $curlExit)"}
        if($output.Count -lt 2 -or $output[-1] -notmatch '^\d{3}$'){throw 'Respuesta HTTP incompleta'}
        $http=[int]$output[-1]
        $payload=$output[0..($output.Count-2)] -join ''
        if($http -lt 200 -or $http -ge 300){
            Write-Log ("Codigo HTTP: "+$http)
            try {
                $diagnostico=$payload|ConvertFrom-Json
                if($diagnostico.motivo -in @('IP_REPORTADA_INVALIDA','ORIGEN_NO_IPV4_PUBLICA','IP_NO_COINCIDE')){
                    Write-Log ("Validacion IP: "+$diagnostico.motivo)
                }
            } catch { }
            throw "Reporte rechazado (HTTP $http)"
        }
        $response=$payload|ConvertFrom-Json
        if($response.ok -ne $true){throw 'Reporte no confirmado por el servidor'}
        return $response
    }
    function Get-Control {
        # Solo consulta órdenes: no toca equipos, no consulta ipify, no escribe muestras.
        $curl=(Get-Command curl.exe -CommandType Application -ErrorAction Stop).Source
        $cfg='header = "Authorization: Bearer '+$config.token+'"'
        $out=@($cfg | & $curl -q -4 -f -sS --connect-timeout 5 --max-time 40 --config - ($config.api+'/infraestructura/agente/control'))
        if($LASTEXITCODE -ne 0){throw 'Canal de ordenes no disponible'}
        $control=($out -join '')|ConvertFrom-Json
        if($control.ok -ne $true){throw 'Canal de ordenes sin confirmacion'}
        return $control
    }
    function Invoke-Sample($recover,$order=$null,$confirmation=$null) {
        $mutex=New-Object System.Threading.Mutex($false,'Global\MJInfraSample')
        $locked=$false
        try {
            try {$locked=$mutex.WaitOne(90000)} catch [System.Threading.AbandonedMutexException] {$locked=$true}
            if(!$locked){throw 'Otra revision de infraestructura sigue ejecutandose'}
            $script:vm=$null
            try {
                if($recover){$script:vm=Ensure-VM}else{$script:vm=Get-VMRunning}
            } catch {Write-Log 'No se pudo consultar o iniciar VirtualBox'}
            $s=Get-State $recover
            $result=$null
            if($order){
                $ok=switch($order.accion){
                    'CONMUTADOR' { $s.vm -and $s.asterisk -eq $true -and $s.agente -eq $true }
                    'ZKTECO' { $s.zkteco -eq $true }
                    'TODOS' { $s.vm -and $s.asterisk -eq $true -and $s.agente -eq $true -and $s.zkteco -eq $true }
                    'DIAGNOSTICO' { $true }
                    default { $false }
                }
                $result=@{id=$order.id;ok=[bool]$ok}
            }
            return Send-State $s $result $confirmation
        } finally {
            if($locked){$mutex.ReleaseMutex()}
            $mutex.Dispose()
        }
    }
    if($Monitor){
        # Espera saliente acotada; no hay diagnósticos periódicos en este proceso.
        $previousFailure=$false
        while($true){
            try {
                $cycle=[Diagnostics.Stopwatch]::StartNew()
                $control=Get-Control
                if($control.orden -or $control.solicitarMuestra){
                    $recover=$control.orden -and $control.orden.accion -in @('CONMUTADOR','TODOS')
                    $null=Invoke-Sample $recover $control.orden $control.solicitarMuestra
                }
                if($previousFailure){Write-Log 'Canal de ordenes restablecido'}
                $previousFailure=$false
                # Evitar bucle rápido si el proxy devuelve inmediatamente sin órdenes.
                if(!$control.orden -and !$control.solicitarMuestra -and $cycle.ElapsedMilliseconds -lt 20000){
                    Start-Sleep -Milliseconds (20000-[int]$cycle.ElapsedMilliseconds)
                }
            } catch {
                if(!$previousFailure){Write-Log 'ERROR: canal de ordenes sin comunicacion'}
                $previousFailure=$true
                Start-Sleep -Seconds 30
            }
        }
    }
    # La tarea original recupera localmente aun cuando Hostinger no responda.
    $response=Invoke-Sample $true
    if($response.zktecoConfirmado){
        Write-Log "ZKTeco verificado desde Hostinger. IP en uso: $($response.ipEnUso)"
    }elseif(!$response.automatico){
        Write-Log 'Reporte enviado. IP dinamica deshabilitada (modo de prueba).'
    }else{
        Write-Log 'Reporte enviado. ZKTeco pendiente de verificacion.'
    }
} catch {
    $failure = $_
    Write-Log ('ERROR infraestructura: ' + $failure.Exception.GetType().Name)
    if ($failure.Exception.Response) {
        Write-Log ('Codigo HTTP: ' + [int]$failure.Exception.Response.StatusCode)
    }
    if ($failure.ErrorDetails.Message) {
        try {
            $diagnostico = $failure.ErrorDetails.Message | ConvertFrom-Json
            if ($diagnostico.motivo -in @('IP_REPORTADA_INVALIDA','ORIGEN_NO_IPV4_PUBLICA','IP_NO_COINCIDE')) {
                Write-Log ('Validacion IP: ' + $diagnostico.motivo)
            }
        } catch { }
    }
    Write-Log 'Se reintentara en la siguiente ejecucion.'
    exit 1
}
if (!$vm) { exit 1 }
exit 0
