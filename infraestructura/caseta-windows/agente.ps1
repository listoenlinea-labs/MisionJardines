# Sustituye recuperar-conmutador.ps1; reutiliza la tarea existente.
$ErrorActionPreference = 'Stop'
$VBox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$VM = 'conmutador'
$Base = 'C:\MisionJardines'
$Log = Join-Path $Base 'recuperacion.log'

function Write-Log($Message) {
    Add-Content -Path $Log -Value "$(Get-Date -Format s) - $Message"
}
function Ensure-VM {
    $info = & $VBox showvminfo $VM --machinereadable
    if ($LASTEXITCODE -ne 0) { throw 'No se encontro la maquina virtual' }
    $state = $info | Where-Object { $_ -match '^VMState=' }
    if ($state -eq 'VMState="running"') {
        Write-Log 'Ubuntu ya esta funcionando'
        return $true
    }
    if ($state -notin @('VMState="poweroff"','VMState="saved"','VMState="aborted"')) {
        throw "Estado inesperado: $state"
    }
    & $VBox startvm $VM --type headless | Out-Null
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
        $ip=(Invoke-RestMethod 'https://api.ipify.org' -TimeoutSec 12).ToString().Trim()
        $body=@{ip=$ip;equipos=$s;resultado=$result;detalles=$script:details}|ConvertTo-Json -Depth 5 -Compress
        Invoke-RestMethod ($config.api+'/infraestructura/agente') -Method Post -Headers @{Authorization=('Bearer '+$config.token)} -ContentType 'application/json' -Body $body -TimeoutSec 60 -MaximumRedirection 0
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
    Write-Log 'ERROR: No se pudo reportar infraestructura; se reintentara en la siguiente ejecucion.'
    exit 1
}
if (!$vm) { exit 1 }
exit 0
