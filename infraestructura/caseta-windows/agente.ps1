# Ejecutar con la misma cuenta de Windows que registró VirtualBox.
# No acepta comandos arbitrarios desde el servidor.
$ErrorActionPreference = 'Stop'
$base = 'C:\MisionJardines'
$config = Get-Content (Join-Path $base 'infraestructura.json') -Raw | ConvertFrom-Json
$vbox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$log = Join-Path $base 'infraestructura.log'
function Write-Log($message) { Add-Content $log "$(Get-Date -Format s) $message" }
function Test-Tcp($hostName,$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $a=$client.BeginConnect($hostName,$port,$null,$null)
    if (!$a.AsyncWaitHandle.WaitOne(1500)) { return $false }
    $client.EndConnect($a); return $true
  } catch { return $false } finally { $client.Dispose() }
}
function Get-State($recover=$false) {
  if ($recover) {
    # El script ya probado no reinicia una VM en marcha.
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File (Join-Path $base 'recuperar-conmutador.ps1')
  }
  $running = @(& $vbox list runningvms)
  $vm = [bool]($running -match '^"conmutador" ')
  $state = @{vm=$vm;asterisk=$null;agente=$null;grandstream=$null;zkteco=(Test-Tcp $config.zkLocal 4370)}
  if ($vm -and $config.sshKey -and (Test-Path $config.sshKey) -and (Test-Tcp $config.ubuntu 22)) {
    $command=if($recover){'recover'}else{'status'}
    try {
      $out=& ssh.exe -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$($config.knownHosts)" -i $config.sshKey "vboxuser@$($config.ubuntu)" $command
      if($LASTEXITCODE -eq 0){$s=($out -join '')|ConvertFrom-Json;$state.asterisk=[bool]$s.asterisk;$state.agente=[bool]$s.agente}
    } catch { Write-Log 'No se pudo consultar Ubuntu' }
  }
  return $state
}
function Send-State($state,$result=$null) {
  $ip=(Invoke-RestMethod 'https://api.ipify.org' -TimeoutSec 12).ToString().Trim()
  $body=@{ip=$ip;equipos=$state;resultado=$result}|ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod ($config.api.TrimEnd('/')+'/infraestructura/agente') -Method Post -Headers @{Authorization=('Bearer '+$config.token)} -ContentType 'application/json' -Body $body -TimeoutSec 60
}
try {
  $state=Get-State
  $response=Send-State $state
  if($response.orden){
    $action=$response.orden.accion
    if($action -in @('CONMUTADOR','TODOS')){
      $state=Get-State $true
    }else{$state=Get-State}
    $ok=switch($action){
      'CONMUTADOR' { $state.vm -and $state.asterisk -eq $true -and $state.agente -eq $true }
      'ZKTECO' { $state.zkteco -eq $true }
      'TODOS' { $state.vm -and $state.asterisk -eq $true -and $state.agente -eq $true -and $state.zkteco -eq $true }
      'DIAGNOSTICO' { $true }
      default { $false }
    }
    $null=Send-State $state @{id=$response.orden.id;ok=[bool]$ok}
  }
  Write-Log 'Reporte enviado'
} catch { Write-Log 'Error de comunicación o diagnóstico (reintento en siguiente tarea)'; exit 1 }
