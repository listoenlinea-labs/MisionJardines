# Sustituye recuperar-conmutador.ps1; reutiliza la tarea existente.
$ErrorActionPreference = 'Stop'
$VBox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$VMName = 'conmutador'
$Base = 'C:\MisionJardines'
$Log = Join-Path $Base 'recuperacion.log'

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
try { $vm = Ensure-VM } catch { Write-Log 'ERROR: No se pudo iniciar o consultar VirtualBox' }

# Bloque independiente: reporta IP incluso si VirtualBox fallo.
try {
    $config = Get-Content (Join-Path $Base 'infraestructura.json') -Raw | ConvertFrom-Json
    if ($config.api -ne 'https://api-misionjardines.listoenlinea.host/api' -or
        [string]$config.token -notmatch '^[a-fA-F0-9]{64}$') {
        throw 'Configuracion de infraestructura invalida'
    }

    function Get-State($recover=$false) {
        $s=@{vm=$vm;asterisk=$null;agente=$null;grandstream=$null;zkteco=(Test-Tcp $config.zkLocal 4370)}
        $script:details=@{ubuntu=$config.ubuntu;zkLocal=$config.zkLocal;grandstream=$config.grandstream}
        if ($config.grandstream) { $s.grandstream=Test-Tcp $config.grandstream 80 }
        if ($vm -and $config.sshKey -and $config.knownHosts -and
            (Test-Path $config.sshKey) -and (Test-Path $config.knownHosts) -and (Test-Tcp $config.ubuntu 22)) {
            $command=if($recover){'recover'}else{'status'}
            try {
                $out=& ssh.exe -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$($config.knownHosts)" -i $config.sshKey "vboxuser@$($config.ubuntu)" $command
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
    function Send-State($s,$result=$null) {
        # Forzar IPv4 en ambas solicitudes sin modificar la red de Windows.
        $curl=(Get-Command curl.exe -CommandType Application -ErrorAction Stop).Source
        $ipOutput=& $curl -q -4 -f -sS --connect-timeout 5 --max-time 12 'https://api.ipify.org'
        $ipExit=$LASTEXITCODE
        if($ipExit -ne 0){throw "Consulta IPv4 fallida (curl $ipExit)"}
        $ip=($ipOutput -join '').Trim()
        if($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$'){throw 'No se obtuvo IPv4'}
        $body=@{ip=$ip;equipos=$s;resultado=$result;detalles=$script:details}|ConvertTo-Json -Depth 5 -Compress
        # Config por stdin: el token no aparece en argumentos ni archivos temporales.
        $escaped=$body.Replace('\','\\').Replace('"','\"')
        $curlConfig=@(
            ('header = "Authorization: Bearer '+$config.token+'"')
            'header = "Content-Type: application/json"'
            ('data-binary = "'+$escaped+'"')
        ) -join "`n"
        $output=@($curlConfig | & $curl -q -4 -sS --connect-timeout 10 --max-time 60 --request POST --config - --write-out '\n%{http_code}' ($config.api+'/infraestructura/agente'))
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
    $s=Get-State $true
    $response=Send-State $s
    if($response.orden){
        $action=$response.orden.accion
        if($action -in @('CONMUTADOR','TODOS')){
            try { $vm=Ensure-VM } catch { $vm=$false }
            $s=Get-State $true
        }else{$s=Get-State}
        $ok=switch($action){
            'CONMUTADOR' { $s.vm -and $s.asterisk -eq $true -and $s.agente -eq $true }
            'ZKTECO' { $s.zkteco -eq $true }
            'TODOS' { $s.vm -and $s.asterisk -eq $true -and $s.agente -eq $true -and $s.zkteco -eq $true }
            'DIAGNOSTICO' { $true }
            default { $false }
        }
        $response=Send-State $s @{id=$response.orden.id;ok=[bool]$ok}
    }
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
